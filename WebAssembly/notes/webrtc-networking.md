# WebRTC multiplayer transport

The browser port carries the original encrypted Generals UDP datagrams over a
mesh of reliable, ordered `RTCDataChannel`s. The original `Transport`,
`ConnectionManager`, frame data, LAN messages, command IDs, CRCs, and retry
logic remain in C++. The browser layer only replaces socket delivery.

Each room member receives a stable virtual IPv4 address in `10.77.0.0/24`.
That address is exposed through the original `IPEnumeration` path, used as the
source address for received packets, and used to route unicast packets to the
right peer. `255.255.255.255` packets fan out to every open peer channel, which
preserves LAN discovery and lobby broadcasts.

The WebSocket signaling server carries only room membership, SDP offers and
answers, and ICE candidates. It rejects binary frames; no game packet is sent
through it. A room is limited to eight peers to match the engine slot count.

## LAN play

Run the normal harness on a machine reachable by every player:

```sh
cd WebAssembly
HOST=0.0.0.0 PORT=8123 npm run serve:harness
```

Open `http://<host>:8123/harness/play.html` on each machine. Enter the same
room in the launcher, leave the default signaling URL in place, and choose a
different player name. After the engine starts, use the original
**Multiplayer → LAN** screens. Host candidates are sufficient on an ordinary
LAN, so an external ICE server is not required.

## Internet play

Serve the game over HTTPS and proxy `/webrtc` as a WebSocket upgrade to the
same harness process, or run the standalone signaling process behind a TLS
terminating reverse proxy:

```sh
HOST=0.0.0.0 PORT=8090 npm run serve:webrtc-signaling
```

Players enter its public `wss://.../webrtc` URL and the same room code. Add a
STUN URL in the advanced connection settings so ICE can discover public NAT
mappings. TURN URLs, usernames, and credentials are also accepted for networks
where a direct path is impossible; TURN is a compatibility fallback and, when
selected by ICE, is no longer a direct P2P data path. TURN credentials are kept
only for the current page session and are not written to local storage.

The bundled signaling server is intentionally minimal. Before exposing it as
a public service, add deployment-level authentication, TLS, rate limiting, and
room-code abuse protection.

## Verified match path

`npm run test:browser-lan-webrtc-playable-match` boots two complete game
instances with the shipped archives, enters the original Multiplayer → LAN
screens, and drives the original `LANAPI` host/discovery/join/options/ready/
game-start flow. It then loads the same real map in both clients and advances
the original `Network::update` lockstep simulation while asserting distinct
local player IDs, two human armies, synchronized logic frames, and no CRC
mismatch. The harness captures each player's canvas under
`artifacts/networking/` and asserts that the signaling server carried zero
game-payload bytes.

Wasm uses four-byte `WideChar`, unlike Win32's two-byte `wchar_t`. The browser
LAN wire budget therefore reduces the game-options field and sends only the
active portion of variable LAN messages so every original encrypted datagram
stays within `MAX_PACKET_SIZE`. Native packet layout is unchanged.
