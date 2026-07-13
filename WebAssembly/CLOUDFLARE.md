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

## Pull request previews

Every successful pull request from a branch in this repository publishes the
same audited direct-header artifact to a stable Cloudflare preview alias:

```text
https://pr-<number>.<project>.pages.dev/
```

GitHub attaches that URL to the pull request commit as a transient deployment,
so the pull request shows a **View deployment** link. Later commits update the
same alias. This stable origin is intentional: installed retail files live in
origin-private browser storage, so changing to a per-commit hostname would make
the player select or install those files again after every update.

The preview handoff has two trust levels. `ci.yml` builds, audits, boots, and
uploads the static `cloudflare-dist` artifact without Cloudflare credentials.
After CI succeeds, `pr-preview.yml` runs from the workflow definition on the
default branch, downloads that immutable artifact, and performs the upload with
the protected `cloudflare-pages` environment. It does not check out or execute
pull request code. Pull requests from forks are deliberately excluded because
they are not trusted to request a credentialed deployment.

No additional Cloudflare project or GitHub secret is required after the
production setup below. The protected environment remains restricted to
`main`: the credentialed handoff itself runs on `main`, while the artifact it
publishes is tied to the pull request head SHA. Preview sites remain asset-free
and never contain retail game data. Cloudflare marks preview deployments
`noindex` automatically.

## Development branch deployment

Every push to the persistent `dev` branch runs the same release build, artifact
guards, and browser deployment proof as a pull request. After those checks
succeed, the default-branch `pr-preview.yml` workflow downloads the audited
artifact and publishes it as Cloudflare Pages branch `dev`. It rejects a
handoff when `dev` has advanced to a newer commit, so an older build cannot
replace the current development site.

The credentialed job still runs from the repository's default `main` branch and
uses the existing `cloudflare-pages` environment. Do not grant the unprotected
`dev` branch direct access to that environment or duplicate its secrets in a
development-branch workflow. GitHub records the result as the non-production
`cloudflare-pages-dev` deployment at:

```text
https://dev.newshoes.gg/
```

Both halves of the handoff must be present before the first deployment: merge
the build trigger into `dev`, then promote the trusted deployment workflow to
`main` through the normal release flow. After that promotion, either the next
push to `dev` or a one-time manual run of **Pull request CI** from `dev` creates
the first branch deployment. Later pushes deploy automatically.

Cloudflare first exposes the branch at the stable
`https://dev.<project>.pages.dev/` alias. Complete the custom-domain setup once,
after the first successful `dev` deployment:

1. In the existing Pages project, add `dev.newshoes.gg` under **Custom
   domains** and activate it.
2. In Cloudflare DNS, change the resulting `dev` CNAME target from
   `<project>.pages.dev` to `dev.<project>.pages.dev`.
3. Keep the CNAME proxied. An unproxied record sends the custom hostname to the
   production branch instead of the `dev` alias.
4. Open `https://dev.newshoes.gg/` in a fresh profile and confirm the first
   response includes COOP/COEP, `crossOriginIsolated` is true, and the launcher
   shows the `dev` commit reported by the GitHub deployment.

The development hostname is a separate browser origin from `newshoes.gg`.
Retail files installed into origin-private storage on one hostname are not
available on the other. Cloudflare adds `X-Robots-Tag: noindex` to preview
deployments, including the `dev` branch.

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
