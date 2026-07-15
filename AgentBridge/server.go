package agentbridge

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

var sessionIDPattern = regexp.MustCompile(`^[A-Za-z0-9._-]{1,128}$`)

// Config controls authentication and request lifetimes for a bridge server.
type Config struct {
	EngineToken             string
	APIToken                string
	PlayMode                string
	RequestTimeout          time.Duration
	EventPollInterval       time.Duration
	EventCapabilityInterval time.Duration
	EventCoalesceWindow     time.Duration
	EventIdleTimeout        time.Duration
	EventHeartbeatInterval  time.Duration
	EventReplayLimit        int
}

// Server accepts raw browser sessions and presents their operations as REST.
type Server struct {
	config       Config
	eventsConfig eventRuntimeConfig
	sessions     *sessionStore
	handler      http.Handler
}

// NewServer constructs a bridge with separate browser and REST credentials.
func NewServer(config Config) (*Server, error) {
	if config.EngineToken == "" || config.APIToken == "" {
		return nil, errors.New("engine and API tokens are required")
	}
	if tokensEqual(config.EngineToken, config.APIToken) {
		return nil, errors.New("engine and API tokens must be distinct")
	}
	if config.PlayMode == "" {
		config.PlayMode = PlayModeGlobal
	}
	if config.PlayMode != PlayModeGlobal && config.PlayMode != PlayModeCamera {
		return nil, errors.New("play mode must be global or camera")
	}
	if config.RequestTimeout <= 0 {
		config.RequestTimeout = 30 * time.Second
	}
	server := &Server{
		config:       config,
		eventsConfig: eventConfig(config),
		sessions:     newSessionStore(),
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", server.health)
	mux.HandleFunc("GET /engine", server.engine)
	mux.Handle("GET /v1/sessions", server.requireAPIAuth(http.HandlerFunc(server.listSessions)))
	mux.Handle("POST /v1/sessions/{session}/input/pointer", server.requireAPIAuth(http.HandlerFunc(server.pointerMove)))
	mux.Handle("POST /v1/sessions/{session}/camera", server.requireAPIAuth(http.HandlerFunc(server.cameraLookAt)))
	mux.Handle("POST /v1/sessions/{session}/camera/view", server.requireAPIAuth(http.HandlerFunc(server.cameraSetView)))
	mux.Handle("POST /v1/sessions/{session}/game/selection", server.requireAPIAuth(http.HandlerFunc(server.gameSelection)))
	mux.Handle("POST /v1/sessions/{session}/game/orders", server.requireAPIAuth(http.HandlerFunc(server.gameOrder)))
	mux.Handle("POST /v1/sessions/{session}/game/context", server.requireAPIAuth(http.HandlerFunc(server.gameContext)))
	mux.Handle("POST /v1/sessions/{session}/game/commands", server.requireAPIAuth(http.HandlerFunc(server.gameCommand)))
	mux.Handle("POST /v1/sessions/{session}/game/player-commands", server.requireAPIAuth(http.HandlerFunc(server.gamePlayerCommand)))
	mux.Handle("POST /v1/sessions/{session}/game/production", server.requireAPIAuth(http.HandlerFunc(server.gameProduction)))
	mux.Handle("POST /v1/sessions/{session}/game/container", server.requireAPIAuth(http.HandlerFunc(server.gameContainer)))
	mux.Handle("POST /v1/sessions/{session}/game/beacons", server.requireAPIAuth(http.HandlerFunc(server.gameBeacon)))
	mux.Handle("GET /v1/sessions/{session}/world", server.requireAPIAuth(http.HandlerFunc(server.worldSnapshot)))
	mux.Handle("GET /v1/sessions/{session}/events", server.requireAPIAuth(http.HandlerFunc(server.tacticalEvents)))
	mux.Handle("GET /v1/sessions/{session}/terrain", server.requireAPIAuth(http.HandlerFunc(server.terrainQuery)))
	mux.Handle("GET /v1/sessions/{session}/minimap", server.requireAPIAuth(http.HandlerFunc(server.minimapSnapshot)))
	mux.Handle("GET /v1/sessions/{session}/hud", server.requireAPIAuth(http.HandlerFunc(server.hudSnapshot)))
	mux.Handle("POST /v1/sessions/{session}/chat", server.requireAPIAuth(http.HandlerFunc(server.chatSend)))
	mux.Handle("GET /v1/sessions/{session}/ui", server.requireAPIAuth(http.HandlerFunc(server.uiSnapshot)))
	mux.Handle("GET /v1/sessions/{session}/ui/items", server.requireAPIAuth(http.HandlerFunc(server.uiItems)))
	mux.Handle("POST /v1/sessions/{session}/ui/activate", server.requireAPIAuth(http.HandlerFunc(server.uiActivate)))
	mux.Handle("POST /v1/sessions/{session}/ui/text", server.requireAPIAuth(http.HandlerFunc(server.uiText)))
	mux.Handle("POST /v1/sessions/{session}/ui/submit", server.requireAPIAuth(http.HandlerFunc(server.uiSubmit)))
	mux.Handle("POST /v1/sessions/{session}/ui/selection", server.requireAPIAuth(http.HandlerFunc(server.uiSelection)))
	mux.Handle("POST /v1/sessions/{session}/ui/value", server.requireAPIAuth(http.HandlerFunc(server.uiValue)))
	mux.Handle("POST /v1/sessions/{session}/ui/tab", server.requireAPIAuth(http.HandlerFunc(server.uiTab)))
	mux.Handle("POST /v1/sessions/{session}/requests", server.requireAPIAuth(http.HandlerFunc(server.rawRequest)))
	server.handler = securityHeaders(mux)
	return server, nil
}

func (s *Server) Handler() http.Handler { return s.handler }

func (s *Server) Close() { s.sessions.close() }

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

func tokensEqual(left, right string) bool {
	return len(left) == len(right) &&
		subtle.ConstantTimeCompare([]byte(left), []byte(right)) == 1
}

func (s *Server) requireAPIAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		const prefix = "Bearer "
		authorization := r.Header.Get("Authorization")
		if !strings.HasPrefix(authorization, prefix) ||
			!tokensEqual(strings.TrimPrefix(authorization, prefix), s.config.APIToken) {
			writeError(w, http.StatusUnauthorized, "unauthorized", "a valid bearer token is required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":       true,
		"protocol": ProtocolVersion,
		"sessions": len(s.sessions.list()),
	})
}

