// Multiplayer discovery is best-effort. Registration runs beside game startup
// and must always settle as a result object instead of rejecting into launch.
export const P2P_AUTO_CONNECT_ENABLED = true;
export const P2P_REGISTRATION_TIMEOUT_MS = 20_000;

export function shouldAutoConnectP2p(room) {
  return P2P_AUTO_CONNECT_ENABLED && String(room ?? "").trim().length > 0;
}

function errorText(value, fallback) {
  if (value instanceof Error && value.message) return value.message;
  if (typeof value === "string" && value) return value;
  return fallback;
}

function beginEndpointCleanup(rpc) {
  void Promise.resolve()
    .then(() => rpc("browserWebRtcEndpointDisconnect", {
      preserveConfiguration: true,
      preserveStatus: true,
    }))
    .catch(() => {});
}

export async function registerP2pBestEffort({
  rpc,
  room,
  peerId = null,
  displayName = null,
  iceServers = [],
  timeoutMs = P2P_REGISTRATION_TIMEOUT_MS,
}) {
  if (!shouldAutoConnectP2p(room)) {
    return { ok: false, skipped: true, error: null, runtime: null, cleanupStarted: false };
  }
  const boundedTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? Math.floor(timeoutMs)
    : P2P_REGISTRATION_TIMEOUT_MS;
  let timeoutId = null;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve({
      ok: false,
      error: `P2P discovery timed out after ${boundedTimeoutMs}ms`,
    }), boundedTimeoutMs);
  });
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => rpc("browserWebRtcEndpointConnect", {
        room: String(room).trim(),
        peerId,
        displayName,
        iceServers,
        timeoutMs: boundedTimeoutMs,
      })),
      timeout,
    ]);
    if (result?.ok === true) {
      return {
        ok: true,
        skipped: false,
        error: null,
        runtime: result.runtime ?? null,
        cleanupStarted: false,
      };
    }
    beginEndpointCleanup(rpc);
    return {
      ok: false,
      skipped: false,
      error: errorText(result?.error, "P2P room registration failed"),
      runtime: result?.runtime ?? null,
      cleanupStarted: true,
    };
  } catch (error) {
    beginEndpointCleanup(rpc);
    return {
      ok: false,
      skipped: false,
      error: errorText(error, "P2P room registration failed"),
      runtime: null,
      cleanupStarted: true,
    };
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}
