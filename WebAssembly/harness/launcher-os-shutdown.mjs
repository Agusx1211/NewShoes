export const PROJECT_GITHUB_URL = "https://github.com/Agusx1211/NewShoes";

export function requestOsShutdown({
  gameRunning,
  storageBusy,
  closeWindow,
  navigate,
  schedule,
  isDocumentHidden,
  fallbackDelayMs = 450,
}) {
  if (storageBusy) return { ok: false, reason: "storage-busy" };
  if (gameRunning) return { ok: false, reason: "game-running" };
  let closeAttempted = false;
  try {
    closeWindow();
    closeAttempted = true;
  } catch {
    // A normal browser tab commonly rejects scripted close. The bounded
    // fallback below remains authoritative.
  }
  schedule(() => {
    if (!isDocumentHidden()) navigate(PROJECT_GITHUB_URL);
  }, fallbackDelayMs);
  return { ok: true, closeAttempted, fallbackUrl: PROJECT_GITHUB_URL, fallbackDelayMs };
}