func (s *Server) engine(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		Subprotocols:       []string{WebSocketProtocol},
		InsecureSkipVerify: true, // First-frame token auth prevents cross-site socket use.
	})
	if err != nil {
		return
	}
	conn.SetReadLimit(maxMessageBytes)
	defer conn.CloseNow()
	if conn.Subprotocol() != WebSocketProtocol {
		_ = conn.Close(websocket.StatusPolicyViolation, "required WebSocket subprotocol missing")
		return
	}

	helloCtx, cancelHello := context.WithTimeout(context.Background(), 5*time.Second)
	var hello protocolMessage
	err = wsjson.Read(helloCtx, conn, &hello)
	cancelHello()
	if err != nil || hello.Type != "hello" || hello.Protocol != ProtocolVersion ||
		!sessionIDPattern.MatchString(hello.SessionID) ||
		hello.PlayMode != s.config.PlayMode ||
		!tokensEqual(hello.Token, s.config.EngineToken) {
		_ = conn.Close(websocket.StatusPolicyViolation, "invalid engine hello")
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	session := newSession(ctx, hello.SessionID, hello.PlayMode, hello.Capabilities, conn, s.eventsConfig)
	s.sessions.register(session)
	defer func() {
		s.sessions.remove(session)
		session.close()
	}()
	if err := session.write(ctx, protocolMessage{
		Type:      "hello",
		Protocol:  ProtocolVersion,
		SessionID: hello.SessionID,
		PlayMode:  hello.PlayMode,
		OK:        true,
	}); err != nil {
		return
	}
	_ = session.readLoop()
}

func (s *Server) listSessions(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"sessions": s.sessions.list()})
}

