/* Copyright (C) 2026 Project New Shoes contributors; SPDX-License-Identifier: GPL-3.0-or-later */

"use strict";

// This file deliberately keeps the legacy URL. Existing GitHub Pages clients
// request it during registration.update(); activation then removes the old
// isolation worker because Cloudflare supplies COOP/COEP directly.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    await self.registration.unregister();
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    await Promise.all(windows.map((client) => client.navigate(client.url).catch(() => undefined)));
  })());
});
