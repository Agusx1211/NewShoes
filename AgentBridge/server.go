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

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

var sessionIDPattern = regexp.MustCompile(`^[A-Za-z0-9._-]{1,128}$`)

// Config controls authentication and request lifetimes for a bridge server.
type Config struct {
	EngineToken             string
	APIToken                string
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
	mux.Handle("POST /v1/sessions/{session}/game/selection", server.requireAPIAuth(http.HandlerFunc(server.gameSelection)))
	mux.Handle("POST /v1/sessions/{session}/game/orders", server.requireAPIAuth(http.HandlerFunc(server.gameOrder)))
	mux.Handle("POST /v1/sessions/{session}/game/commands", server.requireAPIAuth(http.HandlerFunc(server.gameCommand)))
	mux.Handle("GET /v1/sessions/{session}/world", server.requireAPIAuth(http.HandlerFunc(server.worldSnapshot)))
	mux.Handle("GET /v1/sessions/{session}/events", server.requireAPIAuth(http.HandlerFunc(server.tacticalEvents)))
	mux.Handle("GET /v1/sessions/{session}/terrain", server.requireAPIAuth(http.HandlerFunc(server.terrainQuery)))
	mux.Handle("GET /v1/sessions/{session}/ui", server.requireAPIAuth(http.HandlerFunc(server.uiSnapshot)))
	mux.Handle("GET /v1/sessions/{session}/ui/items", server.requireAPIAuth(http.HandlerFunc(server.uiItems)))
	mux.Handle("POST /v1/sessions/{session}/ui/activate", server.requireAPIAuth(http.HandlerFunc(server.uiActivate)))
	mux.Handle("POST /v1/sessions/{session}/ui/text", server.requireAPIAuth(http.HandlerFunc(server.uiText)))
	mux.Handle("POST /v1/sessions/{session}/ui/selection", server.requireAPIAuth(http.HandlerFunc(server.uiSelection)))
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
		!tokensEqual(hello.Token, s.config.EngineToken) {
		_ = conn.Close(websocket.StatusPolicyViolation, "invalid engine hello")
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	session := newSession(ctx, hello.SessionID, hello.Capabilities, conn, s.eventsConfig)
	s.sessions.register(session)
	defer func() {
		s.sessions.remove(session)
		session.close()
	}()
	if err := session.write(ctx, protocolMessage{
		Type:      "hello",
		Protocol:  ProtocolVersion,
		SessionID: hello.SessionID,
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
	var request struct {
		Action    string         `json:"action"`
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
	needsPosition := request.Action == "move" || request.Action == "attackMove" || request.Action == "guardPosition"
	needsTarget := request.Action == "attack" || request.Action == "guardObject"
	if !needsPosition && !needsTarget && request.Action != "stop" && request.Action != "scatter" {
		writeError(w, http.StatusBadRequest, "invalid_request",
			"action must be move, attackMove, attack, guardPosition, guardObject, stop, or scatter")
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
	s.call(w, r, "game.order", request)
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

func observationMode(r *http.Request) (string, error) {
	mode := r.URL.Query().Get("mode")
	if mode == "" {
		mode = "unrestricted"
	}
	if mode != "unrestricted" && mode != "camera" {
		return "", errors.New("mode must be unrestricted or camera")
	}
	return mode, nil
}

func (s *Server) worldSnapshot(w http.ResponseWriter, r *http.Request) {
	mode, err := observationMode(r)
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
	mode, err := observationMode(r)
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