func (s *Server) sessionFor(w http.ResponseWriter, r *http.Request) *Session {
	session := s.sessions.get(r.PathValue("session"))
	if session == nil {
		writeError(w, http.StatusNotFound, "session_not_found", "engine session is not connected")
	}
	return session
}

type windowReference struct {
	WindowID int64  `json:"windowId"`
	Name     string `json:"name,omitempty"`
}

type pointerPosition struct {
	X int64 `json:"x"`
	Y int64 `json:"y"`
}

type worldPosition struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type gameOrderRequest struct {
	Action     string         `json:"action"`
	ObjectIDs  []int64        `json:"objectIds"`
	TargetID   int64          `json:"targetId,omitempty"`
	Position   *worldPosition `json:"position,omitempty"`
	GuardMode  string         `json:"guardMode,omitempty"`
	BestEffort bool           `json:"bestEffort,omitempty"`
}

func (p worldPosition) validate(field string) error {
	if math.IsNaN(p.X) || math.IsInf(p.X, 0) || math.IsNaN(p.Y) || math.IsInf(p.Y, 0) {
		return fmt.Errorf("%s.x and %s.y must be finite numbers", field, field)
	}
	return nil
}

func validateObjectID(value int64, field string, optional bool) error {
	if optional && value == 0 {
		return nil
	}
	if value < 1 || value > 0x7fffffff {
		return fmt.Errorf("%s must be a positive 32-bit integer", field)
	}
	return nil
}

func validateObjectIDs(values []int64) error {
	if len(values) < 1 || len(values) > 128 {
		return errors.New("objectIds must contain 1 through 128 object IDs")
	}
	seen := make(map[int64]struct{}, len(values))
	for index, value := range values {
		if err := validateObjectID(value, fmt.Sprintf("objectIds[%d]", index), false); err != nil {
			return err
		}
		if _, exists := seen[value]; exists {
			return errors.New("objectIds must not contain duplicates")
		}
		seen[value] = struct{}{}
	}
	return nil
}

func (p pointerPosition) validate() error {
	if p.X < 0 || p.X > 0x7fff || p.Y < 0 || p.Y > 0x7fff {
		return errors.New("x and y must be integers from 0 through 32767")
	}
	return nil
}

func (s *Server) pointerMove(w http.ResponseWriter, r *http.Request) {
	var request pointerPosition
	if !decodeBody(w, r, &request) || !validateBody(w, request.validate()) {
		return
	}
	s.call(w, r, "input.pointerMove", request)
}

func (s *Server) cameraLookAt(w http.ResponseWriter, r *http.Request) {
	var request worldPosition
	if !decodeBody(w, r, &request) || !validateBody(w, request.validate("position")) {
		return
	}
	s.call(w, r, "camera.lookAt", request)
}

func (s *Server) cameraSetView(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Angle *float64 `json:"angle,omitempty"`
		Pitch *float64 `json:"pitch,omitempty"`
		Zoom  *float64 `json:"zoom,omitempty"`
	}
	if !decodeBody(w, r, &request) {
		return
	}
	if request.Angle == nil && request.Pitch == nil && request.Zoom == nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "provide at least one angle, pitch, or zoom")
		return
	}
	for name, value := range map[string]*float64{
		"angle": request.Angle, "pitch": request.Pitch, "zoom": request.Zoom,
	} {
		if value != nil && (math.IsNaN(*value) || math.IsInf(*value, 0)) {
			writeError(w, http.StatusBadRequest, "invalid_request", name+" must be a finite number")
			return
		}
	}
	s.call(w, r, "camera.setView", request)
}

func (s *Server) gameSelection(w http.ResponseWriter, r *http.Request) {
	var request struct {
		ObjectIDs []int64 `json:"objectIds"`
	}
	if !decodeBody(w, r, &request) || !validateBody(w, validateObjectIDs(request.ObjectIDs)) {
		return
	}
	s.call(w, r, "game.select", request)
}

