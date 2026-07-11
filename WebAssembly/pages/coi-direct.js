/* Copyright (C) 2026 Project New Shoes contributors; SPDX-License-Identifier: GPL-3.0-or-later */

(() => {
  "use strict";
  if (window.crossOriginIsolated && typeof SharedArrayBuffer === "function") return;
  document.documentElement.hidden = true;
  const entry = new URL("../", location.href);
  entry.searchParams.set("coi-return", location.href);
  location.replace(entry);
})();
