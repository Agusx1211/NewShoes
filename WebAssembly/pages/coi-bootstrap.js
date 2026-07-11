/* Copyright (C) 2026 Project New Shoes contributors; SPDX-License-Identifier: GPL-3.0-or-later */

(() => {
  "use strict";

  const script = document.currentScript;
  const status = document.querySelector("#coi-status");
  const error = document.querySelector("#coi-error");
  const retry = document.querySelector("#coi-retry");
  const target = script?.dataset.coiTarget || "./";
  const attemptKey = "project-new-shoes-coi-bootstrap-attempts.v1";
  const workerVersion = "project-new-shoes.pages-root.v1";
  const versionRequest = "project-new-shoes:coi-worker-version";

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function fail(message) {
    setStatus("The browser could not start the threaded runtime.");
    if (error) {
      error.hidden = false;
      error.textContent = message;
    }
    if (retry) {
      retry.hidden = false;
      retry.addEventListener("click", () => location.reload(), { once: true });
    }
  }

  function attempts() {
    try { return Number(sessionStorage.getItem(attemptKey) || 0); } catch { return 0; }
  }

  function setAttempts(value) {
    try { sessionStorage.setItem(attemptKey, String(value)); } catch { /* optional */ }
  }

  function clearAttempts() {
    try { sessionStorage.removeItem(attemptKey); } catch { /* optional */ }
  }

  function safeTarget() {
    const scope = new URL("./", location.href);
    const requested = new URLSearchParams(location.search).get("coi-return");
    if (requested) {
      try {
        const parsed = new URL(requested, location.href);
        if (parsed.origin === scope.origin && parsed.pathname.startsWith(scope.pathname)) {
          const legacyPlay = new URL("harness/play.html", scope);
          const packagedLauncher = new URL("launcher.html", scope);
          if (parsed.pathname === legacyPlay.pathname || parsed.pathname === packagedLauncher.pathname) {
            const canonical = new URL(scope);
            canonical.search = parsed.search;
            canonical.hash = parsed.hash;
            return canonical.href;
          }
          return parsed.href;
        }
      } catch { /* use the default */ }
    }
    const fallback = new URL(target, location.href);
    if (fallback.pathname === scope.pathname) {
      fallback.search = location.search;
      fallback.hash = location.hash;
      fallback.searchParams.delete("coi-return");
      fallback.searchParams.delete("coi-sw");
    }
    return fallback.href;
  }

  function controlledWorkerVersion() {
    const controller = navigator.serviceWorker.controller;
    if (!controller) return Promise.resolve(null);
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      let timer = 0;
      let settled = false;
      const finish = (version) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        channel.port1.close();
        resolve(version);
      };
      timer = setTimeout(() => finish(null), 350);
      channel.port1.onmessage = (event) => {
        finish(event.data?.version || null);
      };
      try {
        controller.postMessage({ type: versionRequest }, [channel.port2]);
      } catch {
        finish(null);
      }
    });
  }

  async function waitForCurrentWorker() {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      if (await controlledWorkerVersion() === workerVersion) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("The updated isolation helper did not take control in time.");
  }

  async function installCurrentWorker() {
    const registration = await navigator.serviceWorker.register("./coi-serviceworker.js", {
      scope: "./",
      updateViaCache: "none",
    });
    await registration.update();
    await waitForCurrentWorker();
  }

  async function unregister() {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations
      .filter((registration) => registration.scope.startsWith(new URL("./", location.href).href))
      .map((registration) => registration.unregister()));
    clearAttempts();
    setStatus("The isolation helper is disabled for this browser profile.");
    if (retry) {
      retry.hidden = false;
      retry.textContent = "Enable and start";
      retry.addEventListener("click", () => location.replace(new URL("./", location.href)), { once: true });
    }
  }

  async function start() {
    const params = new URLSearchParams(location.search);
    if (params.get("coi-sw") === "unregister") {
      await unregister();
      return;
    }
    if (!window.isSecureContext) {
      fail("A secure HTTPS or localhost origin is required. GitHub Pages provides HTTPS automatically.");
      return;
    }
    if (!("serviceWorker" in navigator)) {
      fail("This browser does not support service workers. Use a current desktop version of Chrome, Edge, or Firefox.");
      return;
    }
    if (window.crossOriginIsolated && typeof SharedArrayBuffer === "function") {
      setStatus("Updating the local isolation helper…");
      await installCurrentWorker();
      clearAttempts();
      setStatus("Browser ready. Opening the launcher…");
      location.replace(safeTarget());
      return;
    }
    if (attempts() >= 2) {
      fail("Cross-origin isolation is still unavailable after registration. Disable private browsing, allow site data, then try again.");
      return;
    }

    setStatus("Installing the local isolation helper. This page will reload once…");
    await installCurrentWorker();
    setAttempts(attempts() + 1);
    location.reload();
  }

  start().catch((cause) => fail(`Service worker setup failed: ${cause?.message || cause}`));
})();