func (s *Server) gameOrder(w http.ResponseWriter, r *http.Request) {
	var request gameOrderRequest
	if !decodeBody(w, r, &request) {
		return
	}
	if err := validateObjectIDs(request.ObjectIDs); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	needsPosition := request.Action == "move" || request.Action == "attackMove" ||
		request.Action == "forceMove" || request.Action == "forceAttackGround" ||
		request.Action == "waypoint" || request.Action == "guardPosition"
	needsTarget := request.Action == "attack" || request.Action == "forceAttackObject" ||
		request.Action == "guardObject"
	if !needsPosition && !needsTarget && request.Action != "stop" &&
		request.Action != "scatter" && request.Action != "formation" {
		writeError(w, http.StatusBadRequest, "invalid_request", "unsupported tactical action")
		return
	}
	isGuard := request.Action == "guardPosition" || request.Action == "guardObject"
	if !isGuard && request.GuardMode != "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "guardMode is only used by guard orders")
		return
	}
	if isGuard && request.GuardMode == "" {
		request.GuardMode = "normal"
	}
	if isGuard && request.GuardMode != "normal" && request.GuardMode != "withoutPursuit" &&
		request.GuardMode != "flyingOnly" {
		writeError(w, http.StatusBadRequest, "invalid_request",
			"guardMode must be normal, withoutPursuit, or flyingOnly")
		return
	}
	if needsPosition {
		if request.Position == nil {
			writeError(w, http.StatusBadRequest, "invalid_request", "position is required for this order")
			return
		}
		if !validateBody(w, request.Position.validate("position")) {
			return
		}
	} else if request.Position != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "position is not used by this order")
		return
	}
	if err := validateObjectID(request.TargetID, "targetId", !needsTarget); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if needsTarget && request.TargetID == 0 {
		writeError(w, http.StatusBadRequest, "invalid_request", "targetId is required for this order")
		return
	}
	if !needsTarget && request.TargetID != 0 {
		writeError(w, http.StatusBadRequest, "invalid_request", "targetId is not used by this order")
		return
	}
	if request.BestEffort {
		s.gameOrderBestEffort(w, r, request)
		return
	}
	request.BestEffort = false
	s.call(w, r, "game.order", request)
}

func (s *Server) gameOrderBestEffort(w http.ResponseWriter, r *http.Request, request gameOrderRequest) {
	session := s.sessionFor(w, r)
	if session == nil {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.config.RequestTimeout)
	defer cancel()
	type appliedOrder struct {
		ObjectID int64           `json:"objectId"`
		Result   json.RawMessage `json:"result"`
	}
	type rejectedOrder struct {
		ObjectID int64          `json:"objectId"`
		Error    *ProtocolError `json:"error"`
	}
	applied := make([]appliedOrder, 0, len(request.ObjectIDs))
	rejected := make([]rejectedOrder, 0)
	for _, objectID := range request.ObjectIDs {
		attempt := request
		attempt.ObjectIDs = []int64{objectID}
		attempt.BestEffort = false
		result, protocolErr, err := session.call(ctx, "game.order", attempt)
		if err != nil {
			status := http.StatusBadGateway
			code := "engine_unavailable"
			if errors.Is(err, context.DeadlineExceeded) {
				status = http.StatusGatewayTimeout
				code = "engine_timeout"
			}
			writeError(w, status, code, err.Error())
			return
		}
		if protocolErr != nil {
			rejected = append(rejected, rejectedOrder{ObjectID: objectID, Error: protocolErr})
			continue
		}
		applied = append(applied, appliedOrder{ObjectID: objectID, Result: result})
	}
	acceptedIDs := make([]int64, 0, len(applied))
	for _, item := range applied {
		acceptedIDs = append(acceptedIDs, item.ObjectID)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":        true,
		"sessionId": session.id,
		"result": map[string]any{
			"accepted":          len(applied) > 0,
			"complete":          true,
			"action":            request.Action,
			"acceptedObjectIds": acceptedIDs,
			"applied":           applied,
			"rejected":          rejected,
		},
	})
}

