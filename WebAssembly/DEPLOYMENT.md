# Public deployment

The public site is an asset-free Project New Shoes launcher and the threaded
Zero Hour WebAssembly runtime. It never includes retail game archives, disc
images, installed game files, browser profiles, issue dumps, or local TLS
certificates. Players provide files from a copy they own after the launcher
opens.

## Enable GitHub Pages

1. Open the repository on GitHub, then select **Settings**, **Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Open **Settings**, **Actions**, **General**. GitHub Actions must be enabled.
   The repository can keep the default read-only token setting; the deploy job
   grants only `pages: write` and `id-token: write`, while every build job has
   `contents: read` only.
4. Push to `main`, or select `main` and run **Deploy GitHub Pages** manually
   from the Actions tab. The workflow jobs reject every non-`main` ref,
   including a manual dispatch from another branch.

The workflow builds the release pthread runtime with the version in
`emscripten-version.txt`, currently Emscripten 3.1.6. It audits the static
artifact, proves it in Chromium under a project-style subpath, uploads it, then
deploys through the protected `github-pages` environment. GitHub documents this
artifact and permission model in
[Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

The first deployment creates the `github-pages` environment automatically. In
**Settings**, **Environments**, **github-pages**, add a deployment branch rule
for `main` only. The workflow also enforces this ref itself, while the
environment rule provides an independent repository-side barrier. Pull requests
run the same build and browser proof in `ci.yml`, but cannot deploy.

## License and corresponding source

The deployed artifact includes the unmodified `LICENSE.md`, including the GPLv3
text and Electronic Arts' additional section 7 terms. The bootstrap identifies
the copyright holders and no-warranty status. The launcher **About Project New
Shoes** window links to a dedicated legal-notice page, the complete license,
and the corresponding source revision used by the workflow.

The Pages workflow sets that source link to the repository and exact
`github.sha` it compiled. This keeps the object code and its preferred source
form unambiguous even after later deployments. The notice also marks Project
New Shoes as modified browser software from 2026 and states that it is not
affiliated with or endorsed by Electronic Arts.

## Why the first visit reloads

The game is threaded-only. Its Emscripten pthread heap requires
`SharedArrayBuffer`, which requires a cross-origin isolated document. A normal
GitHub Pages project cannot add the required COOP and COEP response headers.

The deployed root therefore registers the repository-owned
`coi-serviceworker.js`. The worker fetches same-origin responses without
caching them, copies each response, and adds:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

The page reloads once under service-worker control, checks
`crossOriginIsolated` and `SharedArrayBuffer`, then opens the launcher. The
browser requirements and header values are described by
[MDN's cross-origin isolation reference](https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/crossOriginIsolated).
There is no single-thread fallback and no third-party runtime CDN.

All service-worker URLs and scopes are relative, so both user Pages sites and
project Pages URLs such as `https://owner.github.io/repository/` work. Direct
links under `harness/` return through the root bootstrap when isolation is not
ready. A custom domain works the same way, but it must be configured in
repository Settings; GitHub notes that committing a `CNAME` alone does not set
the domain in [its publishing-source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

The service worker uses no application response cache. New Pages deployments
remain governed by normal HTTP caching. Registration uses `updateViaCache:
"none"`; a changed worker installs immediately and controls the next reload.
To remove it from a browser profile, open the deployed root with
`?coi-sw=unregister`. The page then offers an explicit button to enable it
again.

## Reproduce the release locally

Install Node 22, CMake, Ninja, Python 3, and the pinned emsdk. Then run:

```sh
cd WebAssembly
npm ci
source /path/to/emsdk/emsdk_env.sh
npm run check:pages
npm run build:pages-runtime
npm run test:pages-artifact-guard
npm run verify:pages-site
npx playwright install chromium
npm run test:pages-deployment
```

`test:pages-deployment` deliberately serves the artifact without COOP or COEP
headers under `/CnC_Generals_Zero_Hour/`. In a fresh browser context it proves
the initial bootstrap, controlled reload, `crossOriginIsolated`,
`SharedArrayBuffer`, `application/wasm` delivery, actual Emscripten pthread
startup, OffscreenCanvas transfer, and visible launcher.

The generated `pages-dist/` and `pages-build/` directories are ignored. The
packager and verifier share one exact file manifest. Every runtime and launcher
file is copied individually after proving it is a regular file; recursive copy
and symlink dereferencing are forbidden. The build fails if the runtime output
contains any fourth file, and the audit fails if the final artifact has any
unlisted file. The guard smoke demonstrates both checks with an
`unexpected.env` file and separately proves symlink rejection. The audit also
rejects retail archive and disc extensions, certificates and keys, local paths,
profiles, build caches, `node_modules`, unresolved static module imports, and
an unexpectedly large artifact.
The release compiler also maps the checkout prefix to `.` so C++ `__FILE__`
strings cannot expose a developer or Actions runner path inside the wasm.

## Troubleshooting

- **The preparation screen repeats:** allow site data and service workers,
  leave private browsing, then use **Try again**. The bootstrap stops after two
  reload attempts and shows the failure instead of looping.
- **`crossOriginIsolated` is false:** verify that the page is HTTPS and opened
  through the deployment root, not an old deep link. Remove old registrations
  with `?coi-sw=unregister`, then enable it again.
- **The launcher reports insufficient storage:** retail assets are stored in
  the browser's origin-private file system. Free local disk space and avoid
  private browsing. This storage is separate for the default Pages domain and
  a later custom domain.
- **Multiplayer signaling is offline:** GitHub Pages hosts static files only.
  A WebSocket signaling service must be deployed separately and entered in the
  launcher network settings.
- **A custom domain lost installed assets:** changing origin changes browser
  storage and service-worker scope. Players must select or install their game
  files again on the new origin.

The automated Pages proof currently runs on Chromium. Before promising broad
browser support, manually verify the release on current Firefox and Safari;
their storage quotas, file pickers, WebGL drivers, and service-worker lifecycle
can differ even when cross-origin isolation succeeds.
