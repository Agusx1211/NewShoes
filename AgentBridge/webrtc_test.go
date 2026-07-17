package agentbridge

import (
	"strings"
	"testing"
)

func TestWebRTCPairingAndSignalEncryption(t *testing.T) {
	cipher, room, err := newSignalingCipher("pairing-secret")
	if err != nil {
		t.Fatal(err)
	}
	if len(room) != 64 || strings.Contains(room, "pairing-secret") {
		t.Fatalf("room must be an opaque SHA-256 identifier: %q", room)
	}
	payload, err := cipher.encrypt(rtcSignal{Type: "offer", SDP: "private-sdp"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(payload, "private-sdp") {
		t.Fatal("encrypted signal exposed its SDP")
	}
	decoded, err := cipher.decrypt(payload)
	if err != nil {
		t.Fatal(err)
	}
	if decoded.Type != "offer" || decoded.SDP != "private-sdp" {
		t.Fatalf("unexpected decrypted signal: %#v", decoded)
	}
}

func TestWebRTCSignalingURLContainsOnlyDerivedRoom(t *testing.T) {
	url, err := signalingURL("webrtc://relay.example/agent", strings.Repeat("a", 64))
	if err != nil {
		t.Fatal(err)
	}
	if url != "wss://relay.example/agent?role=bridge&room="+strings.Repeat("a", 64) {
		t.Fatalf("unexpected signaling URL: %s", url)
	}
	if _, err := signalingURL("https://relay.example/agent", strings.Repeat("a", 64)); err == nil {
		t.Fatal("accepted a non-WebRTC signaling URL")
	}
}
