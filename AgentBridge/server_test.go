package agentbridge

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
			Mode string `json:"mode"`
		}
		if request.Type != "request" || request.Op != "world.snapshot" ||
			json.Unmarshal(request.Args, &world) != nil || world.Mode != "camera" {
			engineDone <- &testError{"unexpected world request"}
			return
		}
		if err := wsjson.Write(ctx, conn, protocolMessage{
			Type:   "response",
			ID:     request.ID,
			OK:     true,
			Result: json.RawMessage(`{"ok":true,"frame":77,"observationMode":"camera"}`),
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
		engineDone <- wsjson.Write(ctx, conn, protocolMessage{
			Type:   "response",
			ID:     request.ID,
			OK:     true,
			Result: json.RawMessage(`{"ok":true,"columns":16,"rows":8,"knownCount":64}`),
		})
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
		httpServer.URL+"/v1/sessions/match-one/world?mode=camera", nil)
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
		!worldBody.OK || worldBody.Result.Frame != 77 || worldBody.Result.Mode != "camera" {
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

type testError struct{ message string }

func (e *testError) Error() string { return e.message }
