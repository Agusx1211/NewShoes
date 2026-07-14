package agentbridge

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
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
	EngineToken    string
	APIToken       string
	RequestTimeout time.Duration
}

// Server accepts raw browser sessions and presents their operations as REST.
type Server struct {
	config   Config
	sessions *sessionStore
	handler  http.Handler
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
	server := &Server{config: config, sessions: newSessionStore()}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", server.health)
	mux.HandleFunc("GET /engine", server.engine)
	mux.Handle("GET /v1/sessions", server.requireAPIAuth(http.HandlerFunc(server.listSessions)))
	mux.Handle("POST /v1/sessions/{session}/input/pointer", server.requireAPIAuth(http.HandlerFunc(server.pointerMove)))
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
	session := newSession(ctx, hello.SessionID, hello.Capabilities, conn)
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
		case "invalid_arguments", "invalid_request", "invalid_text", "index_out_of_range":
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
