/* Copyright (C) 2026 Project New Shoes contributors; SPDX-License-Identifier: GPL-3.0-or-later */

(() => {
  "use strict";
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;
  void navigator.serviceWorker.getRegistration(new URL("./", location.href).href)
    .then((registration) => registration?.update())
    .catch(() => undefined);
})();
