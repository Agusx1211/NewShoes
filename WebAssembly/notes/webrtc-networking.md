# WebRTC multiplayer transport

The browser port carries the original encrypted Generals UDP datagrams over a
mesh of reliable, ordered `RTCDataChannel`s. The original `Transport`,
`ConnectionManager`, frame data, LAN messages, command IDs, CRCs, and retry
logic remain in C++. The browser layer only replaces socket delivery.

Each room member derives a stable private virtual IPv4 address in `10.0.0.0/8`
from its Trystero peer ID. That address is exposed through the original
`IPEnumeration` path, used as the source address for received packets, and used
to route unicast packets to the right peer. `255.255.255.255` packets fan out
to every open peer channel, preserving LAN discovery and lobby broadcasts.

Trystero discovers peers and exchanges encrypted SDP through redundant public
Nostr relays. Once its base peer connection is active, the port opens a
dedicated reliable, ordered `cnc-udp-v1` data channel for the original game
traffic. Nostr relays never carry game packets. The browser handshake validates
the transport version and virtual address and limits a room to eight peers to
match the engine slot count.

## LAN play

Run the normal harness on a machine reachable by every player:

```sh
cd WebAssembly
HOST=0.0.0.0 PORT=8123 npm run serve:harness
```

Open `http://<host>:8123/harness/play.html` on each machine. Enter the same
room and choose a different player name. After the engine starts, use the
original **Multiplayer → LAN** screens. Trystero includes public STUN servers;
ordinary LAN host candidates do not require an additional ICE server.

## Internet play

Serve the game over HTTPS. Players only need the same hard-to-guess room code;
there is no Project New Shoes signaling service to deploy. The production
bundle connects to several public Nostr relays so discovery can tolerate relay
failure. Additional STUN/TURN URLs, usernames, and credentials are accepted for
networks where a direct ICE path is impossible. TURN is a compatibility
fallback and, when selected by ICE, game bytes traverse that TURN service.
Credentials are kept only for the current page session.

Room codes are shared secrets for discovery, not accounts or durable lobby
authorization. Public matchmaking, moderation, and authenticated invitations
remain separate product work.

## Verified match path

`npm run test:browser-lan-webrtc-four-player-threaded-match` boots four complete
threaded game instances with the shipped archives, forms the six-link direct
peer mesh, enters the original Multiplayer → LAN screens, and drives original
`LANAPI` host/discovery/join/options/ready/game-start flow. It selects the
official four-player Bear Town Beatdown map, verifies four human slots and
unique local player IDs, loads the same 270-object world on all clients, and
advances the original `Network::update` lockstep simulation with four members
and no CRC mismatch. Every client must retain three open dedicated game
RTCDataChannels while discovery remains `trystero-nostr`.

The threaded engine worker and window-owned `RTCDataChannel`s exchange UDP
datagrams through bounded `SharedArrayBuffer` rings. The adapter preserves
socket destination ports and clears LAN-lobby datagrams when the original game
transport is created. The four-player networking/simulation gate can disable
GPU rasterization on software-only CI; that run is not visual evidence. Use a
real-GPU playtest separately for rendering.

Wasm uses four-byte `WideChar`, unlike Win32's two-byte `wchar_t`. The browser
LAN wire budget therefore reduces the game-options field and sends only the
active portion of variable LAN messages so every original encrypted datagram
stays within `MAX_PACKET_SIZE`. Native packet layout is unchanged.
