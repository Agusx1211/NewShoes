#!/usr/bin/env node
import assert from "node:assert/strict";
import { createReadAccessHandle } from "./opfs_realm_files.mjs";

function accessHandleFixture(firstResult) {
  const calls = [];
  const exclusiveHandle = { kind: "exclusive" };
  const fileHandle = {
    async createSyncAccessHandle(options) {
      calls.push(options);
      if (options !== undefined) {
        if (firstResult instanceof Error) throw firstResult;
        return firstResult;
      }
      return exclusiveHandle;
    },
  };
  return { calls, exclusiveHandle, fileHandle };
}

{
  const readOnlyHandle = { kind: "read-only" };
  const fixture = accessHandleFixture(readOnlyHandle);
  assert.equal(await createReadAccessHandle(fixture.fileHandle), readOnlyHandle);
  assert.deepEqual(fixture.calls, [{ mode: "read-only" }]);
}

for (const name of ["TypeError", "NotSupportedError", "InvalidStateError"]) {
  const failure = new Error(`${name} from unsupported access mode`);
  failure.name = name;
  const fixture = accessHandleFixture(failure);
  assert.equal(await createReadAccessHandle(fixture.fileHandle), fixture.exclusiveHandle);
  assert.deepEqual(fixture.calls, [{ mode: "read-only" }, undefined]);
}

{
  const lockFailure = new Error("another handle owns the file");
  lockFailure.name = "NoModificationAllowedError";
  const fixture = accessHandleFixture(lockFailure);
  await assert.rejects(
    createReadAccessHandle(fixture.fileHandle),
    (error) => error === lockFailure,
  );
  assert.deepEqual(fixture.calls, [{ mode: "read-only" }]);
}

console.log("OPFS realm file compatibility checks passed.");
