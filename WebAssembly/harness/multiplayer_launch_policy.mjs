// Emergency release policy: multiplayer discovery must never delay or prevent
// the game from launching. Keep automatic P2P disabled until the production
// relay is deployed and independently health-checked.
export const P2P_AUTO_CONNECT_ENABLED = false;

export function shouldAutoConnectP2p(room) {
  return P2P_AUTO_CONNECT_ENABLED && String(room ?? "").trim().length > 0;
}
