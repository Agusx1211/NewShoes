package agentbridge

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

const eventSnapshotBaseline = `{
  "ok":true,"snapshotId":1,"frame":10,"observationMode":"camera",
  "game":{"mode":"skirmish","playable":true,"endFrame":0,"outcome":null},
  "localPlayerIndex":0,
  "players":[
    {"index":0,"name":"Local","side":"America","local":true,"relationship":"allies","active":true,
      "economy":{"money":1000,"powerProduction":10,"powerConsumption":5,"powerSufficient":true,"rank":1,"skillPoints":0,"sciencePurchasePoints":0}},
    {"index":1,"name":"Easy Army","side":"GLA","local":false,"relationship":"enemies","active":true,"economy":null}
  ],
  "objects":[
    {"id":1,"template":"AmericaTankCrusader","owner":0,"relationship":"allies","position":[10,20,0],"health":[100,100],"construction":1,"status":[]}
  ],
  "objectCapabilities":{"1":{"commandState":{},"productionQueue":[]}},
  "truncated":false
}`

const eventSnapshotCombat = `{
  "ok":true,"snapshotId":2,"frame":20,"observationMode":"camera",
  "game":{"mode":"skirmish","playable":true,"endFrame":0,"outcome":null},
  "localPlayerIndex":0,
  "players":[
    {"index":0,"name":"Local","side":"America","local":true,"relationship":"allies","active":true,
      "economy":{"money":900,"powerProduction":10,"powerConsumption":5,"powerSufficient":true,"rank":1,"skillPoints":0,"sciencePurchasePoints":0}},
    {"index":1,"name":"Easy Army","side":"GLA","local":false,"relationship":"enemies","active":true,"economy":null}
  ],
  "objects":[
    {"id":1,"template":"AmericaTankCrusader","owner":0,"relationship":"allies","position":[10,20,0],"health":[75,100],"construction":1,"status":[]},
    {"id":2,"template":"GLATankScorpion","owner":1,"relationship":"enemies","position":[30,40,0],"health":[100,100],"construction":1,"status":["attacking"]}
  ],
  "objectCapabilities":{"1":{"commandState":{},"productionQueue":[]},"2":{"commandState":{},"productionQueue":[]}},
  "truncated":false
}`

const eventSnapshotVictory = `{
  "ok":true,"snapshotId":3,"frame":30,"observationMode":"camera",
  "game":{"mode":"skirmish","playable":true,"endFrame":30,"outcome":"victory"},
  "localPlayerIndex":0,
  "players":[
    {"index":0,"name":"Local","side":"America","local":true,"relationship":"allies","active":true,
      "economy":{"money":900,"powerProduction":10,"powerConsumption":5,"powerSufficient":true,"rank":1,"skillPoints":0,"sciencePurchasePoints":0}},
    {"index":1,"name":"Easy Army","side":"GLA","local":false,"relationship":"enemies","active":false,"economy":null}
  ],
  "objects":[
    {"id":1,"template":"AmericaTankCrusader","owner":0,"relationship":"allies","position":[10,20,0],"health":[75,100],"construction":1,"status":[]}
  ],
  "objectCapabilities":{"1":{"commandState":{},"productionQueue":[]}},
  "truncated":false
}`

type sseTestMessage struct {
	ID    uint64
	Event string
	Data  json.RawMessage
}

func readSSETestMessage(t *testing.T, reader *bufio.Reader) sseTestMessage {
	t.Helper()
	for {
		var message sseTestMessage
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				t.Fatalf("read SSE event: %v", err)
			}
			line = strings.TrimSuffix(strings.TrimSuffix(line, "\n"), "\r")
			if line == "" {
				break
			}
			switch {
			case strings.HasPrefix(line, "id: "):
				message.ID, err = strconv.ParseUint(strings.TrimPrefix(line, "id: "), 10, 64)
				if err != nil {
					t.Fatalf("parse SSE ID: %v", err)
				}
			case strings.HasPrefix(line, "event: "):
				message.Event = strings.TrimPrefix(line, "event: ")
			case strings.HasPrefix(line, "data: "):
				message.Data = append(message.Data, strings.TrimPrefix(line, "data: ")...)
			}
		}
		if message.Event != "" {
			return message
		}
	}
}

