package agentbridge

import (
	"context"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

type messageConn interface {
	Read(context.Context, *protocolMessage) error
	Write(context.Context, protocolMessage) error
	Close(int, string) error
	CloseNow() error
}

type websocketMessageConn struct {
	conn *websocket.Conn
}

func (c *websocketMessageConn) Read(ctx context.Context, message *protocolMessage) error {
	return wsjson.Read(ctx, c.conn, message)
}

func (c *websocketMessageConn) Write(ctx context.Context, message protocolMessage) error {
	return wsjson.Write(ctx, c.conn, message)
}

func (c *websocketMessageConn) Close(code int, reason string) error {
	return c.conn.Close(websocket.StatusCode(code), reason)
}

func (c *websocketMessageConn) CloseNow() error {
	return c.conn.CloseNow()
}
