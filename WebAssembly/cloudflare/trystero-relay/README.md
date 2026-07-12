# Trystero discovery relay

This Worker is the project-owned discovery/signaling relay for browser
multiplayer. It implements the narrow Nostr NIP-01 subset used by Trystero
0.25.2 and routes all WebSocket connections through one hibernating Durable
Object. Game datagrams never pass through this service; after discovery they
travel directly between peers over encrypted WebRTC data channels.

The relay validates event hashes and Schnorr signatures, accepts only
Trystero's ephemeral event-kind and `x`-topic shape, bounds subscriptions and
message sizes, retains at most 512 events for two minutes, and permits browser
connections only from the configured Project New Shoes origins. The Origin
check is an abuse-reduction boundary, not authentication: non-browser clients
can forge that header. Do not put secrets in the browser configuration or in
Nostr events.

Run the local Worker protocol gate with:

```sh
cd WebAssembly
npm run test:trystero-relay
```

Production deployment is owned by `.github/workflows/trystero-relay.yml`. The
`cloudflare-relay` GitHub environment needs `CLOUDFLARE_ACCOUNT_ID` and a
`CLOUDFLARE_API_TOKEN` with Workers Scripts, Durable Objects, and DNS/custom
hostname permissions for `newshoes.gg`. The deployed WebSocket endpoint is
`wss://relay.newshoes.gg/nostr`; `https://relay.newshoes.gg/health` is a
credential-free liveness check.
