import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { jsonBlobFromValue } from "./issue-recorder.mjs";
import { startStaticServer } from "./static-server.mjs";

const tempRoot = await mkdtemp(join(tmpdir(), "cnc-issue-dump-upload-"));
const staticRoot = resolve(tempRoot, "static");
const uploadRoot = resolve(tempRoot, "uploads");
await mkdir(staticRoot, { recursive: true });

const server = await startStaticServer({
  root: staticRoot,
  port: 0,
  host: "127.0.0.1",
  issueDumpRoot: uploadRoot,
});

try {
  const buildInfoResponse = await fetch(new URL("__cnc_build_info", server.url));
  assert.equal(buildInfoResponse.status, 200);
  const buildInfo = await buildInfoResponse.json();
  assert.equal(buildInfo.schema, "cnc.harness-build-info.v1");
  assert.equal(typeof buildInfo.server.startedAt, "string");

  const body = jsonBlobFromValue({
    schema: "cnc.issue-dump.v1",
    id: "test-dump",
    generatedAt: "2026-07-05T00:00:00.000Z",
  }, { space: 2 });
  const response = await fetch(new URL("__cnc_issue_dump", server.url), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cnc-dump-name": "../bad test name.cncdump.json",
    },
    body,
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.equal(result.filename, "bad-test-name.cncdump.json");
  const written = await readFile(resolve(uploadRoot, result.filename), "utf8");
  assert.equal(written, await body.text());
  console.log("issue dump upload smoke passed");
} finally {
  await server.close();
  await rm(tempRoot, { recursive: true, force: true });
}
