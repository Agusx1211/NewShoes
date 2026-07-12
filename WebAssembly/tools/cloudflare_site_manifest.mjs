import { PAGES_OUTPUT_FILES } from "./pages_site_manifest.mjs";

const githubPagesOnly = new Set([
  ".nojekyll",
  "coi-bootstrap.js",
  "coi-direct.js",
  "coi-serviceworker.js",
  "harness/play.html",
  "launcher.html",
]);

export const CLOUDFLARE_OUTPUT_FILES = Object.freeze([
  ...PAGES_OUTPUT_FILES.filter((name) => !githubPagesOnly.has(name)),
  "_headers",
  "_redirects",
  "coi-serviceworker.js",
  "retire-service-worker.js",
].sort());
