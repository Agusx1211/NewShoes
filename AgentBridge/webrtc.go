package agentbridge

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/pion/datachannel"
	"github.com/pion/webrtc/v4"
)

const (
	defaultWebRTCSignalURL = "webrtc://relay.newshoes.gg/agent"
	dataChannelLabel       = "cnc-agent"
)

var defaultICEServers = []webrtc.ICEServer{{URLs: []string{
	"stun:stun.l.google.com:19302",
	"stun:stun1.l.google.com:19302",
	"stun:stun2.l.google.com:19302",
	"stun:stun.cloudflare.com:3478",
}}}

type signalEnvelope struct {
	Type    string `json:"type"`
	Present bool   `json:"present,omitempty"`
	Payload string `json:"payload,omitempty"`
}

type rtcSignal struct {
	Type      string                   `json:"type"`
	SDP       string                   `json:"sdp,omitempty"`
	Candidate *webrtc.ICECandidateInit `json:"candidate,omitempty"`
}

type signalingCipher struct {
	aead cipher.AEAD
}

func newSignalingCipher(token string) (*signalingCipher, string, error) {
	roomHash := sha256.Sum256([]byte("cnc-agent-webrtc-room/v1:" + token))
	key := sha256.Sum256([]byte("cnc-agent-webrtc-signal/v1:" + token))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, "", err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, "", err
	}
	return &signalingCipher{aead: aead}, hex.EncodeToString(roomHash[:]), nil
}

func (c *signalingCipher) encrypt(signal rtcSignal) (string, error) {
	plain, err := json.Marshal(signal)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	sealed := c.aead.Seal(nonce, nonce, plain, nil)
	return base64.RawURLEncoding.EncodeToString(sealed), nil
}

func (c *signalingCipher) decrypt(encoded string) (rtcSignal, error) {
	sealed, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil || len(sealed) < c.aead.NonceSize()+c.aead.Overhead() {
		return rtcSignal{}, errors.New("invalid encrypted signal")
	}
	plain, err := c.aead.Open(nil, sealed[:c.aead.NonceSize()], sealed[c.aead.NonceSize():], nil)
	if err != nil {
		return rtcSignal{}, errors.New("decrypt signal")
	}
	var signal rtcSignal
	if err := json.Unmarshal(plain, &signal); err != nil {
		return rtcSignal{}, errors.New("decode signal")
	}
	return signal, nil
}

type signalSocket struct {
	conn   *websocket.Conn
	cipher *signalingCipher
	mu     sync.Mutex
}

func (s *signalSocket) send(ctx context.Context, signal rtcSignal) error {
	payload, err := s.cipher.encrypt(signal)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return wsjson.Write(ctx, s.conn, signalEnvelope{Type: "signal", Payload: payload})
}

func signalingURL(rawURL, room string) (string, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	switch parsed.Scheme {
	case "webrtc":
		parsed.Scheme = "wss"
	case "webrtc+insecure":
		parsed.Scheme = "ws"
	default:
		return "", errors.New("WebRTC signaling URL must use webrtc: or webrtc+insecure:")
	}
	query := parsed.Query()
	query.Set("room", room)
	query.Set("role", "bridge")
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}

// RunWebRTC keeps an outbound WebRTC endpoint connected until ctx is canceled.
// The relay sees only a token-derived room identifier and encrypted signaling.
func (s *Server) RunWebRTC(ctx context.Context, rawSignalURL string) error {
	if rawSignalURL == "" {
		rawSignalURL = defaultWebRTCSignalURL
	}
	cipher, room, err := newSignalingCipher(s.config.EngineToken)
	if err != nil {
		return err
	}
	socketURL, err := signalingURL(rawSignalURL, room)
	if err != nil {
		return err
	}
	backoff := 250 * time.Millisecond
	for ctx.Err() == nil {
		err = s.runWebRTCPeer(ctx, socketURL, cipher)
		if ctx.Err() != nil {
			return nil
		}
		timer := time.NewTimer(backoff)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil
		case <-timer.C:
		}
		if backoff < 5*time.Second {
			backoff *= 2
		}
	}
	return err
}