func (s *Server) gameCommand(w http.ResponseWriter, r *http.Request) {
	var request struct {
		SourceID int64          `json:"sourceId"`
		Command  string         `json:"command"`
		TargetID int64          `json:"targetId,omitempty"`
		Position *worldPosition `json:"position,omitempty"`
		Angle    float64        `json:"angle,omitempty"`
	}
	if !decodeBody(w, r, &request) {
		return
	}
	if err := validateObjectID(request.SourceID, "sourceId", false); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if request.Command == "" || len(request.Command) > 256 {
		writeError(w, http.StatusBadRequest, "invalid_request", "command is required and must not exceed 256 characters")
		return
	}
	if err := validateObjectID(request.TargetID, "targetId", true); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if request.Position != nil && !validateBody(w, request.Position.validate("position")) {
		return
	}
	if math.IsNaN(request.Angle) || math.IsInf(request.Angle, 0) {
		writeError(w, http.StatusBadRequest, "invalid_request", "angle must be a finite number")
		return
	}
	s.call(w, r, "game.command", request)
}

func (s *Server) gamePlayerCommand(w http.ResponseWriter, r *http.Request) {
	var request struct {
		CommandSet string         `json:"commandSet"`
		Command    string         `json:"command"`
		TargetID   int64          `json:"targetId,omitempty"`
		Position   *worldPosition `json:"position,omitempty"`
		Angle      float64        `json:"angle,omitempty"`
	}
	if !decodeBody(w, r, &request) {
		return
	}
	if request.CommandSet == "" || len(request.CommandSet) > 256 ||
		request.Command == "" || len(request.Command) > 256 {
		writeError(w, http.StatusBadRequest, "invalid_request",
			"commandSet and command are required and must not exceed 256 characters")
		return
	}
	if err := validateObjectID(request.TargetID, "targetId", true); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if request.Position != nil && !validateBody(w, request.Position.validate("position")) {
		return
	}
	if math.IsNaN(request.Angle) || math.IsInf(request.Angle, 0) {
		writeError(w, http.StatusBadRequest, "invalid_request", "angle must be a finite number")
		return
	}
	s.call(w, r, "game.playerCommand", request)
}

func (s *Server) gameProduction(w http.ResponseWriter, r *http.Request) {
	var request struct {
		SourceID     int64  `json:"sourceId"`
		Action       string `json:"action"`
		ProductionID int64  `json:"productionId,omitempty"`
		Upgrade      string `json:"upgrade,omitempty"`
	}
	if !decodeBody(w, r, &request) {
		return
	}
	if err := validateObjectID(request.SourceID, "sourceId", false); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if request.Action != "cancel" {
		writeError(w, http.StatusBadRequest, "invalid_request", "production action must be cancel")
		return
	}
	if request.ProductionID < 0 || request.ProductionID > 0x7fffffff ||
		((request.ProductionID > 0) == (request.Upgrade != "")) || len(request.Upgrade) > 256 {
		writeError(w, http.StatusBadRequest, "invalid_request",
			"provide exactly one positive productionId or upgrade name")
		return
	}
	s.call(w, r, "game.production", request)
}

func (s *Server) gameContainer(w http.ResponseWriter, r *http.Request) {
	var request struct {
		ContainerID int64  `json:"containerId"`
		Action      string `json:"action"`
		PassengerID int64  `json:"passengerId"`
	}
	if !decodeBody(w, r, &request) {
		return
	}
	if err := validateObjectID(request.ContainerID, "containerId", false); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if err := validateObjectID(request.PassengerID, "passengerId", false); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if request.Action != "exit" {
		writeError(w, http.StatusBadRequest, "invalid_request", "container action must be exit")
		return
	}
	s.call(w, r, "game.container", request)
}

