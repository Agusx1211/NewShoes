import { redactLarge, sanitizeDumpFileName } from "./issue-recorder.mjs";

const CRASH_RPC_TIMEOUT_MS = 2_500;
const crashes = new WeakMap();
const reportsInProgress = new WeakSet();

function nowIso() {
  return new Date().toISOString();
}

function stableNowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function truncateString(value, max = 512) {
  if (typeof value !== "string" || value.length <= max) return value;
  return `${value.slice(0, max)}...(+${value.length - max} chars)`;
}

function serializeError(error) {
  if (error == null) return null;
  if (error instanceof Error || typeof error === "object") {
    return {
      name: truncateString(error.name ?? "Error", 120),
      message: truncateString(error.message ?? String(error), 2_000),
      stack: truncateString(error.stack ?? "", 12_000),
      cause: error.cause == null ? null : truncateString(String(error.cause), 2_000),
    };
  }
  return {
    name: typeof error,
    message: truncateString(String(error), 2_000),
    stack: "",
    cause: null,
  };
}

export function normalizeCrashFailure(failure = {}) {
  const error = serializeError(failure.error);
  return {
    kind: truncateString(String(failure.kind ?? "runtime-failure"), 120),
    stage: failure.stage == null ? null : truncateString(String(failure.stage), 120),
    message: truncateString(String(failure.message ?? error?.message ?? "Unknown failure"), 2_000),
    detail: redactLarge(failure.detail ?? null),
    error,
    at: nowIso(),
    t: Math.round(stableNowMs()),
  };
}

function promiseWithTimeout(promise, timeoutMs, label) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve({
        ok: false,
        timeout: true,
        error: `${label} did not respond within ${timeoutMs}ms`,
      }), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

function canvasToDataUrl(canvas) {
  if (!canvas) return null;
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20_000);
}

function captureCrash(recorder, failure) {
  const event = normalizeCrashFailure(failure);
  const current = crashes.get(recorder);
  if (current) {
    current.related.push(event);
    if (current.related.length > 20) current.related.splice(0, current.related.length - 20);
    return current;
  }
  const screenshotDataUrl = canvasToDataUrl(recorder.canvas);
  const crash = {
    schema: "cnc.crash.v1",
    id: `${recorder.id}-crash`,
    capturedAt: event.at,
    markerFrame: recorder.currentEngineFrame(),
    primary: event,
    related: [],
    pageScreenshot: screenshotDataUrl
      ? {
          dataUrl: screenshotDataUrl,
          width: recorder.canvas?.width ?? null,
          height: recorder.canvas?.height ?? null,
        }
      : null,
  };
  crashes.set(recorder, crash);
  return crash;
}

