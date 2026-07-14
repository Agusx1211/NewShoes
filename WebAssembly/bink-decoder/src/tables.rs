//! Static lookup tables for Bink Video v1.
//!
//! Direct port of `libavcodec/binkdata.h` (FFmpeg release/6.1). The tables
//! were transformed mechanically from the C source — values are bit-for-bit
//! identical. Originals are GPL-/LGPL-licensed by Konstantin Shishkov.
//!
//! Conventions:
//! * `BINK_*` tables apply to Bink v1 (codec tags `BIKi`/`BIKb`/`BIKf` and
//!   newer revisions in the same family).
//! * `BINKB_*` tables apply only to the older "BinkB" sub-revision (codec
//!   tag `BIKb`). They're provided so the same decoder handles both — every
//!   IWD2 file uses `BIKi`, but exposing the BinkB tables keeps the door
//!   open for other game corpora.

#![allow(clippy::needless_range_loop)]

include!("tables_generated.rs");