func TestTacticalEventStreamIsIdleResumableAndCoalesced(t *testing.T) {
	bridge, err := NewServer(Config{
		EngineToken:             "engine-secret",
		APIToken:                "api-secret",
		RequestTimeout:          time.Second,
		EventPollInterval:       10 * time.Millisecond,
		EventCapabilityInterval: 10 * time.Millisecond,
		EventCoalesceWindow:     20 * time.Millisecond,
		EventIdleTimeout:        time.Second,
		EventHeartbeatInterval:  time.Second,
		EventReplayLimit:        32,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer bridge.Close()
	httpServer := httptest.NewServer(bridge.Handler())
	defer httpServer.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx,
		"ws"+strings.TrimPrefix(httpServer.URL, "http")+"/engine",
		&websocket.DialOptions{Subprotocols: []string{WebSocketProtocol}})
	if err != nil {
		t.Fatal(err)
	}
	defer conn.CloseNow()
	if err := wsjson.Write(ctx, conn, protocolMessage{
		Type: "hello", Protocol: ProtocolVersion, Token: "engine-secret",
		SessionID: "event-match", Capabilities: []string{"world.snapshot"},
	}); err != nil {
		t.Fatal(err)
	}
	var hello protocolMessage
	if err := wsjson.Read(ctx, conn, &hello); err != nil || !hello.OK {
		t.Fatalf("engine hello: %#v, %v", hello, err)
	}

	snapshots := []json.RawMessage{
		json.RawMessage(eventSnapshotBaseline),
		json.RawMessage(eventSnapshotCombat),
		json.RawMessage(eventSnapshotVictory),
	}
	var requestCount atomic.Int64
	engineError := make(chan error, 1)
	go func() {
		for {
			var request protocolMessage
			if err := wsjson.Read(ctx, conn, &request); err != nil {
				return
			}
			var args struct {
				Mode                string `json:"mode"`
				Detail              string `json:"detail"`
				IncludeCapabilities bool   `json:"includeCapabilities"`
			}
			if request.Type != "request" || request.Op != "world.snapshot" ||
				json.Unmarshal(request.Args, &args) != nil || args.Mode != "camera" ||
				args.Detail != "tactical" {
				engineError <- &testError{"unexpected event watcher request"}
				return
			}
			index := int(requestCount.Add(1)) - 1
			if index >= len(snapshots) {
				index = len(snapshots) - 1
			}
			if err := wsjson.Write(ctx, conn, protocolMessage{
				Type: "response", ID: request.ID, OK: true, Result: snapshots[index],
			}); err != nil {
				engineError <- err
				return
			}
		}
	}()

	select {
	case err := <-engineError:
		t.Fatal(err)
	case <-time.After(40 * time.Millisecond):
	}
	if requestCount.Load() != 0 {
		t.Fatalf("event watcher polled without a subscriber: %d calls", requestCount.Load())
	}

	openStream := func(lastEventID string) (*http.Response, *bufio.Reader) {
		t.Helper()
		request, err := http.NewRequestWithContext(ctx, http.MethodGet,
			httpServer.URL+"/v1/sessions/event-match/events?mode=camera", nil)
		if err != nil {
			t.Fatal(err)
		}
		request.Header.Set("Authorization", "Bearer api-secret")
		if lastEventID != "" {
			request.Header.Set("Last-Event-ID", lastEventID)
		}
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		if response.StatusCode != http.StatusOK || response.Header.Get("Content-Type") != "text/event-stream" {
			response.Body.Close()
			t.Fatalf("unexpected event response: %d %q", response.StatusCode, response.Header.Get("Content-Type"))
		}
		return response, bufio.NewReader(response.Body)
	}

	firstResponse, firstReader := openStream("")
	if message := readSSETestMessage(t, firstReader); message.Event != "stream.open" {
		t.Fatalf("first event = %q", message.Event)
	}
	var baseline tacticalEvent
	for baseline.Type != "stream.baseline" {
		message := readSSETestMessage(t, firstReader)
		if err := json.Unmarshal(message.Data, &baseline); err != nil {
			t.Fatal(err)
		}
	}
	if baseline.Cursor == 0 || baseline.ObservationMode != "camera" {
		t.Fatalf("unexpected baseline: %#v", baseline)
	}
	firstResponse.Body.Close()

	deadline := time.Now().Add(time.Second)
	for requestCount.Load() < 3 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if requestCount.Load() < 3 {
		t.Fatalf("watcher did not continue during resume grace period: %d calls", requestCount.Load())
	}
	time.Sleep(30 * time.Millisecond)

	resumedResponse, resumedReader := openStream(strconv.FormatUint(baseline.Cursor, 10))
	defer resumedResponse.Body.Close()
	if message := readSSETestMessage(t, resumedReader); message.Event != "stream.open" {
		t.Fatalf("resume first event = %q", message.Event)
	}
	wanted := map[string]bool{
		"combat.damage": false, "enemy.spotted": false, "economy.changed": false,
		"player.eliminated": false, "game.outcome": false,
	}
	lastCursor := baseline.Cursor
	for readCount := 0; readCount < 16; readCount++ {
		message := readSSETestMessage(t, resumedReader)
		if message.ID <= lastCursor {
			t.Fatalf("event cursor did not increase: %d after %d", message.ID, lastCursor)
		}
		lastCursor = message.ID
		if _, exists := wanted[message.Event]; exists {
			wanted[message.Event] = true
		}
		if message.Event == "game.outcome" {
			var event tacticalEvent
			if err := json.Unmarshal(message.Data, &event); err != nil {
				t.Fatal(err)
			}
			if !event.Wake || event.Severity != severityCritical || event.Details["outcome"] != "victory" {
				t.Fatalf("unexpected terminal event: %#v", event)
			}
		}
		complete := true
		for _, observed := range wanted {
			complete = complete && observed
		}
		if complete {
			break
		}
	}
	for eventType, observed := range wanted {
		if !observed {
			t.Errorf("did not observe %s", eventType)
		}
	}
	select {
	case err := <-engineError:
		t.Fatal(err)
	default:
	}
}

func TestEventReplayReportsOverflow(t *testing.T) {
	stream := newEventStream(nil, "unrestricted", eventRuntimeConfig{replayLimit: 2})
	for index := 1; index <= 4; index++ {
		stream.pending[strconv.Itoa(index)] = &tacticalEvent{
			Type: "test.event", Severity: severityInfo, Frame: uint64(index),
		}
		stream.flushPending()
	}
	replay := stream.after(1)
	if !replay.overflow || replay.current != 4 || replay.oldest != 3 || len(replay.events) != 0 {
		t.Fatalf("unexpected replay state: %#v", replay)
	}
	if replay := stream.after(3); replay.overflow || len(replay.events) != 1 || replay.events[0].Cursor != 4 {
		t.Fatalf("unexpected resumable replay: %#v", replay)
	}
	stream.gapCursor = 5
	stream.nextCursor = 5
	if replay := stream.after(4); !replay.stale {
		t.Fatalf("idle observation gap did not require resync: %#v", replay)
	}
	if replay := stream.after(5); replay.stale {
		t.Fatalf("post-resync cursor remained stale: %#v", replay)
	}
}

func TestMissingEnemyIsLostSightNotDestroyed(t *testing.T) {
	var previous, current eventWorldSnapshot
	if err := json.Unmarshal([]byte(eventSnapshotCombat), &previous); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal([]byte(eventSnapshotVictory), &current); err != nil {
		t.Fatal(err)
	}
	events := diffEventSnapshots(&previous, &current)
	observedLostSight := false
	for _, event := range events {
		if event.Type == "object.destroyed" && containsObjectID(event.ObjectIDs, 2) {
			t.Fatal("fog-safe diff claimed destruction for a missing enemy")
		}
		if event.Type == "object.lostSight" && containsObjectID(event.ObjectIDs, 2) {
			observedLostSight = true
		}
	}
	if !observedLostSight {
		t.Fatal("missing enemy did not produce a lost-sight event")
	}
}

func TestEventFilterValidationAndMatching(t *testing.T) {
	bridge, err := NewServer(Config{EngineToken: "engine", APIToken: "api"})
	if err != nil {
		t.Fatal(err)
	}
	defer bridge.Close()
	for _, path := range []string{
		"/v1/sessions/missing/events?minSeverity=loud",
		"/v1/sessions/missing/events?wakeOnly=maybe",
		"/v1/sessions/missing/events?relationships=friend",
		"/v1/sessions/missing/events?minX=0&minY=0&maxX=10",
		"/v1/sessions/missing/events?after=abc",
	} {
		request := httptest.NewRequest(http.MethodGet, path, nil)
		request.Header.Set("Authorization", "Bearer api")
		recorder := httptest.NewRecorder()
		bridge.Handler().ServeHTTP(recorder, request)
		if recorder.Code != http.StatusBadRequest {
			t.Errorf("%s status = %d", path, recorder.Code)
		}
	}

	request := httptest.NewRequest(http.MethodGet,
		"/events?types=combat.damage,game.outcome&minSeverity=warning&wakeOnly=true&relationships=self&objectIds=7&minX=0&minY=0&maxX=100&maxY=100", nil)
	filter, err := parseEventFilter(request)
	if err != nil {
		t.Fatal(err)
	}
	event := tacticalEvent{
		Type: "combat.damage", Severity: severityWarning, Wake: true,
		Relationship: "self", ObjectIDs: []int64{7},
		Area: &eventArea{MinX: 10, MinY: 20, MaxX: 10, MaxY: 20},
	}
	if !filter.accepts(event) {
		t.Fatal("valid event did not match the filter")
	}
	if filter.wantsCapabilities() {
		t.Fatal("combat-only filter unnecessarily requested capability snapshots")
	}
	event.Wake = false
	if filter.accepts(event) {
		t.Fatal("wake-only filter accepted a non-wake event")
	}
}
