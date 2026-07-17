package agentbridge

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

var errSessionClosed = errors.New("engine session disconnected")

type response struct {
	result json.RawMessage
	err    *ProtocolError
}

// Session is one authenticated browser runtime connected to the bridge.
type Session struct {
	id           string
	playMode     string
	capabilities []string
	connectedAt  time.Time
	conn         messageConn
	ctx          context.Context
	cancel       context.CancelFunc

	writeMu sync.Mutex
	mu      sync.Mutex
	pending map[string]chan response
	closed  chan struct{}
	once    sync.Once
	nextID  atomic.Uint64
	events  *eventManager
}

// SessionInfo is the public REST representation of a connected runtime.
type SessionInfo struct {
	ID           string    `json:"id"`
	PlayMode     string    `json:"playMode"`
	ConnectedAt  time.Time `json:"connectedAt"`
	Capabilities []string  `json:"capabilities"`
}

func newSession(
	ctx context.Context,
	id string,
	playMode string,
	capabilities []string,
	conn messageConn,
	eventsConfig eventRuntimeConfig,
) *Session {
	readCtx, cancel := context.WithCancel(ctx)
	session := &Session{
		id:           id,
		playMode:     playMode,
		capabilities: append([]string(nil), capabilities...),
		connectedAt:  time.Now().UTC(),
		conn:         conn,
		ctx:          readCtx,
		cancel:       cancel,
		pending:      make(map[string]chan response),
		closed:       make(chan struct{}),
	}
	session.events = newEventManager(session, eventsConfig)
	return session
}

func (s *Session) info() SessionInfo {
	return SessionInfo{
		ID:           s.id,
		PlayMode:     s.playMode,
		ConnectedAt:  s.connectedAt,
		Capabilities: append([]string(nil), s.capabilities...),
	}
}

func (s *Session) supports(capability string) bool {
	for _, candidate := range s.capabilities {
		if candidate == capability {
			return true
		}
	}
	return false
}

func (s *Session) write(ctx context.Context, message protocolMessage) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	return s.conn.Write(ctx, message)
}

func (s *Session) call(
	ctx context.Context,
	op string,
	args any,
) (json.RawMessage, *ProtocolError, error) {
	encodedArgs, err := json.Marshal(args)
	if err != nil {
		return nil, nil, fmt.Errorf("encode request arguments: %w", err)
	}
	id := strconv.FormatUint(s.nextID.Add(1), 10)
	replies := make(chan response, 1)

	s.mu.Lock()
	select {
	case <-s.closed:
		s.mu.Unlock()
		return nil, nil, errSessionClosed
	default:
	}
	s.pending[id] = replies
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.pending, id)
		s.mu.Unlock()
	}()

	if err := s.write(ctx, protocolMessage{
		Type: "request",
		ID:   id,
		Op:   op,
		Args: encodedArgs,
	}); err != nil {
		return nil, nil, fmt.Errorf("send engine request: %w", err)
	}

	select {
	case reply := <-replies:
		return reply.result, reply.err, nil
	case <-ctx.Done():
		return nil, nil, ctx.Err()
	case <-s.closed:
		return nil, nil, errSessionClosed
	}
}

func (s *Session) readLoop() error {
	for {
		var message protocolMessage
		if err := s.conn.Read(s.ctx, &message); err != nil {
			return err
		}
		if message.Type != "response" || message.ID == "" {
			continue
		}
		if !message.OK && message.Error == nil {
			message.Error = &ProtocolError{
				Code:    "invalid_engine_response",
				Message: "engine returned an unsuccessful response without an error",
			}
		}
		s.mu.Lock()
		waiter := s.pending[message.ID]
		s.mu.Unlock()
		if waiter == nil {
			continue
		}
		select {
		case waiter <- response{result: message.Result, err: message.Error}:
		default:
		}
	}
}

func (s *Session) close() {
	s.once.Do(func() {
		s.cancel()
		close(s.closed)
		s.conn.CloseNow()
	})
}

type sessionStore struct {
	mu       sync.RWMutex
	sessions map[string]*Session
}

func newSessionStore() *sessionStore {
	return &sessionStore{sessions: make(map[string]*Session)}
}

func (s *sessionStore) register(session *Session) {
	s.mu.Lock()
	previous := s.sessions[session.id]
	s.sessions[session.id] = session
	s.mu.Unlock()
	if previous != nil && previous != session {
		previous.close()
	}
}

func (s *sessionStore) remove(session *Session) {
	s.mu.Lock()
	if s.sessions[session.id] == session {
		delete(s.sessions, session.id)
	}
	s.mu.Unlock()
}

func (s *sessionStore) get(id string) *Session {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.sessions[id]
}

func (s *sessionStore) list() []SessionInfo {
	s.mu.RLock()
	result := make([]SessionInfo, 0, len(s.sessions))
	for _, session := range s.sessions {
		result = append(result, session.info())
	}
	s.mu.RUnlock()
	sort.Slice(result, func(i, j int) bool { return result[i].ID < result[j].ID })
	return result
}

func (s *sessionStore) close() {
	s.mu.Lock()
	sessions := make([]*Session, 0, len(s.sessions))
	for _, session := range s.sessions {
		sessions = append(sessions, session)
	}
	s.sessions = make(map[string]*Session)
	s.mu.Unlock()
	for _, session := range sessions {
		session.close()
	}
}
