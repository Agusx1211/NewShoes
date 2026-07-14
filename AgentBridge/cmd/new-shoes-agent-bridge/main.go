package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	agentbridge "github.com/Agusx1211/NewShoes/AgentBridge"
)

func randomToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

func main() {
	listen := flag.String("listen", "127.0.0.1:18888", "HTTP listen address")
	publicEngineURL := flag.String("engine-url", "", "WebSocket URL the browser should connect to")
	engineToken := flag.String("engine-token", "", "browser-to-bridge token (random when omitted)")
	apiToken := flag.String("api-token", "", "REST bearer token (random when omitted)")
	requestTimeout := flag.Duration("request-timeout", 30*time.Second, "maximum REST-to-engine request time")
	eventPollInterval := flag.Duration("event-poll-interval", 250*time.Millisecond,
		"compact snapshot interval while an event subscriber is active")
	eventCapabilityInterval := flag.Duration("event-capability-interval", time.Second,
		"capability snapshot interval while an event subscriber is active")
	eventCoalesceWindow := flag.Duration("event-coalesce-window", 500*time.Millisecond,
		"window for combining related tactical changes")
	eventIdleTimeout := flag.Duration("event-idle-timeout", 30*time.Second,
		"grace period to retain a resumable watcher after its final subscriber disconnects")
	eventHeartbeatInterval := flag.Duration("event-heartbeat-interval", 15*time.Second,
		"SSE heartbeat interval")
	eventReplayLimit := flag.Int("event-replay-limit", 2048,
		"maximum coalesced events retained per observation mode")
	flag.Parse()

	if *engineToken == "" {
		generated, err := randomToken()
		if err != nil {
			log.Fatalf("generate engine token: %v", err)
		}
		*engineToken = generated
	}
	if *apiToken == "" {
		generated, err := randomToken()
		if err != nil {
			log.Fatalf("generate API token: %v", err)
		}
		*apiToken = generated
	}
	if *publicEngineURL == "" {
		host := *listen
		if strings.HasPrefix(host, ":") {
			host = "127.0.0.1" + host
		}
		*publicEngineURL = "ws://" + host + "/engine"
	}

	bridge, err := agentbridge.NewServer(agentbridge.Config{
		EngineToken:             *engineToken,
		APIToken:                *apiToken,
		RequestTimeout:          *requestTimeout,
		EventPollInterval:       *eventPollInterval,
		EventCapabilityInterval: *eventCapabilityInterval,
		EventCoalesceWindow:     *eventCoalesceWindow,
		EventIdleTimeout:        *eventIdleTimeout,
		EventHeartbeatInterval:  *eventHeartbeatInterval,
		EventReplayLimit:        *eventReplayLimit,
	})
	if err != nil {
		log.Fatal(err)
	}
	defer bridge.Close()

	server := &http.Server{
		Addr:              *listen,
		Handler:           bridge.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}

	// This is intentionally the only place the generated credential is shown.
	// It is launch configuration, not an application log field.
	fmt.Fprintf(os.Stdout, "Agent bridge listening on http://%s\n", *listen)
	fmt.Fprintf(os.Stdout, "Browser config: {\"agentBridge\":{\"url\":%q,\"token\":%q,\"sessionId\":\"game-1\"}}\n", *publicEngineURL, *engineToken)
	fmt.Fprintf(os.Stdout, "REST authorization: Bearer %s\n", *apiToken)

	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("serve: %v", err)
		}
	}()

	shutdownCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	<-shutdownCtx.Done()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}
