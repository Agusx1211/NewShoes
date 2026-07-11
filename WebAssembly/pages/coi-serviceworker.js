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
const scopeUrl = new URL(self.registration.scope);
const launcherUrl = new URL("launcher.html", scopeUrl);
const legacyPlayUrl = new URL("harness/play.html", scopeUrl);

function canonicalLocation(url) {
  const canonical = new URL(scopeUrl);
  canonical.search = url.search;
  return canonical;
}

function needsBootstrap(url) {
  return url.searchParams.has("coi-return") || url.searchParams.has("coi-sw");
}

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
    const navigation = request.mode === "navigate";
    if (navigation
        && (url.pathname === legacyPlayUrl.pathname || url.pathname === launcherUrl.pathname)) {
      return Response.redirect(canonicalLocation(url), 302);
    }

    const servesCanonicalLauncher = navigation
      && url.pathname === scopeUrl.pathname
      && !needsBootstrap(url);
    const response = servesCanonicalLauncher
      ? await fetch(launcherUrl, { credentials: "same-origin", cache: request.cache })
      : await fetch(request);
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
