// Browsers can resolve independent file metadata reads concurrently, but an
// explicit bound avoids flooding the File System Access implementation.
export const FILE_METADATA_READ_CONCURRENCY = 16;

async function collectFileHandles(handle, prefix, descriptors) {
  for await (const [name, entry] of handle.entries()) {
    const relativePath = `${prefix}/${name}`;
    if (entry.kind === "directory") {
      await collectFileHandles(entry, relativePath, descriptors);
    } else {
      descriptors.push({ handle: entry, relativePath });
    }
  }
}

async function materializeFiles(descriptors) {
  const files = new Array(descriptors.length);
  let nextIndex = 0;
  let stopped = false;
  const readNext = async () => {
    while (!stopped && nextIndex < descriptors.length) {
      const index = nextIndex;
      nextIndex += 1;
      const { handle, relativePath } = descriptors[index];
      try {
        const file = await handle.getFile();
        Object.defineProperty(file, "relativePath", {
          value: relativePath,
          configurable: true,
        });
        files[index] = file;
      } catch (error) {
        stopped = true;
        throw error;
      }
    }
  };
  const workerCount = Math.min(FILE_METADATA_READ_CONCURRENCY, descriptors.length);
  await Promise.all(Array.from({ length: workerCount }, () => readNext()));
  return files;
}

export async function filesFromHandles(handles, requestPermission = false) {
  const descriptors = [];
  for (const handle of handles) {
    let permission = await handle.queryPermission?.({ mode: "read" });
    if (permission !== "granted" && requestPermission) {
      permission = await handle.requestPermission?.({ mode: "read" });
    }
    if (permission !== "granted") {
      throw new Error(`Permission is required to read ${handle.name}`);
    }
    if (handle.kind === "directory") {
      await collectFileHandles(handle, handle.name, descriptors);
    } else {
      descriptors.push({ handle, relativePath: handle.name });
    }
  }
  return materializeFiles(descriptors);
}
