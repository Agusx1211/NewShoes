const EXIT_WINDOW_NAME = "MainMenu.wnd:ButtonExit";

function readinessSample(queryResponse) {
  const queryWindow = queryResponse?.result;
  return {
    ready: queryResponse?.ok === true && queryWindow?.found === true,
    queryResponse,
  };
}

export async function waitForRelaunchExitReady(page, {
  timeoutMs = 120000,
  pollMs = 250,
  stableSamples = 4,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let consecutiveReady = 0;
  let sampleCount = 0;
  let lastSample = null;

  do {
    const queryResponse = await page.evaluate((name) =>
      window.CnCPort.rpc("queryWindowByName", { name }), EXIT_WINDOW_NAME);
    lastSample = readinessSample(queryResponse);
    sampleCount += 1;
    // Startup briefly creates and removes this layout. Require consecutive
    // observations so that transient ownership cannot race the click RPC.
    consecutiveReady = lastSample.ready ? consecutiveReady + 1 : 0;
    if (consecutiveReady >= stableSamples) {
      return { ...lastSample, sampleCount, stableSamples: consecutiveReady };
    }
    if (Date.now() >= deadline) break;
    await page.waitForTimeout(pollMs);
  } while (true);

  throw new Error(`relaunched Exit window did not become stably ready: ${JSON.stringify({
    sampleCount,
    consecutiveReady,
    lastSample,
  })}`);
}