func (s *Server) gameBeacon(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Action   string         `json:"action"`
		BeaconID int64          `json:"beaconId,omitempty"`
		Position *worldPosition `json:"position,omitempty"`
		Text     string         `json:"text,omitempty"`
	}
	if !decodeBody(w, r, &request) {
		return
	}
	if request.Action != "place" && request.Action != "remove" && request.Action != "setText" {
		writeError(w, http.StatusBadRequest, "invalid_request",
			"beacon action must be place, remove, or setText")
		return
	}
	if request.Action == "place" {
		if request.Position == nil {
			writeError(w, http.StatusBadRequest, "invalid_request", "position is required for place")
			return
		}
		if !validateBody(w, request.Position.validate("position")) {
			return
		}
		if request.BeaconID != 0 || request.Text != "" {
			writeError(w, http.StatusBadRequest, "invalid_request",
				"place uses position and does not use beaconId or text")
			return
		}
	} else {
		if err := validateObjectID(request.BeaconID, "beaconId", false); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
			return
		}
		if request.Position != nil {
			writeError(w, http.StatusBadRequest, "invalid_request",
				"remove and setText do not use position")
			return
		}
	}
	if request.Action != "setText" && request.Text != "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "text is only used by setText")
		return
	}
	if len([]rune(request.Text)) > 255 {
		writeError(w, http.StatusBadRequest, "invalid_request",
			"beacon text must not exceed 255 characters")
		return
	}
	s.call(w, r, "game.beacon", request)
}

func (s *Server) gameContext(w http.ResponseWriter, r *http.Request) {
	var request struct {
		ObjectIDs []int64        `json:"objectIds"`
		TargetID  int64          `json:"targetId,omitempty"`
		Position  *worldPosition `json:"position,omitempty"`
	}
	if !decodeBody(w, r, &request) {
		return
	}
	if err := validateObjectIDs(request.ObjectIDs); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if err := validateObjectID(request.TargetID, "targetId", true); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if (request.TargetID != 0) == (request.Position != nil) {
		writeError(w, http.StatusBadRequest, "invalid_request", "provide exactly one targetId or position")
		return
	}
	if request.Position != nil && !validateBody(w, request.Position.validate("position")) {
		return
	}
	s.call(w, r, "game.context", request)
}

func observationMode(playMode string, r *http.Request) (string, error) {
	mode := "unrestricted"
	if playMode == PlayModeCamera {
		mode = "camera"
	}
	requested := r.URL.Query().Get("mode")
	if requested != "" && requested != mode {
		return "", fmt.Errorf("mode is fixed to %s for this session", mode)
	}
	return mode, nil
}

func (s *Server) worldSnapshot(w http.ResponseWriter, r *http.Request) {
	mode, err := observationMode(s.config.PlayMode, r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	detail := r.URL.Query().Get("detail")
	if detail == "" {
		detail = "full"
	}
	if detail != "full" && detail != "tactical" {
		writeError(w, http.StatusBadRequest, "invalid_request", "detail must be full or tactical")
		return
	}
	includeCapabilities := false
	if raw := r.URL.Query().Get("includeCapabilities"); raw != "" {
		includeCapabilities, err = strconv.ParseBool(raw)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", "includeCapabilities must be true or false")
			return
		}
	}
	s.call(w, r, "world.snapshot", map[string]any{
		"mode": mode, "detail": detail, "includeCapabilities": includeCapabilities,
	})
}

