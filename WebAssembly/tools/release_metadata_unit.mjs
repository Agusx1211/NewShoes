import assert from "node:assert/strict";
import { resolve } from "node:path";
import {
  parseChangelog,
  parseProjectVersion,
  readReleaseMetadata,
} from "./release_metadata.mjs";

const repoRoot = resolve(import.meta.dirname, "../..");
const metadata = await readReleaseMetadata(repoRoot);
assert.equal(metadata.version, parseProjectVersion(`${metadata.version}\n`));
assert.equal(metadata.changelog[0].version, "Unreleased");
assert.throws(() => parseProjectVersion("v1.2.3"), /semantic version/);
assert.throws(() => parseChangelog("## [Unreleased]\n- Missing its source PR"), /link at least one PR/);

const parsed = parseChangelog([
  "# Changelog",
  "",
  "## [Unreleased]",
  "- Keep `small` changes visible ([PR #7](https://github.com/Agusx1211/NewShoes/pull/7)).",
  "",
  "## [0.1.0] - 2026-07-13",
  "- Ship the first version ([PR #6](https://github.com/Agusx1211/NewShoes/pull/6)).",
].join("\n"));
assert.deepEqual(parsed[0].entries[0], {
  text: "Keep small changes visible",
  links: [{ number: 7, url: "https://github.com/Agusx1211/NewShoes/pull/7" }],
});
assert.equal(parsed[1].date, "2026-07-13");

console.log(`Release metadata: ${metadata.version}, ${metadata.changelog.length} changelog section(s)`);
