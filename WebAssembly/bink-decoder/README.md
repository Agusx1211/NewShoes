# Project New Shoes Bink decoder

This directory contains the small Bink Video v1 decoder used by hosted builds.
It is compiled as a standalone WebAssembly module and fetched only when an
installed movie is opened; it is not linked into `cnc-port.wasm`.

The codec implementation was derived from
[`infinitier_bik_decoder`](https://github.com/ufoscout/infinitier/tree/a9a01212fe7104417246ff6ca922319f5f3f859b/src/codecs/bik_decoder),
revision `a9a01212fe7104417246ff6ca922319f5f3f859b`, which in turn follows the
FFmpeg 6.1 Bink decoder. The vendored copy removes unrelated workspace,
WAV-writing, logging, and third-party helper dependencies and adds the narrow
browser ABI in `src/lib.rs`. See `UPSTREAM_README.md` and `LICENSE`.

The supported format is classic Bink v1 (`BIKb`, `BIKf`, `BIKg`, `BIKh`,
`BIKi`, and `BIKk`). Bink 2 / `KB2` is intentionally rejected.