func (s *Server) terrainQuery(w http.ResponseWriter, r *http.Request) {
	mode, err := observationMode(s.config.PlayMode, r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	minX, err := requiredQueryFloat(r, "minX")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	minY, err := requiredQueryFloat(r, "minY")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	maxX, err := requiredQueryFloat(r, "maxX")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	maxY, err := requiredQueryFloat(r, "maxY")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if minX >= maxX || minY >= maxY {
		writeError(w, http.StatusBadRequest, "invalid_request", "terrain bounds must be ordered")
		return
	}
	columns, err := queryInt(r, "columns", 32, 1, 128)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	rows, err := queryInt(r, "rows", 32, 1, 128)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if columns*rows > 16384 {
		writeError(w, http.StatusBadRequest, "invalid_request", "terrain query may contain at most 16384 samples")
		return
	}
	s.call(w, r, "terrain.query", map[string]any{
		"mode": mode, "minX": minX, "minY": minY, "maxX": maxX, "maxY": maxY,
		"columns": columns, "rows": rows,
	})
}

func (s *Server) minimapSnapshot(w http.ResponseWriter, r *http.Request) {
	columns, err := queryInt(r, "columns", 32, 1, 128)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	rows, err := queryInt(r, "rows", 32, 1, 128)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if columns*rows > 16384 {
		writeError(w, http.StatusBadRequest, "invalid_request", "minimap may contain at most 16384 cells")
		return
	}
	s.call(w, r, "minimap.snapshot", map[string]any{"columns": columns, "rows": rows})
}

func (s *Server) hudSnapshot(w http.ResponseWriter, r *http.Request) {
	s.call(w, r, "hud.snapshot", map[string]any{})
}

func (s *Server) chatSend(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Text     string `json:"text"`
		Audience string `json:"audience"`
	}
	if !decodeBody(w, r, &request) {
		return
	}
	request.Text = strings.TrimSpace(request.Text)
	codeUnits := len(utf16.Encode([]rune(request.Text)))
	if codeUnits < 1 || codeUnits > 255 {
		writeError(w, http.StatusBadRequest, "invalid_request",
			"text must contain 1 through 255 UTF-16 code units")
		return
	}
	for _, char := range request.Text {
		if char < 0x20 || char == 0x7f {
			writeError(w, http.StatusBadRequest, "invalid_request",
				"text must not contain control characters")
			return
		}
	}
	if request.Audience == "" {
		request.Audience = "everyone"
	}
	if request.Audience != "everyone" && request.Audience != "allies" {
		writeError(w, http.StatusBadRequest, "invalid_request", "audience must be everyone or allies")
		return
	}
	s.call(w, r, "chat.send", request)
}

func (r windowReference) validate() error {
	if r.WindowID < -0x80000000 || r.WindowID > 0x7fffffff {
		return errors.New("windowId must be a signed 32-bit integer")
	}
	if len(r.Name) > 256 {
		return errors.New("name must not exceed 256 characters")
	}
	return nil
}

func (s *Server) uiSnapshot(w http.ResponseWriter, r *http.Request) {
	includeHidden := false
	if raw := r.URL.Query().Get("includeHidden"); raw != "" {
		parsed, err := strconv.ParseBool(raw)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", "includeHidden must be true or false")
			return
		}
		includeHidden = parsed
	}
	s.call(w, r, "ui.snapshot", map[string]any{"includeHidden": includeHidden})
}

func (s *Server) uiActivate(w http.ResponseWriter, r *http.Request) {
	var request windowReference
	if !decodeBody(w, r, &request) || !validateBody(w, request.validate()) {
		return
	}
	s.call(w, r, "ui.activate", request)
}

func (s *Server) uiText(w http.ResponseWriter, r *http.Request) {
	var request struct {
		windowReference
		Text string `json:"text"`
	}
	if !decodeBody(w, r, &request) || !validateBody(w, request.validate()) {
		return
	}
	if len(request.Text) > 16<<10 {
		writeError(w, http.StatusBadRequest, "invalid_request", "text must not exceed 16 KiB")
		return
	}
	s.call(w, r, "ui.setText", request)
}

func (s *Server) uiSubmit(w http.ResponseWriter, r *http.Request) {
	var request windowReference
	if !decodeBody(w, r, &request) || !validateBody(w, request.validate()) {
		return
	}
	s.call(w, r, "ui.submit", request)
}

func (s *Server) uiSelection(w http.ResponseWriter, r *http.Request) {
	var request struct {
		windowReference
		Index int64 `json:"index"`
	}
	if !decodeBody(w, r, &request) || !validateBody(w, request.validate()) {
		return
	}
	if request.Index < 0 || request.Index > 0x7fffffff {
		writeError(w, http.StatusBadRequest, "invalid_request", "index must be a non-negative integer")
		return
	}
	s.call(w, r, "ui.selectIndex", request)
}

func (s *Server) uiValue(w http.ResponseWriter, r *http.Request) {
	var request struct {
		windowReference
		Value int64 `json:"value"`
	}
	if !decodeBody(w, r, &request) || !validateBody(w, request.validate()) {
		return
	}
	if request.Value < -0x80000000 || request.Value > 0x7fffffff {
		writeError(w, http.StatusBadRequest, "invalid_request", "value must be a signed 32-bit integer")
		return
	}
	s.call(w, r, "ui.setValue", request)
}

