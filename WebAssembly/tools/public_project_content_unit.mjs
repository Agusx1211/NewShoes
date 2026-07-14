#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  loadPublicProjectContent,
  nextReviewDue,
  renderDiscoveryHead,
  renderGeneratedProjectFiles,
  validatePublicProjectContent,
} from "./public_project_content.mjs";

await loadPublicProjectContent();
const current = await loadPublicProjectContent({ now: new Date("2026-08-01T12:00:00Z") });
const generated = renderGeneratedProjectFiles(current);

assert.equal(nextReviewDue(current), "2026-10-12");
assert.deepEqual(Object.keys(generated).sort(), [
  "llms.txt",
  "project-info.json",
  "project.md",
  "robots.txt",
  "sitemap.xml",
]);
assert.match(generated["llms.txt"], /^# Project New Shoes\n/);
assert.match(generated["project.md"], /## Guidance for web agents/);
assert.match(generated["project.md"], /\*\*Status: Experimental\.\*\*/);
assert.equal(JSON.parse(generated["project-info.json"]).publication.nextReviewDue, "2026-10-12");
assert.match(renderDiscoveryHead(current, { prefix: "../" }), /href="\.\.\/project-info\.json"/);

function invalid(mutator, message) {
  const candidate = structuredClone(current);
  mutator(candidate);
  assert.throws(
    () => validatePublicProjectContent(candidate, { now: new Date("2026-08-01T12:00:00Z") }),
    message,
  );
}

invalid((candidate) => { candidate.schema = "unknown"; }, /schema/);
invalid((candidate) => { candidate.reviewedAt = "2026-08-02"; }, /future/);
invalid((candidate) => { candidate.capabilities[0].status = "complete"; }, /supported status/);
invalid((candidate) => { candidate.capabilities[0].evidence = []; }, /at least 1/);
invalid((candidate) => { candidate.capabilities[0].reviewedAt = "not-a-date"; }, /YYYY-MM-DD/);
assert.throws(
  () => validatePublicProjectContent(current, { now: new Date("2026-10-13T00:00:00Z") }),
  /older than the 90-day review window/,
);

console.log(`Validated ${current.capabilities.length} reviewed, evidence-backed public capabilities and all generated views.`);
