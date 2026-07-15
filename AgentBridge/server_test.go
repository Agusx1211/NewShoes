package agentbridge

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

func TestRESTForwardsUISnapshotToAuthenticatedEngine(t *testing.T) {
	bridge, err := NewServer(Config{
		EngineToken:    "engine-secret",
		APIToken:       "api-secret",
		RequestTimeout: time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer bridge.Close()
	httpServer := httptest.NewServer(bridge.Handler())
	defer httpServer.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	wsURL := "ws" + strings.TrimPrefix(httpServer.URL, "http") + "/engine"
	conn, _, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{
		Subprotocols: []string{WebSocketProtocol},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer conn.CloseNow()
	if err := wsjson.Write(ctx, conn, protocolMessage{
		Type:         "hello",
		Protocol:     ProtocolVersion,
		Token:        "engine-secret",
		SessionID:    "match-one",
		PlayMode:     PlayModeGlobal,
		Capabilities: []string{"ui.snapshot"},
	}); err != nil {
		t.Fatal(err)
	}
	var hello protocolMessage
	if err := wsjson.Read(ctx, conn, &hello); err != nil {
		t.Fatal(err)
	}
	if !hello.OK || hello.Protocol != ProtocolVersion {
		t.Fatalf("unexpected hello: %#v", hello)
	}

	engineDone := make(chan error, 1)
	go func() {
		var request protocolMessage
		if err := wsjson.Read(ctx, conn, &request); err != nil {
			engineDone <- err
			return
		}
		if request.Type != "request" || request.Op != "ui.snapshot" {
			engineDone <- &testError{"unexpected request"}
			return
		}
		if err := wsjson.Write(ctx, conn, protocolMessage{
			Type:   "response",
			ID:     request.ID,
			OK:     true,
			Result: json.RawMessage(`{"ok":true,"windows":[{"id":42}]}`),
		}); err != nil {
			engineDone <- err
			return
		}

		if err := wsjson.Read(ctx, conn, &request); err != nil {
			engineDone <- err
			return
		}
		var point pointerPosition
		if request.Type != "request" || request.Op != "input.pointerMove" ||
			json.Unmarshal(request.Args, &point) != nil || point.X != 32 || point.Y != 96 {
			engineDone <- &testError{"unexpected pointer request"}
			return
		}
		if err := wsjson.Write(ctx, conn, protocolMessage{
			Type:   "response",
			ID:     request.ID,
			OK:     true,
			Result: json.RawMessage(`{"ok":true,"x":32,"y":96}`),
		}); err != nil {
			engineDone <- err
			return
		}

		if err := wsjson.Read(ctx, conn, &request); err != nil {
			engineDone <- err
			return
		}
		var world struct {
			Mode                string `json:"mode"`
			Detail              string `json:"detail"`
			IncludeCapabilities bool   `json:"includeCapabilities"`
		}
		if request.Type != "request" || request.Op != "world.snapshot" ||
			json.Unmarshal(request.Args, &world) != nil || world.Mode != "unrestricted" ||
			world.Detail != "tactical" || !world.IncludeCapabilities {
			engineDone <- &testError{"unexpected world request"}
			return
		}
		if err := wsjson.Write(ctx, conn, protocolMessage{
			Type:   "response",
			ID:     request.ID,
			OK:     true,
			Result: json.RawMessage(`{"ok":true,"frame":77,"observationMode":"unrestricted"}`),
		}); err != nil {
			engineDone <- err
			return
		}

		if err := wsjson.Read(ctx, conn, &request); err != nil {
			engineDone <- err
			return
		}
		var terrain struct {
			Mode    string  `json:"mode"`
			MinX    float64 `json:"minX"`
			MinY    float64 `json:"minY"`
			MaxX    float64 `json:"maxX"`
			MaxY    float64 `json:"maxY"`
			Columns int64   `json:"columns"`
			Rows    int64   `json:"rows"`
		}
		if request.Type != "request" || request.Op != "terrain.query" ||
			json.Unmarshal(request.Args, &terrain) != nil || terrain.Mode != "unrestricted" ||
			terrain.MinX != 0 || terrain.MinY != 10 || terrain.MaxX != 100 || terrain.MaxY != 90 ||
			terrain.Columns != 16 || terrain.Rows != 8 {
			engineDone <- &testError{"unexpected terrain request"}
			return
		}
		if err := wsjson.Write(ctx, conn, protocolMessage{
			Type:   "response",
			ID:     request.ID,
			OK:     true,
			Result: json.RawMessage(`{"ok":true,"columns":16,"rows":8,"knownCount":64}`),
		}); err != nil {
			engineDone <- err
			return
		}

		if err := wsjson.Read(ctx, conn, &request); err != nil {
			engineDone <- err
			return
		}
		var minimap struct {
			Columns int64 `json:"columns"`
			Rows    int64 `json:"rows"`
		}
		if request.Type != "request" || request.Op != "minimap.snapshot" ||
			json.Unmarshal(request.Args, &minimap) != nil || minimap.Columns != 24 || minimap.Rows != 12 {
			engineDone <- &testError{"unexpected minimap request"}
			return
		}
		if err := wsjson.Write(ctx, conn, protocolMessage{
			Type: "response", ID: request.ID, OK: true,
			Result: json.RawMessage(`{"ok":true,"available":true,"columns":24,"rows":12}`),
		}); err != nil {
			engineDone <- err
			return
		}

		expected := []struct {
			op   string
			args string
		}{
			{"hud.snapshot", `{}`},
			{"chat.send", `{"text":"Attack now","audience":"allies"}`},
			{"game.select", `{"objectIds":[3,7]}`},
			{"game.order", `{"action":"attackMove","objectIds":[3,7],"position":{"x":500,"y":750}}`},
			{"game.order", `{"action":"move","objectIds":[3],"position":{"x":510,"y":760}}`},
			{"game.order", `{"action":"move","objectIds":[7],"position":{"x":510,"y":760}}`},
			{"game.context", `{"objectIds":[3,7],"targetId":11}`},
			{"game.command", `{"sourceId":9,"command":"Command_ConstructChinaPowerPlant","position":{"x":120,"y":240},"angle":1.25}`},
			{"camera.lookAt", `{"x":400,"y":300}`},
			{"camera.setView", `{"angle":0.5,"zoom":0.8}`},
			{"ui.submit", `{"windowId":23,"name":"LanLobbyMenu.wnd:TextEntryChat"}`},
			{"ui.setValue", `{"windowId":17,"name":"Options.wnd:VolumeSlider","value":73}`},
			{"ui.selectTab", `{"windowId":19,"name":"Options.wnd:Tabs","index":2}`},
		}
		for _, want := range expected {
			if err := wsjson.Read(ctx, conn, &request); err != nil {
				engineDone <- err
				return
			}
			var gotArgs any
			var wantArgs any
			if request.Type != "request" || request.Op != want.op ||
				json.Unmarshal(request.Args, &gotArgs) != nil || json.Unmarshal([]byte(want.args), &wantArgs) != nil ||
				!reflect.DeepEqual(gotArgs, wantArgs) {
				engineDone <- &testError{"unexpected gameplay request"}
				return
			}
			if err := wsjson.Write(ctx, conn, protocolMessage{
				Type: "response", ID: request.ID, OK: true,
				Result: json.RawMessage(`{"ok":true,"accepted":true}`),
			}); err != nil {
				engineDone <- err
				return
			}
		}
		engineDone <- nil
	}()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet,
		httpServer.URL+"/v1/sessions/match-one/ui", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer api-secret")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", response.StatusCode)
	}
	var body struct {
		OK        bool   `json:"ok"`
		SessionID string `json:"sessionId"`
		Result    struct {
			Windows []struct {
				ID int `json:"id"`
			} `json:"windows"`
		} `json:"result"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if !body.OK || body.SessionID != "match-one" || len(body.Result.Windows) != 1 ||
		body.Result.Windows[0].ID != 42 {
		t.Fatalf("unexpected REST body: %#v", body)
	}
	pointerRequest, err := http.NewRequestWithContext(ctx, http.MethodPost,
		httpServer.URL+"/v1/sessions/match-one/input/pointer",
		strings.NewReader(`{"x":32,"y":96}`))
	if err != nil {
		t.Fatal(err)
	}
	pointerRequest.Header.Set("Authorization", "Bearer api-secret")
	pointerRequest.Header.Set("Content-Type", "application/json")
	pointerResponse, err := http.DefaultClient.Do(pointerRequest)
	if err != nil {
		t.Fatal(err)
	}
	defer pointerResponse.Body.Close()
	if pointerResponse.StatusCode != http.StatusOK {
		t.Fatalf("pointer status = %d", pointerResponse.StatusCode)
	}
	var pointerBody struct {
		OK     bool            `json:"ok"`
		Result pointerPosition `json:"result"`
	}
	if err := json.NewDecoder(pointerResponse.Body).Decode(&pointerBody); err != nil {
		t.Fatal(err)
	}
	if !pointerBody.OK || pointerBody.Result.X != 32 || pointerBody.Result.Y != 96 {
		t.Fatalf("unexpected pointer REST body: %#v", pointerBody)
	}

	worldRequest, err := http.NewRequestWithContext(ctx, http.MethodGet,
		httpServer.URL+"/v1/sessions/match-one/world?detail=tactical&includeCapabilities=true", nil)
	if err != nil {
		t.Fatal(err)
	}
	worldRequest.Header.Set("Authorization", "Bearer api-secret")
	worldResponse, err := http.DefaultClient.Do(worldRequest)
	if err != nil {
		t.Fatal(err)
	}
	defer worldResponse.Body.Close()
	var worldBody struct {
		OK     bool `json:"ok"`
		Result struct {
			Frame int64  `json:"frame"`
			Mode  string `json:"observationMode"`
		} `json:"result"`
	}
	if worldResponse.StatusCode != http.StatusOK ||
		json.NewDecoder(worldResponse.Body).Decode(&worldBody) != nil ||
		!worldBody.OK || worldBody.Result.Frame != 77 || worldBody.Result.Mode != "unrestricted" {
		t.Fatalf("unexpected world REST response: status=%d body=%#v", worldResponse.StatusCode, worldBody)
	}

	terrainRequest, err := http.NewRequestWithContext(ctx, http.MethodGet,
		httpServer.URL+"/v1/sessions/match-one/terrain?minX=0&minY=10&maxX=100&maxY=90&columns=16&rows=8", nil)
	if err != nil {
		t.Fatal(err)
	}
	terrainRequest.Header.Set("Authorization", "Bearer api-secret")
	terrainResponse, err := http.DefaultClient.Do(terrainRequest)
	if err != nil {
		t.Fatal(err)
	}
	defer terrainResponse.Body.Close()
	var terrainBody struct {
		OK     bool `json:"ok"`
		Result struct {
			Columns int64 `json:"columns"`
			Rows    int64 `json:"rows"`
			Known   int64 `json:"knownCount"`
		} `json:"result"`
	}
	if terrainResponse.StatusCode != http.StatusOK ||
		json.NewDecoder(terrainResponse.Body).Decode(&terrainBody) != nil ||
		!terrainBody.OK || terrainBody.Result.Columns != 16 || terrainBody.Result.Rows != 8 ||
		terrainBody.Result.Known != 64 {
		t.Fatalf("unexpected terrain REST response: status=%d body=%#v", terrainResponse.StatusCode, terrainBody)
	}

	minimapRequest, err := http.NewRequestWithContext(ctx, http.MethodGet,
		httpServer.URL+"/v1/sessions/match-one/minimap?columns=24&rows=12", nil)
	if err != nil {
		t.Fatal(err)
	}
	minimapRequest.Header.Set("Authorization", "Bearer api-secret")
	minimapResponse, err := http.DefaultClient.Do(minimapRequest)
	if err != nil {
		t.Fatal(err)
	}
	defer minimapResponse.Body.Close()
	var minimapBody struct {
		OK     bool `json:"ok"`
		Result struct {
			Available bool  `json:"available"`
			Columns   int64 `json:"columns"`
			Rows      int64 `json:"rows"`
		} `json:"result"`
	}
	if minimapResponse.StatusCode != http.StatusOK ||
		json.NewDecoder(minimapResponse.Body).Decode(&minimapBody) != nil || !minimapBody.OK ||
		!minimapBody.Result.Available || minimapBody.Result.Columns != 24 || minimapBody.Result.Rows != 12 {
		t.Fatalf("unexpected minimap REST response: status=%d body=%#v", minimapResponse.StatusCode, minimapBody)
	}

	hudRequest, err := http.NewRequestWithContext(ctx, http.MethodGet,
		httpServer.URL+"/v1/sessions/match-one/hud", nil)
	if err != nil {
		t.Fatal(err)
	}
	hudRequest.Header.Set("Authorization", "Bearer api-secret")
	hudResponse, err := http.DefaultClient.Do(hudRequest)
	if err != nil {
		t.Fatal(err)
	}
	var hudBody struct {
		OK bool `json:"ok"`
	}
	hudDecodeErr := json.NewDecoder(hudResponse.Body).Decode(&hudBody)
	hudResponse.Body.Close()
	if hudResponse.StatusCode != http.StatusOK || hudDecodeErr != nil || !hudBody.OK {
		t.Fatalf("unexpected HUD REST response: status=%d body=%#v err=%v",
			hudResponse.StatusCode, hudBody, hudDecodeErr)
	}

	chatRequest, err := http.NewRequestWithContext(ctx, http.MethodPost,
		httpServer.URL+"/v1/sessions/match-one/chat",
		strings.NewReader(`{"text":"  Attack now  ","audience":"allies"}`))
	if err != nil {
		t.Fatal(err)
	}
	chatRequest.Header.Set("Authorization", "Bearer api-secret")
	chatRequest.Header.Set("Content-Type", "application/json")
	chatResponse, err := http.DefaultClient.Do(chatRequest)
	if err != nil {
		t.Fatal(err)
	}
	var chatBody struct {
		OK bool `json:"ok"`
	}
	chatDecodeErr := json.NewDecoder(chatResponse.Body).Decode(&chatBody)
	chatResponse.Body.Close()
	if chatResponse.StatusCode != http.StatusOK || chatDecodeErr != nil || !chatBody.OK {
		t.Fatalf("unexpected chat REST response: status=%d body=%#v err=%v",
			chatResponse.StatusCode, chatBody, chatDecodeErr)
	}

	actionRequests := []struct {
		path string
		body string
	}{
		{"/v1/sessions/match-one/game/selection", `{"objectIds":[3,7]}`},
		{"/v1/sessions/match-one/game/orders", `{"action":"attackMove","objectIds":[3,7],"position":{"x":500,"y":750}}`},
		{"/v1/sessions/match-one/game/orders", `{"action":"move","objectIds":[3,7],"position":{"x":510,"y":760},"bestEffort":true}`},
		{"/v1/sessions/match-one/game/context", `{"objectIds":[3,7],"targetId":11}`},
		{"/v1/sessions/match-one/game/commands", `{"sourceId":9,"command":"Command_ConstructChinaPowerPlant","position":{"x":120,"y":240},"angle":1.25}`},
		{"/v1/sessions/match-one/camera", `{"x":400,"y":300}`},
		{"/v1/sessions/match-one/camera/view", `{"angle":0.5,"zoom":0.8}`},
		{"/v1/sessions/match-one/ui/submit", `{"windowId":23,"name":"LanLobbyMenu.wnd:TextEntryChat"}`},
		{"/v1/sessions/match-one/ui/value", `{"windowId":17,"name":"Options.wnd:VolumeSlider","value":73}`},
		{"/v1/sessions/match-one/ui/tab", `{"windowId":19,"name":"Options.wnd:Tabs","index":2}`},
	}
	for _, action := range actionRequests {
		request, err := http.NewRequestWithContext(ctx, http.MethodPost,
			httpServer.URL+action.path, strings.NewReader(action.body))
		if err != nil {
			t.Fatal(err)
		}
		request.Header.Set("Authorization", "Bearer api-secret")
		request.Header.Set("Content-Type", "application/json")
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		var body struct {
			OK bool `json:"ok"`
		}
		decodeErr := json.NewDecoder(response.Body).Decode(&body)
		response.Body.Close()
		if response.StatusCode != http.StatusOK || decodeErr != nil || !body.OK {
			t.Fatalf("unexpected gameplay REST response for %s: status=%d body=%#v err=%v",
				action.path, response.StatusCode, body, decodeErr)
		}
	}

	if err := <-engineDone; err != nil {
		t.Fatal(err)
	}
}

func TestRESTRequiresBearerToken(t *testing.T) {
	bridge, err := NewServer(Config{EngineToken: "engine", APIToken: "api"})
	if err != nil {
		t.Fatal(err)
	}
	defer bridge.Close()
	request := httptest.NewRequest(http.MethodGet, "/v1/sessions", nil)
	recorder := httptest.NewRecorder()
	bridge.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d", recorder.Code)
	}
}

func TestServerRequiresDistinctCredentials(t *testing.T) {
	if _, err := NewServer(Config{EngineToken: "shared", APIToken: "shared"}); err == nil {
		t.Fatal("expected shared credential to be rejected")
	}
}

func TestServerRequiresValidFixedPlayMode(t *testing.T) {
	if _, err := NewServer(Config{
		EngineToken: "engine", APIToken: "api", PlayMode: "omniscient",
	}); err == nil {
		t.Fatal("expected invalid play mode to be rejected")
	}
	bridge, err := NewServer(Config{
		EngineToken: "engine", APIToken: "api", PlayMode: PlayModeCamera,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer bridge.Close()
	request := httptest.NewRequest(
		http.MethodGet, "/v1/sessions/missing/world?mode=unrestricted", nil)
	request.Header.Set("Authorization", "Bearer api")
	recorder := httptest.NewRecorder()
	bridge.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("camera play mode override status = %d, want %d",
			recorder.Code, http.StatusBadRequest)
	}
}

func TestWorldQueryValidation(t *testing.T) {
	bridge, err := NewServer(Config{EngineToken: "engine", APIToken: "api"})
	if err != nil {
		t.Fatal(err)
	}
	defer bridge.Close()
	for _, path := range []string{
		"/v1/sessions/missing/world?detail=verbose",
		"/v1/sessions/missing/world?includeCapabilities=maybe",
	} {
		request := httptest.NewRequest(http.MethodGet, path, nil)
		request.Header.Set("Authorization", "Bearer api")
		recorder := httptest.NewRecorder()
		bridge.Handler().ServeHTTP(recorder, request)
		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("%s status = %d, want %d", path, recorder.Code, http.StatusBadRequest)
		}
	}
}

func TestContextActionRequiresExactlyOneTarget(t *testing.T) {
	bridge, err := NewServer(Config{EngineToken: "engine", APIToken: "api"})
	if err != nil {
		t.Fatal(err)
	}
	defer bridge.Close()
	for _, body := range []string{
		`{"objectIds":[1]}`,
		`{"objectIds":[1],"targetId":2,"position":{"x":3,"y":4}}`,
	} {
		request := httptest.NewRequest(http.MethodPost,
			"/v1/sessions/missing/game/context", strings.NewReader(body))
		request.Header.Set("Authorization", "Bearer api")
		request.Header.Set("Content-Type", "application/json")
		recorder := httptest.NewRecorder()
		bridge.Handler().ServeHTTP(recorder, request)
		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("body %s status = %d, want %d", body, recorder.Code, http.StatusBadRequest)
		}
	}
}

type testError struct{ message string }

func (e *testError) Error() string { return e.message }
