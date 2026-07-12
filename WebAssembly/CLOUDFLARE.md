# Cloudflare Pages deployment

This deployment serves the same asset-free threaded runtime as GitHub Pages,
but Cloudflare adds COOP and COEP on the first HTTP response through the
artifact's `_headers` file. The launcher is `index.html` at `/`; no isolation
service worker, bootstrap reload, response cache, Pages Function, or Worker is
required for a fresh profile.

The integration intentionally uses Wrangler Direct Upload from GitHub Actions.
GitHub remains the build system and source of the audited artifact. Do not also
connect this repository through Cloudflare's Git integration: a Pages project
created for Direct Upload cannot later switch deployment modes.

## One-time Cloudflare setup

1. Create a **Pages / Direct Upload** project. Record its project name.
2. Create a custom API token with **Account → Cloudflare Pages → Edit** for the
   intended account. Record the account ID from the Cloudflare dashboard.
3. In GitHub, create the `cloudflare-pages` environment and restrict deployment
   to `main`.
4. Add environment secrets `CLOUDFLARE_ACCOUNT_ID` and
   `CLOUDFLARE_API_TOKEN`.
5. Add the environment variable `CLOUDFLARE_PAGES_PROJECT` with the exact
   Direct Upload project name.
6. Keep the existing repository secret `GA_MEASUREMENT_ID` if analytics should
   be enabled. Missing or invalid analytics configuration remains a safe no-op.
7. Run **Deploy Cloudflare Pages** manually from `main`. The workflow builds,
   audits, and boots the direct-header artifact before Wrangler can upload it.

Do not move `newshoes.gg` immediately. First verify the generated `pages.dev`
URL in a fresh profile: the launcher must render at `/`,
`crossOriginIsolated` must be true on the first navigation, and no service
worker may be registered. Then add the custom domain in Cloudflare Pages and
update DNS. Keep GitHub Pages available until the custom-domain deployment has
been verified and rollback is no longer needed.

## Artifact contract

The Cloudflare packager starts from the already verified GitHub Pages staging
artifact, copies only an exact allowlist, replaces the bootstrap document with
the launcher, removes the isolation bootstrap, and adds `_headers` plus legacy
redirects. It retains a small retirement script at the old
`coi-serviceworker.js` URL. Existing GitHub Pages profiles update to that
script, unregister the old worker, and reload; fresh profiles never register
it. `_headers` supplies:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

The verifier rejects extra files, symlinks, retail media, credentials, host
paths, unresolved modules, a missing license, missing legal/source notices,
missing headers, and any file above Cloudflare Pages' 25 MiB limit. The browser
smoke proves direct first-response isolation, SharedArrayBuffer, the real
Emscripten pthread heap, OffscreenCanvas transfer, canonical root routing,
legacy-link recovery, and the absence of a service worker.

## Local verification

After producing the normal release runtime and `pages-dist` staging artifact:

```sh
cd WebAssembly
npm run build:cloudflare-site
npm run test:cloudflare-artifact-guard
npm run verify:cloudflare-site
npm run test:cloudflare-deployment
```

Generated `cloudflare-dist/` and Wrangler state are local-only. Credentials must
remain in the protected GitHub environment and must never be written to the
repository, `.env` files, build artifacts, or logs.

Cloudflare references: [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/),
[CI with Wrangler](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/),
[custom headers](https://developers.cloudflare.com/pages/configuration/headers/),
and [Pages limits](https://developers.cloudflare.com/pages/platform/limits/).
