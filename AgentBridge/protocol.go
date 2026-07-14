package agentbridge

import "encoding/json"

const (
	ProtocolVersion   = "cnc-agent/1"
	WebSocketProtocol = "cnc-agent.v1"
	maxMessageBytes   = 4 << 20
)

type protocolMessage struct {
	Type         string          `json:"type"`
	Protocol     string          `json:"protocol,omitempty"`
	Token        string          `json:"token,omitempty"`
	SessionID    string          `json:"sessionId,omitempty"`
	Capabilities []string        `json:"capabilities,omitempty"`
	ID           string          `json:"id,omitempty"`
	Op           string          `json:"op,omitempty"`
	Args         json.RawMessage `json:"args,omitempty"`
	OK           bool            `json:"ok,omitempty"`
	Result       json.RawMessage `json:"result,omitempty"`
	Error        *ProtocolError  `json:"error,omitempty"`
}

// ProtocolError is returned by the browser's raw engine adapter.
type ProtocolError struct {
	Code    string          `json:"code"`
	Message string          `json:"message"`
	Details json.RawMessage `json:"details,omitempty"`
}

func (e *ProtocolError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}
