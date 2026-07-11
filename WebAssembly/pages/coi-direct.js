/* Copyright (C) 2026 Project New Shoes contributors; SPDX-License-Identifier: GPL-3.0-or-later */

(() => {
  "use strict";
  const script = document.currentScript;
  const entry = new URL("./", script?.src || new URL("../", location.href));
  const legacyPlay = new URL("harness/play.html", entry);
  const packagedLauncher = new URL("launcher.html", entry);
  const isLegacyLocation = location.pathname === legacyPlay.pathname
    || location.pathname === packagedLauncher.pathname;

  if (window.crossOriginIsolated && typeof SharedArrayBuffer === "function") {
    if (isLegacyLocation) {
      const canonical = new URL(entry);
      canonical.search = location.search;
      canonical.hash = location.hash;
      location.replace(canonical);
    }
    return;
  }
  document.documentElement.hidden = true;
  entry.searchParams.set("coi-return", location.href);
  location.replace(entry);
})();
