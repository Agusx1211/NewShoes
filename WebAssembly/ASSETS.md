# Asset handling

Project New Shoes does not include retail game data. Command & Conquer maps,
textures, models, audio, movies, BIG archives, Cabinet payloads, disc images,
and installed game files are copyrighted third-party content. They must not be
committed, bundled into releases, uploaded to CI, or redistributed from this
repository.

Seven small `RequiredAssets` path names are duplicated between the Generals and
Zero Hour source trees. They comprise three TGA files, one W3D file, one INI,
and two TBL files and are part of EA's upstream source release. Launcher
branding and wallpapers are separate project UI art documented in
[harness/assets/README.md](harness/assets/README.md).

## Player import

Zero Hour depends on data from both the base game and the expansion. The
launcher supports two local ownership paths:

1. Select an installed game root containing the Generals and Zero Hour data.
2. Select the complete Generals and Zero Hour original media set. ISO, IMG, and
   MODE1/2352 BIN images are supported, including multi-disc releases.

The browser worker:

- scans folders or ISO 9660 media locally;
- reads Microsoft Cabinet files and NONE/MSZIP members;
- validates the expected BIG archives and required internal paths;
- builds the small loose-script archive needed by the runtime; and
- writes the verified installation to browser-local OPFS.

No selected bytes are uploaded. The authoritative archive inventory and content
sentinels live in [harness/launcher-archive-specs.js](harness/launcher-archive-specs.js).

The engine worker mounts zero-byte path markers for the original filesystem and
opens the real archive data through synchronous OPFS access handles. The
original `Win32BIGFileSystem`, INI, object, map, UI, texture, and audio code then
reads the user-owned archives unchanged.

## Storage modes

The launcher can use an installation for the current session, remember source
handles where the browser permits it, or retain a persistent browser
installation. Persistent mode requests durable storage but cannot override the
browser's actual disk quota. The OPFS write result is authoritative.

Each live engine uses its own Web-Lock-owned namespace so multiple tabs do not
share exclusive synchronous file handles. Closing the runtime releases its
handles and lock.

## Development fixtures

These paths are intentionally ignored:

| Path | Local content |
|---|---|
| `assets/` | original media and the local reference library, except its index and search tool |
| `WebAssembly/artifacts/real-assets/` | extracted BIG archives and movie payloads |
| `WebAssembly/artifacts/` | screenshots, profiles, logs, dumps, and browser profiles |
| `WebAssembly/build/` | CMake and Emscripten build trees |
| `WebAssembly/dist*` | generated JavaScript, wasm, and worker output |
| `WebAssembly/harness/.certs/` | per-machine self-signed HTTPS certificate |

Prepare ignored development archives with:

```sh
cd WebAssembly
npm run extract:runtime-archives
npm run verify:assets
```

Many focused tests consume those ignored fixtures. A missing fixture must
produce a clear skip or error; it is never a reason to check game data into Git.

## Release rule

Release packages may contain the port source, generated runtime code when the
license terms are met, and launcher UI assets with documented redistribution
rights. They must not
contain original retail data or a preinstalled OPFS profile. Users bring their
own data and the launcher validates it locally.
