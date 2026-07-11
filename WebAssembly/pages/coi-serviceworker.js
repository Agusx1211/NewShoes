/*
 * Project New Shoes cross-origin isolation service worker.
 *
 * GitHub Pages does not provide project-controlled HTTP headers. This worker
 * adds COOP/COEP to same-origin responses so the threaded WebAssembly runtime
 * can use SharedArrayBuffer. It intentionally has no response cache: Pages and
 * the browser HTTP cache remain the source of update/version behavior.
 *
 * Copyright (C) 2026 Project New Shoes contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

"use strict";

const COOP = "same-origin";
const COEP = "require-corp";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // A service worker must not handle this Chromium-only cache probe unless it
  // is a same-origin request. Ignoring it avoids a rejected fetch promise.
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") {
    return;
  }
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith((async () => {
    const response = await fetch(request);
    const headers = new Headers(response.headers);
    headers.set("Cross-Origin-Opener-Policy", COOP);
    headers.set("Cross-Origin-Embedder-Policy", COEP);
    headers.set("Cross-Origin-Resource-Policy", "same-origin");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  })());
});