func (s *Server) runWebRTCPeer(ctx context.Context, socketURL string, cipher *signalingCipher) error {
	peerCtx, cancelPeer := context.WithCancel(ctx)
	defer cancelPeer()
	conn, _, err := websocket.Dial(peerCtx, socketURL, nil)
	if err != nil {
		return fmt.Errorf("connect WebRTC signaling: %w", err)
	}
	defer conn.CloseNow()
	conn.SetReadLimit(256 * 1024)
	signals := &signalSocket{conn: conn, cipher: cipher}

	settingEngine := webrtc.SettingEngine{}
	settingEngine.DetachDataChannels()
	api := webrtc.NewAPI(webrtc.WithSettingEngine(settingEngine))
	peer, err := api.NewPeerConnection(webrtc.Configuration{ICEServers: defaultICEServers})
	if err != nil {
		return err
	}
	defer peer.Close()

	ordered := true
	channelProtocol := WebSocketProtocol
	channel, err := peer.CreateDataChannel(dataChannelLabel, &webrtc.DataChannelInit{
		Ordered:  &ordered,
		Protocol: &channelProtocol,
	})
	if err != nil {
		return err
	}
	done := make(chan struct{})
	var doneOnce sync.Once
	finish := func() {
		doneOnce.Do(func() {
			close(done)
			cancelPeer()
		})
	}
	channel.OnOpen(func() {
		raw, detachErr := channel.Detach()
		if detachErr != nil {
			finish()
			return
		}
		go func() {
			s.serveEngine(&dataChannelMessageConn{conn: raw, gracefulClose: channel.GracefulClose})
			finish()
		}()
	})
	channel.OnClose(finish)
	channel.OnError(func(error) { finish() })
	peer.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		if state == webrtc.PeerConnectionStateFailed || state == webrtc.PeerConnectionStateClosed {
			finish()
		}
	})
	peer.OnICECandidate(func(candidate *webrtc.ICECandidate) {
		if candidate == nil {
			return
		}
		go func() {
			sendCtx, cancel := context.WithTimeout(peerCtx, 5*time.Second)
			defer cancel()
			value := candidate.ToJSON()
			_ = signals.send(sendCtx, rtcSignal{Type: "candidate", Candidate: &value})
		}()
	})

	offerSent := false
	remoteSet := false
	queuedCandidates := make([]webrtc.ICECandidateInit, 0)
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-done:
			return errors.New("WebRTC data channel closed")
		default:
		}
		var envelope signalEnvelope
		err := wsjson.Read(peerCtx, conn, &envelope)
		if err != nil {
			return err
		}
		if envelope.Type == "peer" && envelope.Present && !offerSent {
			offer, err := peer.CreateOffer(nil)
			if err != nil {
				return err
			}
			if err := peer.SetLocalDescription(offer); err != nil {
				return err
			}
			if err := signals.send(peerCtx, rtcSignal{Type: "offer", SDP: offer.SDP}); err != nil {
				return err
			}
			offerSent = true
			continue
		}
		if envelope.Type == "peer" && !envelope.Present && offerSent {
			return errors.New("WebRTC browser peer disconnected")
		}
		if envelope.Type != "signal" || envelope.Payload == "" {
			continue
		}
		signal, err := cipher.decrypt(envelope.Payload)
		if err != nil {
			continue
		}
		switch signal.Type {
		case "answer":
			if !offerSent || remoteSet {
				continue
			}
			if err := peer.SetRemoteDescription(webrtc.SessionDescription{Type: webrtc.SDPTypeAnswer, SDP: signal.SDP}); err != nil {
				return err
			}
			remoteSet = true
			for _, candidate := range queuedCandidates {
				if err := peer.AddICECandidate(candidate); err != nil {
					return err
				}
			}
			queuedCandidates = nil
		case "candidate":
			if signal.Candidate == nil {
				continue
			}
			if !remoteSet {
				queuedCandidates = append(queuedCandidates, *signal.Candidate)
			} else if err := peer.AddICECandidate(*signal.Candidate); err != nil {
				return err
			}
		}
	}
}

type dataChannelMessageConn struct {
	conn          datachannel.ReadWriteCloser
	gracefulClose func() error
	readBuffer    []byte
	mu            sync.Mutex
}

func (c *dataChannelMessageConn) Read(ctx context.Context, message *protocolMessage) error {
	if deadline, ok := ctx.Deadline(); ok {
		if conn, ok := c.conn.(datachannel.ReadDeadliner); ok {
			_ = conn.SetReadDeadline(deadline)
			defer conn.SetReadDeadline(time.Time{})
		}
	}
	if c.readBuffer == nil {
		c.readBuffer = make([]byte, maxMessageBytes)
	}
	n, isString, err := c.conn.ReadDataChannel(c.readBuffer)
	if err != nil {
		return err
	}
	if !isString {
		return errors.New("agent message must be text")
	}
	return json.Unmarshal(c.readBuffer[:n], message)
}

func (c *dataChannelMessageConn) Write(ctx context.Context, message protocolMessage) error {
	encoded, err := json.Marshal(message)
	if err != nil {
		return err
	}
	if len(encoded) > maxMessageBytes {
		return errors.New("agent message is too large")
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if deadline, ok := ctx.Deadline(); ok {
		if conn, ok := c.conn.(datachannel.WriteDeadliner); ok {
			_ = conn.SetWriteDeadline(deadline)
			defer conn.SetWriteDeadline(time.Time{})
		}
	}
	_, err = c.conn.WriteDataChannel(encoded, true)
	return err
}

func (c *dataChannelMessageConn) Close(_ int, _ string) error {
	if c.gracefulClose != nil {
		return c.gracefulClose()
	}
	return c.conn.Close()
}
func (c *dataChannelMessageConn) CloseNow() error { return c.conn.Close() }