func (s *Server) uiTab(w http.ResponseWriter, r *http.Request) {
	var request struct {
		windowReference
		Index int64 `json:"index"`
	}
	if !decodeBody(w, r, &request) || !validateBody(w, request.validate()) {
		return
	}
	if request.Index < 0 || request.Index >= 8 {
		writeError(w, http.StatusBadRequest, "invalid_request", "index must be an integer from 0 through 7")
		return
	}
	s.call(w, r, "ui.selectTab", request)
}

func (s *Server) uiItems(w http.ResponseWriter, r *http.Request) {
	windowID, err := strconv.ParseInt(r.URL.Query().Get("windowId"), 10, 32)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "windowId query parameter is required")
		return
	}
	offset, err := queryInt(r, "offset", 0, 0, 0x7fffffff)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	limit, err := queryInt(r, "limit", 64, 1, 128)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	s.call(w, r, "ui.listItems", map[string]any{
		"windowId": windowID,
		"name":     r.URL.Query().Get("name"),
		"offset":   offset,
		"limit":    limit,
	})
}

func (s *Server) rawRequest(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Op   string          `json:"op"`
		Args json.RawMessage `json:"args"`
	}
	if !decodeBody(w, r, &request) {
		return
	}
	if request.Op == "" || len(request.Op) > 128 {
		writeError(w, http.StatusBadRequest, "invalid_request", "op is required and must not exceed 128 characters")
		return
	}
	args := request.Args
	if len(args) == 0 {
		args = json.RawMessage(`{}`)
	}
	s.call(w, r, request.Op, args)
}

func (s *Server) call(w http.ResponseWriter, r *http.Request, op string, args any) {
	session := s.sessionFor(w, r)
	if session == nil {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.config.RequestTimeout)
	defer cancel()
	result, protocolErr, err := session.call(ctx, op, args)
	if err != nil {
		status := http.StatusBadGateway
		code := "engine_unavailable"
		if errors.Is(err, context.DeadlineExceeded) {
			status = http.StatusGatewayTimeout
			code = "engine_timeout"
		}
		writeError(w, status, code, err.Error())
		return
	}
	if protocolErr != nil {
		status := http.StatusUnprocessableEntity
		switch protocolErr.Code {
		case "not_found", "stale_window":
			status = http.StatusNotFound
		case "not_ready", "not_interactive":
			status = http.StatusConflict
		case "invalid_arguments", "invalid_request", "invalid_text", "index_out_of_range", "bounds_out_of_range":
			status = http.StatusBadRequest
		case "unsupported_operation":
			status = http.StatusNotImplemented
		}
		writeJSON(w, status, map[string]any{"ok": false, "error": protocolErr})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":        true,
		"sessionId": session.id,
		"result":    json.RawMessage(result),
	})
}

func queryInt(r *http.Request, name string, fallback, minimum, maximum int64) (int64, error) {
	raw := r.URL.Query().Get(name)
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || value < minimum || value > maximum {
		return 0, fmt.Errorf("%s must be an integer from %d through %d", name, minimum, maximum)
	}
	return value, nil
}

func requiredQueryFloat(r *http.Request, name string) (float64, error) {
	raw := r.URL.Query().Get(name)
	value, err := strconv.ParseFloat(raw, 64)
	if raw == "" || err != nil {
		return 0, fmt.Errorf("%s must be a finite number", name)
	}
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0, fmt.Errorf("%s must be a finite number", name)
	}
	return value, nil
}

func decodeBody(w http.ResponseWriter, r *http.Request, destination any) bool {
	decoder := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return false
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		writeError(w, http.StatusBadRequest, "invalid_request", "request body must contain one JSON value")
		return false
	}
	return true
}

func validateBody(w http.ResponseWriter, err error) bool {
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return false
	}
	return true
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{
		"ok": false,
		"error": map[string]string{
			"code":    code,
			"message": message,
		},
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