async function captureCrashDiagnostics(recorder) {
  const commands = [
    ["screenshot", {}],
    ["state", {}],
    ["queryDrawables", {}],
    ["querySelection", {}],
    ["d3d8TextureInventory", { sampleLimit: 8 }],
    ["realEngineAnimReport", { maxEntries: 80 }],
  ];
  const results = await Promise.all(commands.map(async ([command, payload]) => [
    command,
    await promiseWithTimeout(recorder.safeRpc(command, payload), CRASH_RPC_TIMEOUT_MS, command),
  ]));
  let storage = null;
  try {
    if (typeof navigator.storage?.estimate === "function") {
      storage = await promiseWithTimeout(
        navigator.storage.estimate(),
        CRASH_RPC_TIMEOUT_MS,
        "storage estimate",
      );
    }
  } catch (error) {
    storage = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  let wasmMemory = null;
  try {
    const module = window.CnCPort?.engineModule?.();
    const buffer = module?.wasmMemory?.buffer ?? module?.HEAPU8?.buffer;
    wasmMemory = buffer ? {
      bytes: buffer.byteLength,
      shared: typeof SharedArrayBuffer !== "undefined" && buffer instanceof SharedArrayBuffer,
    } : null;
  } catch (error) {
    wasmMemory = { error: error instanceof Error ? error.message : String(error) };
  }
  const performanceMemory = typeof performance !== "undefined" && performance.memory ? {
    jsHeapSizeLimit: performance.memory.jsHeapSizeLimit ?? null,
    totalJSHeapSize: performance.memory.totalJSHeapSize ?? null,
    usedJSHeapSize: performance.memory.usedJSHeapSize ?? null,
  } : null;
  return {
    capturedAt: nowIso(),
    timeoutMs: CRASH_RPC_TIMEOUT_MS,
    rpc: Object.fromEntries(results),
    mainRealmState: redactLarge(window.CnCPort?.state ?? null),
    storage,
    memory: {
      wasm: wasmMemory,
      javascript: performanceMemory,
    },
  };
}

function crashIssue(recorder, crash, diagnostics, logs) {
  const rawScreenshot = diagnostics?.rpc?.screenshot?.screenshot;
  const screenshotDataUrl = typeof rawScreenshot === "string"
    ? rawScreenshot
    : rawScreenshot?.dataUrl ?? crash.pageScreenshot?.dataUrl ?? null;
  return {
    id: "issue-crash",
    createdAt: crash.capturedAt,
    title: `Automatic crash report: ${crash.primary.message}`,
    comment: `Fatal ${crash.primary.kind} during ${crash.primary.stage ?? "an unknown stage"}.`,
    markerFrame: crash.markerFrame,
    screenshot: {
      dataUrl: screenshotDataUrl,
      width: rawScreenshot?.width ?? crash.pageScreenshot?.width ?? recorder.canvas?.width ?? null,
      height: rawScreenshot?.height ?? crash.pageScreenshot?.height ?? recorder.canvas?.height ?? null,
      centerPixel: rawScreenshot?.centerPixel ?? null,
      topLeftPixel: rawScreenshot?.topLeftPixel ?? null,
    },
    annotation: {
      strokes: [],
      strokeCount: 0,
      annotatedDataUrl: null,
      annotatedMime: null,
    },
    shallowState: diagnostics?.rpc?.state ?? null,
    deepSnapshot: diagnostics,
    timelineWindow: recorder.events.slice(-2_000),
    logsTail: logs,
    automatic: true,
  };
}

async function downloadCrashReport(recorder, crash, reason = "crash-report") {
  if (reportsInProgress.has(recorder)) return null;
  reportsInProgress.add(recorder);
  recorder.setStatus("building crash report");
  try {
    const diagnostics = await captureCrashDiagnostics(recorder);
    const base = await recorder.buildBundle(reason);
    const issue = crashIssue(recorder, crash, diagnostics, base.logs);
    const issues = [...base.issues, issue];
    const bundle = {
      ...base,
      crash: { ...crash, diagnostics },
      issues,
      manifest: {
        ...base.manifest,
        counts: { ...base.manifest.counts, issues: issues.length },
      },
      replay: {
        ...base.replay,
        issueFrames: [...base.replay.issueFrames, {
          id: issue.id,
          frame: issue.markerFrame,
          title: issue.title,
        }],
      },
    };
    const text = JSON.stringify(bundle, null, 2);
    const filename = `${sanitizeDumpFileName(`${recorder.id}-${reason}`)}.cncdump.json`;
    downloadBlob(new Blob([text], { type: "application/json" }), filename);
    recorder.record("crash-report.download", { reason, filename, bytes: text.length }, { force: true });
    recorder.setStatus(`downloaded ${filename}`);
    return { bundle, filename, bytes: text.length };
  } finally {
    reportsInProgress.delete(recorder);
    recorder.refreshCaptureOverlay();
  }
}

function installCrashDialog() {
  const style = document.createElement("style");
  style.id = "crashDiagnosticsStyles";
  style.textContent = `
.crash-modal{position:fixed;z-index:23000;inset:0;display:grid;place-items:center;padding:24px;background:rgba(8,18,31,.62);backdrop-filter:blur(2px)}
.crash-dialog{width:min(620px,100%);overflow:hidden;border:3px solid #1255c7;border-radius:8px 8px 3px 3px;color:#111;background:#ece9d8;box-shadow:0 18px 54px rgba(0,0,0,.48),inset 0 0 0 1px #fff;font:12px Tahoma,"Segoe UI",sans-serif}
.crash-titlebar{display:flex;align-items:center;justify-content:space-between;min-height:30px;padding:3px 4px 3px 9px;color:#fff;background:linear-gradient(180deg,#2988ee 0%,#0866d7 14%,#0754bf 72%,#0647a7 100%);text-shadow:1px 1px #0b377c;font-weight:700}
.crash-titlebar button{width:24px;height:22px;padding:0 0 2px;border:1px solid #fff;border-radius:3px;color:#fff;background:linear-gradient(135deg,#ef936e,#c8321c 60%,#a62313);box-shadow:inset 0 0 0 1px rgba(117,16,5,.45);font:700 18px/18px Arial,sans-serif}
.crash-body{display:grid;grid-template-columns:48px minmax(0,1fr);gap:16px;padding:24px 26px 18px}.crash-error-icon{display:grid;place-items:center;width:40px;height:40px;border:2px solid #fff;border-radius:50%;color:#fff;background:#d52522;box-shadow:0 0 0 1px #a30f0d,inset 0 -3px 5px rgba(91,0,0,.35);font:700 31px/1 Arial,sans-serif}
.crash-copy h1{margin:1px 0 9px;color:#111;font:700 15px Tahoma,"Segoe UI",sans-serif}.crash-copy p{margin:0 0 12px;line-height:1.45}.crash-copy ol{margin:14px 0;padding-left:22px;line-height:1.55}.crash-technical-detail{max-height:82px;overflow:auto;margin:10px 0 0;padding:8px 10px;border:1px solid #aaa79a;color:#3b3b35;background:#fff;white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.35 Consolas,"Courier New",monospace}.crash-copy .crash-privacy{margin-bottom:0;color:#5d5a50;font-size:11px}
.crash-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:11px 16px 14px;border-top:1px solid #d1cdbc;background:#f4f1e4}.crash-actions button,.crash-actions a{box-sizing:border-box;min-height:29px;padding:6px 12px;border:1px solid #777;border-radius:3px;color:#111;background:linear-gradient(#fff,#e5e1d4);box-shadow:inset 0 0 0 1px #fff;text-decoration:none;font:12px Tahoma,"Segoe UI",sans-serif}.crash-actions .crash-download{border-color:#2358a6;outline:1px solid rgba(35,88,166,.25);font-weight:700}.crash-actions button:focus-visible,.crash-actions a:focus-visible{outline:2px solid #111;outline-offset:1px}
@media(max-width:620px){.crash-modal{padding:10px}.crash-body{grid-template-columns:38px minmax(0,1fr);gap:11px;padding:18px 15px 14px}.crash-error-icon{width:34px;height:34px;font-size:26px}.crash-actions{flex-wrap:wrap}.crash-actions .crash-download{flex-basis:100%}}
`;
  document.head.appendChild(style);
  document.body.insertAdjacentHTML("beforeend", `
<div id="crashModal" class="crash-modal">
  <section class="crash-dialog" role="alertdialog" aria-modal="true" aria-labelledby="crashDialogTitle" aria-describedby="crashDialogMessage">
    <header class="crash-titlebar"><span>Project New Shoes</span><button id="crashClose" type="button" aria-label="Restart Project New Shoes">×</button></header>
    <div class="crash-body"><div class="crash-error-icon" aria-hidden="true">×</div><div class="crash-copy">
      <h1 id="crashDialogTitle">Zero Hour has encountered a problem</h1>
      <p id="crashDialogMessage">The game runtime stopped unexpectedly. A diagnostics report can tell us what happened.</p>
      <pre id="crashTechnicalDetail" class="crash-technical-detail"></pre>
      <ol><li>Download the full diagnostics report below.</li><li>Create an issue, describe what you were doing, and attach the <code>.cncdump.json</code> file.</li></ol>
      <p class="crash-privacy">The report contains engine logs, build and browser details, recent runtime events, and a screenshot when available. It does not include your original game archives.</p>
    </div></div>
    <footer class="crash-actions"><button id="crashDownload" class="crash-download" type="button">Download full diagnostics report</button><a id="crashCreateIssue" href="https://github.com/Agusx1211/NewShoes/issues/new" target="_blank" rel="noopener noreferrer">Create GitHub issue</a><button id="crashReload" type="button">Restart</button></footer>
  </section>
</div>`);
  return document.querySelector("#crashModal");
}

function crashTechnicalText(crash) {
  const primary = crash.primary;
  const lines = [
    `Failure: ${primary.kind}`,
    `Stage: ${primary.stage ?? "unknown"}`,
    `Time: ${primary.at ?? crash.capturedAt}`,
  ];
  if (primary.error?.name) lines.push(`Error: ${primary.error.name}`);
  if (primary.message) lines.push(`Message: ${primary.message}`);
  return lines.join("\n");
}

export function showCrashDiagnostics(recorder, failure) {
  const crash = captureCrash(recorder, failure);
  const modal = document.querySelector("#crashModal") ?? installCrashDialog();
  const download = modal.querySelector("#crashDownload");
  download.disabled = false;
  download.textContent = "Download full diagnostics report";
  modal.querySelector("#crashTechnicalDetail").textContent = crashTechnicalText(crash);
  if (modal.dataset.bound !== "true") {
    modal.dataset.bound = "true";
    for (const button of [modal.querySelector("#crashClose"), modal.querySelector("#crashReload")]) {
      button.addEventListener("click", () => window.location.reload());
    }
    download.addEventListener("click", async () => {
      if (download.disabled) return;
      const original = download.textContent;
      download.disabled = true;
      download.textContent = "Building report…";
      try {
        const result = await downloadCrashReport(recorder, crash);
        download.textContent = result ? "Report downloaded" : "Report unavailable";
      } catch (error) {
        download.textContent = "Download failed — try again";
        download.title = error?.message ?? String(error);
      } finally {
        if (download.textContent !== "Report downloaded") {
          setTimeout(() => {
            download.disabled = false;
            download.textContent = original;
          }, 2_000);
        }
      }
    });
    modal.querySelector("#crashCreateIssue").addEventListener("click", () => {
      recorder.record("crash-report.issue-link", { crashId: crash.id }, { force: true });
    });
  }
  setTimeout(() => download.focus(), 0);
  return crash;
}
