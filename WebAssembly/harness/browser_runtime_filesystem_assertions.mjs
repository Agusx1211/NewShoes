export function assertBrowserRuntimeFileSystem(state, context, expected = {}) {
  const runtime = state.browserRuntimeAssets;
  const probe = runtime?.fileProbe;
  const archive = probe?.archive;
  const local = probe?.local;
  if (!runtime
      || runtime.installed !== true
      || runtime.fileSystemInitialized !== true
      || runtime.archiveLoaded !== true
      || runtime.nameKeyGeneratorInitialized !== true
      || runtime.w3dFileSystemInstalled !== true
      || runtime.fileMask !== "*.big"
      || (expected.directory && runtime.directory !== expected.directory)) {
    throw new Error(`${context} browser runtime FileSystem owner not installed: ${JSON.stringify(runtime)}`);
  }

  if (!probe?.ok
      || probe.source !== "browser runtime persistent FileSystem globals + Win32BIGFileSystem"
      || probe.globals?.ok !== true
      || probe.globals?.localFileSystem !== true
      || probe.globals?.archiveFileSystem !== true
      || probe.globals?.fileSystem !== true
      || probe.globals?.nameKeyGenerator !== true
      || probe.globals?.w3dFileSystem !== true) {
    throw new Error(`${context} browser runtime FileSystem globals incomplete: ${JSON.stringify(probe)}`);
  }

  if (!local?.ok
      || local.path !== "cnc-port-runtime-fs-owner/local-file.txt"
      || local.bytes <= 0
      || !local.directory
      || !local.write
      || !local.exists
      || !local.cache
      || !local.info
      || local.infoSize !== local.bytes
      || !local.list
      || !local.read
      || !local.missingCache) {
    throw new Error(`${context} browser runtime local FileSystem path incomplete: ${JSON.stringify(local)}`);
  }

  if (expected.requireArmorArchive === false) {
    return;
  }

  if (!archive?.attempted
      || !archive.loaded
      || !archive.ok
      || archive.path !== "Data\\INI\\Armor.ini"
      || !String(archive.owner ?? "").includes("INIZH.big")
      || archive.indexedFiles <= 0
      || (expected.indexedFiles !== undefined && archive.indexedFiles !== expected.indexedFiles)
      || !archive.exists
      || !archive.info
      || archive.infoSize <= 50000
      || !archive.list
      || !archive.read
      || archive.bytes !== 16
      || !archive.ownerLookup) {
    throw new Error(`${context} browser runtime archive FileSystem path incomplete: ${JSON.stringify(archive)}`);
  }
}
