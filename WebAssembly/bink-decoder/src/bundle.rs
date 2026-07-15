//! Bink "bundle" decoders.
//!
//! A Bink frame interleaves nine variable-length-coded streams, called
//! *bundles*, into a single bitstream. Each block decoder pulls one or more
//! values out of one or more bundles as it walks the picture. The bundles
//! are filled lazily: when a block decoder reaches the end of a row of 8x8
//! blocks it asks the bundle to "decode the next chunk" — this is where the
//! `read_*` functions in this module run.
//!
//! The nine bundles ([`SourceKind`]):
//!
//! | Kind | What it carries |
//! |---|---|
//! | `BlockTypes`     | 4-bit block-type id per 8x8 block |
//! | `SubBlockTypes`  | 4-bit block-type id per 16x16 (scaled) block |
//! | `Colors`         | 8-bit pixel values for run / pattern / fill blocks |
//! | `Pattern`        | 8-bit pattern bytes for pattern blocks |
//! | `XOff` / `YOff`  | signed-8 motion-vector components |
//! | `IntraDc`        | signed-16 DC delta for intra DCT blocks |
//! | `InterDc`        | signed-16 DC delta for inter DCT blocks |
//! | `Run`            | run lengths for run-coded blocks |
//!
//! Mirrors `read_tree` / `read_runs` / `read_motion_values` /
//! `read_block_types` / `read_patterns` / `read_colors` / `read_dcs` /
//! `read_bundle` from FFmpeg's `bink.c`.

use crate::bitreader::BitReader;
use crate::error::{BikError, BikResult};
use crate::vlc::bink_trees;

/// The nine source kinds (regular Bink — not BinkB).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum SourceKind {
    BlockTypes = 0,
    SubBlockTypes = 1,
    Colors = 2,
    Pattern = 3,
    XOff = 4,
    YOff = 5,
    IntraDc = 6,
    InterDc = 7,
    Run = 8,
}

pub const BINK_NB_SRC: usize = 9;

/// Per-bundle Huffman tree assignment + leaf-to-symbol mapping.
///
/// `vlc_num` selects one of the 16 prebuilt Bink trees in [`bink_trees`].
/// `syms[16]` permutes the resulting 4-bit symbol so each frame can use a
/// different mapping without re-deriving the Huffman tree from scratch.
#[derive(Debug, Clone, Copy)]
pub struct Tree {
    pub vlc_num: u8,
    pub syms: [u8; 16],
}

impl Default for Tree {
    fn default() -> Self {
        Self {
            vlc_num: 0,
            syms: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        }
    }
}

impl Tree {
    /// Decode a 4-bit Huffman symbol through this tree.
    #[inline]
    pub fn get_huff(&self, r: &mut BitReader<'_>) -> BikResult<u8> {
        let raw = bink_trees()[self.vlc_num as usize].get(r)?;
        Ok(self.syms[raw as usize])
    }
}

/// One bundle: a small ring-buffer-ish queue of decoded values.
///
/// The block decoder reads from `[data..cur_dec]` via `cur_ptr`; the
/// `read_*` functions in this module write between `cur_dec..data_end`.
/// `len` is the number of bits used to encode the count of values emitted
/// per "fill chunk" — it depends on the picture dimensions.
#[derive(Debug)]
pub struct Bundle {
    pub len: u8,
    pub tree: Tree,
    pub data: Vec<u8>,
    /// Write cursor — index into `data` where the next decoded byte goes.
    /// `Option` form: `None` means "this bundle has been drained for the
    /// current row pass" (matches FFmpeg's `cur_dec = NULL`).
    pub cur_dec: Option<usize>,
    /// Read cursor — index into `data` where the next consumer reads from.
    pub cur_ptr: usize,
}

impl Bundle {
    pub fn new(capacity: usize) -> Self {
        Self {
            len: 0,
            tree: Tree::default(),
            data: vec![0u8; capacity],
            cur_dec: Some(0),
            cur_ptr: 0,
        }
    }

    /// Reset the bundle's cursors at the start of a frame / plane.
    pub fn reset_cursors(&mut self) {
        self.cur_dec = Some(0);
        self.cur_ptr = 0;
    }

    /// Read a single u8 value from the bundle at `cur_ptr` and advance.
    #[inline]
    pub fn read_u8(&mut self) -> u8 {
        let v = self.data[self.cur_ptr];
        self.cur_ptr += 1;
        v
    }

    /// Read a single i8 value (sign-interpreted).
    #[inline]
    pub fn read_i8(&mut self) -> i8 {
        let v = self.data[self.cur_ptr] as i8;
        self.cur_ptr += 1;
        v
    }

    /// Read an i16 (LE) value (used by `IntraDc` / `InterDc`).
    #[inline]
    pub fn read_i16(&mut self) -> i16 {
        let lo = self.data[self.cur_ptr] as u16;
        let hi = self.data[self.cur_ptr + 1] as u16;
        self.cur_ptr += 2;
        ((hi << 8) | lo) as i16
    }
}

/// Color-bundle "high nibble" sub-context: 16 trees (one per previous high
/// nibble) and the most-recent high nibble. See `read_colors` in bink.c.
#[derive(Debug, Default)]
pub struct ColorContext {
    pub col_high: [Tree; 16],
    pub col_lastval: u8,
}

/// All nine bundles + color sub-context, for one frame.
#[derive(Debug)]
pub struct Bundles {
    pub b: [Bundle; BINK_NB_SRC],
    pub colors: ColorContext,
}

impl Bundles {
    /// Allocate bundles sized for a picture of `width × height` pixels.
    /// Sized to mirror FFmpeg's `init_bundles`: each bundle gets
    /// `bw * bh * 64` bytes, where `bw = ceil(w / 8)` and similarly for
    /// `bh`. That's enough to hold the worst-case output even for `IntraDc`
    /// / `InterDc` (which write i16 — interpreted from the same buffer).
    pub fn new(width: u32, height: u32) -> Self {
        let bw = width.div_ceil(8);
        let bh = height.div_ceil(8);
        let cap = (bw * bh * 64) as usize;
        Self {
            b: std::array::from_fn(|_| Bundle::new(cap)),
            colors: ColorContext::default(),
        }
    }

    /// Apply per-source `len` (bits-per-count) values for the current plane.
    /// Mirrors `init_lengths` in bink.c.
    pub fn init_lengths(&mut self, plane_width: u32) {
        let width = (plane_width + 7) & !7;
        let bw = ((plane_width + 7) >> 3).max(1);
        // av_log2(x) = floor(log2(x)) for x >= 1; FFmpeg's macro is undefined
        // for 0, so the +511 bias guarantees we're in range.
        let log2 = |x: u32| -> u8 { (31 - x.leading_zeros()) as u8 };

        self.b[SourceKind::BlockTypes as usize].len = log2((width >> 3) + 511) + 1;
        self.b[SourceKind::SubBlockTypes as usize].len = log2((width >> 4) + 511) + 1;
        self.b[SourceKind::Colors as usize].len = log2(bw * 64 + 511) + 1;
        self.b[SourceKind::IntraDc as usize].len = log2((width >> 3) + 511) + 1;
        self.b[SourceKind::InterDc as usize].len = log2((width >> 3) + 511) + 1;
        self.b[SourceKind::XOff as usize].len = log2((width >> 3) + 511) + 1;
        self.b[SourceKind::YOff as usize].len = log2((width >> 3) + 511) + 1;
        self.b[SourceKind::Pattern as usize].len = log2((bw << 3) + 511) + 1;
        self.b[SourceKind::Run as usize].len = log2(bw * 48 + 511) + 1;
    }

    /// Reset every bundle's cursors (call at the start of each plane).
    pub fn reset_cursors(&mut self) {
        for b in &mut self.b {
            b.reset_cursors();
        }
        self.colors.col_lastval = 0;
    }

    /// Read tree headers for every bundle that has one, plus the 16
    /// color-high trees. Mirrors FFmpeg's `read_bundle` called for each
    /// bundle in turn at the start of every plane decode.
    pub fn read_all_trees(&mut self, r: &mut BitReader<'_>) -> BikResult<()> {
        for kind in [
            SourceKind::BlockTypes,
            SourceKind::SubBlockTypes,
            SourceKind::Colors,
            SourceKind::Pattern,
            SourceKind::XOff,
            SourceKind::YOff,
            SourceKind::IntraDc,
            SourceKind::InterDc,
            SourceKind::Run,
        ] {
            // Per FFmpeg: for COLORS, also read the 16 col_high trees first.
            if kind == SourceKind::Colors {
                for t in &mut self.colors.col_high {
                    *t = read_tree(r)?;
                }
                self.colors.col_lastval = 0;
            }
            // INTRA_DC / INTER_DC bundles don't carry a Huffman tree (DC
            // values use bsize-bit sign-magnitude coding, not Huffman).
            if kind != SourceKind::IntraDc && kind != SourceKind::InterDc {
                self.b[kind as usize].tree = read_tree(r)?;
            }
            self.b[kind as usize].cur_dec = Some(0);
            self.b[kind as usize].cur_ptr = 0;
        }
        Ok(())
    }
}

/// Decode the per-frame "tree" header that every bundle (except DC) carries.
/// Mirrors `read_tree(gb, tree)` in bink.c.
pub fn read_tree(r: &mut BitReader<'_>) -> BikResult<Tree> {
    if r.bits_left() < 4 {
        return Err(BikError::Truncated {
            pos: r.bit_pos(),
            needed: 4,
        });
    }
    let vlc_num = r.read_bits(4)? as u8;
    if vlc_num == 0 {
        return Ok(Tree {
            vlc_num: 0,
            syms: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        });
    }
    let mut syms = [0u8; 16];
    if r.read_bit()? != 0 {
        // "List of distinct values" mode.
        let mut tmp = [0u8; 16];
        let mut len = r.read_bits(3)? as usize;
        for slot in syms.iter_mut().take(len + 1) {
            let s = r.read_bits(4)? as u8;
            *slot = s;
            tmp[s as usize] = 1;
        }
        // Fill the rest with the values that didn't appear, in order.
        let mut i = 0u8;
        while (i as usize) < 16 && len < 15 {
            if tmp[i as usize] == 0 {
                len += 1;
                syms[len] = i;
            }
            i += 1;
        }
    } else {
        // "Recursive merge" mode: build a permutation from log2-len passes.
        let depth = r.read_bits(2)? as usize; // 0..=3
        let mut a = [0u8; 16];
        let b = [0u8; 16];
        for (i, slot) in a.iter_mut().enumerate() {
            *slot = i as u8;
        }
        let (mut input, mut output) = (a, b);
        for i in 0..=depth {
            let size = 1usize << i;
            let stride = size << 1;
            let mut t = 0usize;
            while t < 16 {
                merge(r, &input[t..], &mut output[t..], size)?;
                t += stride;
            }
            std::mem::swap(&mut input, &mut output);
        }
        syms.copy_from_slice(&input);
    }
    Ok(Tree { vlc_num, syms })
}

/// Merge two consecutive lists of equal size based on bits read.
/// Mirrors `merge` in bink.c — used by the recursive-merge tree decoder.
fn merge(r: &mut BitReader<'_>, src: &[u8], dst: &mut [u8], size: usize) -> BikResult<()> {
    let mut i = 0usize; // src index in [0..size)
    let mut j = size; // src index in [size..2*size)
    let mut k = 0usize; // dst index
    while i < size && j < 2 * size {
        if r.read_bit()? == 0 {
            dst[k] = src[i];
            i += 1;
        } else {
            dst[k] = src[j];
            j += 1;
        }
        k += 1;
    }
    while i < size {
        dst[k] = src[i];
        i += 1;
        k += 1;
    }
    while j < 2 * size {
        dst[k] = src[j];
        j += 1;
        k += 1;
    }
    Ok(())
}

/// Common preamble for `read_runs` / `read_motion_values` / etc.
///
/// Returns `None` when the bundle is exhausted for this row pass (`cur_dec`
/// is `None`, or already past `cur_ptr`); returns `Some(t)` with the count of
/// values to emit; sets `cur_dec = None` when `t == 0` (matches the
/// `CHECK_READ_VAL` macro in bink.c).
fn check_read_val(r: &mut BitReader<'_>, b: &mut Bundle) -> BikResult<Option<u32>> {
    let cur_dec = match b.cur_dec {
        Some(v) => v,
        None => return Ok(None),
    };
    if cur_dec > b.cur_ptr {
        return Ok(None);
    }
    let t = r.read_bits(b.len as u32)?;
    if t == 0 {
        b.cur_dec = None;
        return Ok(None);
    }
    Ok(Some(t))
}

/// Decode the next chunk of `Run` values. Mirrors `read_runs` in bink.c.
pub fn read_runs(r: &mut BitReader<'_>, b: &mut Bundle) -> BikResult<()> {
    let Some(t) = check_read_val(r, b)? else {
        return Ok(());
    };
    let cur_dec = b.cur_dec.unwrap();
    let dec_end = cur_dec + t as usize;
    if dec_end > b.data.len() {
        return Err(BikError::Malformed("run value went out of bounds"));
    }
    if r.read_bit()? != 0 {
        // RLE: one 4-bit value repeated.
        let v = r.read_bits(4)? as u8;
        b.data[cur_dec..dec_end].fill(v);
    } else {
        for slot in &mut b.data[cur_dec..dec_end] {
            *slot = b.tree.get_huff(r)?;
        }
    }
    b.cur_dec = Some(dec_end);
    Ok(())
}

/// Decode the next chunk of motion values (signed). Mirrors
/// `read_motion_values` in bink.c.
pub fn read_motion_values(r: &mut BitReader<'_>, b: &mut Bundle) -> BikResult<()> {
    let Some(t) = check_read_val(r, b)? else {
        return Ok(());
    };
    let cur_dec = b.cur_dec.unwrap();
    let dec_end = cur_dec + t as usize;
    if dec_end > b.data.len() {
        return Err(BikError::Malformed("too many motion values"));
    }
    if r.read_bit()? != 0 {
        // RLE: one (sign, magnitude) value repeated.
        let mag = r.read_bits(4)? as u8;
        let v = if mag != 0 {
            let sign = -(r.read_bit()? as i32);
            (((mag as i32) ^ sign) - sign) as u8
        } else {
            0
        };
        b.data[cur_dec..dec_end].fill(v);
    } else {
        for slot in &mut b.data[cur_dec..dec_end] {
            let mag = b.tree.get_huff(r)?;
            *slot = if mag != 0 {
                let sign = -(r.read_bit()? as i32);
                (((mag as i32) ^ sign) - sign) as u8
            } else {
                0
            };
        }
    }
    b.cur_dec = Some(dec_end);
    Ok(())
}

/// `read_block_types`: special RLE on top of Huffman decoding. Mirrors
/// the function of the same name in bink.c. Symbol values 12-15 expand to
/// repeats of the last "real" symbol with run lengths from `RLE_LENS`.
const RLE_LENS: [u8; 4] = [4, 8, 12, 32];

pub fn read_block_types(r: &mut BitReader<'_>, b: &mut Bundle, count_xor: u32) -> BikResult<()> {
    let Some(mut t) = check_read_val(r, b)? else {
        return Ok(());
    };
    // BIKk obfuscates the count with `t ^= 0xBB`. After XOR-ing, if the
    // count is zero, the bundle is marked exhausted (same as the regular
    // CHECK_READ_VAL t == 0 path). Caller passes 0 to opt out.
    if count_xor != 0 {
        t ^= count_xor;
        if t == 0 {
            b.cur_dec = None;
            return Ok(());
        }
    }
    let cur_dec = b.cur_dec.unwrap();
    let dec_end = cur_dec + t as usize;
    if dec_end > b.data.len() {
        return Err(BikError::Malformed("too many block-type values"));
    }
    if r.read_bit()? != 0 {
        let v = r.read_bits(4)? as u8;
        b.data[cur_dec..dec_end].fill(v);
        b.cur_dec = Some(dec_end);
    } else {
        let mut last = 0u8;
        let mut pos = cur_dec;
        while pos < dec_end {
            let v = b.tree.get_huff(r)?;
            if v < 12 {
                last = v;
                b.data[pos] = v;
                pos += 1;
            } else {
                let run = RLE_LENS[(v - 12) as usize] as usize;
                if dec_end - pos < run {
                    return Err(BikError::Malformed("block-type RLE overflow"));
                }
                b.data[pos..pos + run].fill(last);
                pos += run;
            }
        }
        b.cur_dec = Some(dec_end);
    }
    Ok(())
}

/// `read_patterns`: each emitted byte is two stacked Huffman nibbles.
pub fn read_patterns(r: &mut BitReader<'_>, b: &mut Bundle) -> BikResult<()> {
    let Some(t) = check_read_val(r, b)? else {
        return Ok(());
    };
    let cur_dec = b.cur_dec.unwrap();
    let dec_end = cur_dec + t as usize;
    if dec_end > b.data.len() {
        return Err(BikError::Malformed("too many pattern values"));
    }
    for slot in &mut b.data[cur_dec..dec_end] {
        let lo = b.tree.get_huff(r)?;
        let hi = b.tree.get_huff(r)?;
        *slot = lo | (hi << 4);
    }
    b.cur_dec = Some(dec_end);
    Ok(())
}

/// `read_colors`: two-step Huffman with the `col_high` sub-context. The
/// `version_pre_i` flag controls the legacy sign/wrap fixup that disappeared
/// in `BIKi`; it stays `false` for IWD2 corpus.
pub fn read_colors(
    r: &mut BitReader<'_>,
    b: &mut Bundle,
    cc: &mut ColorContext,
    version_pre_i: bool,
) -> BikResult<()> {
    let Some(t) = check_read_val(r, b)? else {
        return Ok(());
    };
    let cur_dec = b.cur_dec.unwrap();
    let dec_end = cur_dec + t as usize;
    if dec_end > b.data.len() {
        return Err(BikError::Malformed("too many color values"));
    }
    let fixup = |v: u8| -> u8 {
        if version_pre_i {
            let sign = ((v as i8) >> 7) as i32;
            let m = ((v as i32) & 0x7F) ^ sign;
            ((m - sign + 0x80) & 0xFF) as u8
        } else {
            v
        }
    };
    if r.read_bit()? != 0 {
        let high = cc.col_high[cc.col_lastval as usize].get_huff(r)?;
        cc.col_lastval = high;
        let lo = b.tree.get_huff(r)?;
        let v = fixup((high << 4) | lo);
        b.data[cur_dec..dec_end].fill(v);
    } else {
        for slot in &mut b.data[cur_dec..dec_end] {
            let high = cc.col_high[cc.col_lastval as usize].get_huff(r)?;
            cc.col_lastval = high;
            let lo = b.tree.get_huff(r)?;
            *slot = fixup((high << 4) | lo);
        }
    }
    b.cur_dec = Some(dec_end);
    Ok(())
}

/// `read_dcs`: differential coding of DC coefficients. Writes i16 values in
/// little-endian order into `b.data`. `start_bits` is `DC_START_BITS = 11`
/// for video; `has_sign` is 1 for `InterDc`, 0 for `IntraDc` (the seed value
/// can't be negative for intra blocks).
pub const DC_START_BITS: u32 = 11;

pub fn read_dcs(
    r: &mut BitReader<'_>,
    b: &mut Bundle,
    start_bits: u32,
    has_sign: bool,
) -> BikResult<()> {
    let Some(len) = check_read_val(r, b)? else {
        return Ok(());
    };
    let cur_dec = b.cur_dec.unwrap();
    debug_assert!(
        cur_dec.is_multiple_of(2),
        "DC bundle cursor must be i16-aligned"
    );

    let bits_first = start_bits - if has_sign { 1 } else { 0 };
    if r.bits_left() < bits_first as isize {
        return Err(BikError::Truncated {
            pos: r.bit_pos(),
            needed: bits_first as usize,
        });
    }
    let mut v = r.read_bits(bits_first)? as i32;
    if has_sign && v != 0 {
        let sign = -(r.read_bit()? as i32);
        v = (v ^ sign) - sign;
    }
    // Bounds: every DC value is i16.
    let write_i16 = |b: &mut Bundle, idx: usize, val: i32| -> BikResult<()> {
        if idx + 2 > b.data.len() {
            return Err(BikError::Malformed("DC bundle overflow"));
        }
        if !(-32768..=32767).contains(&val) {
            return Err(BikError::Malformed("DC value out of i16 range"));
        }
        let bytes = (val as i16).to_le_bytes();
        b.data[idx] = bytes[0];
        b.data[idx + 1] = bytes[1];
        Ok(())
    };

    let mut idx = cur_dec;
    write_i16(b, idx, v)?;
    idx += 2;
    let mut remaining = (len as i32) - 1;
    while remaining > 0 {
        let chunk = remaining.min(8) as u32;
        let bsize = r.read_bits(4)?;
        if bsize != 0 {
            for _ in 0..chunk {
                let mut v2 = r.read_bits(bsize)? as i32;
                if v2 != 0 {
                    let sign = -(r.read_bit()? as i32);
                    v2 = (v2 ^ sign) - sign;
                }
                v += v2;
                write_i16(b, idx, v)?;
                idx += 2;
            }
        } else {
            for _ in 0..chunk {
                write_i16(b, idx, v)?;
                idx += 2;
            }
        }
        remaining -= chunk as i32;
    }
    b.cur_dec = Some(idx);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: pack a list of `(value, bit_count)` pairs LSB-first into a
    /// byte buffer, the same layout the decoder reads.
    fn pack(bits: &[(u32, u8)]) -> Vec<u8> {
        let mut out: Vec<u8> = Vec::new();
        let mut acc = 0u64;
        let mut nb = 0u32;
        for &(v, n) in bits {
            assert!(n <= 32);
            acc |= ((v as u64) & ((1u64 << n) - 1)) << nb;
            nb += n as u32;
            while nb >= 8 {
                out.push((acc & 0xff) as u8);
                acc >>= 8;
                nb -= 8;
            }
        }
        if nb > 0 {
            out.push((acc & 0xff) as u8);
        }
        out
    }

    #[test]
    fn read_tree_identity() {
        // vlc_num=0 -> identity syms, no further bits consumed.
        let buf = pack(&[(0, 4)]);
        let mut r = BitReader::new(&buf);
        let t = read_tree(&mut r).unwrap();
        assert_eq!(t.vlc_num, 0);
        assert_eq!(
            t.syms,
            [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
        );
    }

    #[test]
    fn read_tree_distinct_list() {
        // vlc_num=1, mode-bit=1, len=2 (3 distinct entries: 5, 9, 2),
        // then auto-fill the rest in order.
        let buf = pack(&[
            (1, 4), // vlc_num
            (1, 1), // mode = distinct list
            (2, 3), // len = 2 -> entries [0..=2]
            (5, 4), // syms[0] = 5
            (9, 4), // syms[1] = 9
            (2, 4), // syms[2] = 2
        ]);
        let mut r = BitReader::new(&buf);
        let t = read_tree(&mut r).unwrap();
        assert_eq!(t.vlc_num, 1);
        assert_eq!(&t.syms[..3], &[5, 9, 2]);
        // Remaining slots are 0..15 minus the explicit ones, in increasing order.
        let expected_tail = [0u8, 1, 3, 4, 6, 7, 8, 10, 11, 12, 13, 14, 15];
        assert_eq!(&t.syms[3..], &expected_tail[..13]);
    }

    #[test]
    fn read_runs_rle_path() {
        // bundle len = 4 bits, count = 5, RLE flag = 1, value = 7.
        let mut b = Bundle::new(64);
        b.len = 4;
        // Set tree to identity.
        b.tree = Tree::default();
        let buf = pack(&[
            (5, 4), // count
            (1, 1), // RLE flag
            (7, 4), // value
        ]);
        let mut r = BitReader::new(&buf);
        read_runs(&mut r, &mut b).unwrap();
        assert_eq!(&b.data[..5], &[7, 7, 7, 7, 7]);
        assert_eq!(b.cur_dec, Some(5));
    }

    #[test]
    fn read_runs_huff_path() {
        // Identity tree (vlc_num=0) decodes 4 raw bits per symbol.
        // Count=4, RLE flag=0, then 4*4 bits = 4 raw values: 1,2,3,4.
        let mut b = Bundle::new(64);
        b.len = 4;
        b.tree = Tree::default();
        let buf = pack(&[
            (4, 4), // count
            (0, 1), // huff path
            (1, 4),
            (2, 4),
            (3, 4),
            (4, 4),
        ]);
        let mut r = BitReader::new(&buf);
        read_runs(&mut r, &mut b).unwrap();
        assert_eq!(&b.data[..4], &[1, 2, 3, 4]);
    }

    #[test]
    fn read_block_types_rle_expansion() {
        // Block-types RLE: symbol 12 = run-of-4 of last value.
        // Sequence: count=8, huff path, then symbols [3, 12, 5] meaning
        // "3, [3,3,3,3] (run of 4), 5" — 1 + 4 + 1 = 6 values written, but we
        // claimed count=8 so the decoder reads 2 more single-value symbols.
        // Use [3, 12, 5, 7, 9] → "3, 3,3,3,3, 5, 7, 9" = 8 values.
        let mut b = Bundle::new(64);
        b.len = 4;
        b.tree = Tree::default();
        let buf = pack(&[
            (8, 4),  // count
            (0, 1),  // huff path
            (3, 4),  // sym=3 (literal)
            (12, 4), // sym=12 (run of 4 of last=3)
            (5, 4),  // sym=5
            (7, 4),  // sym=7
            (9, 4),  // sym=9
        ]);
        let mut r = BitReader::new(&buf);
        read_block_types(&mut r, &mut b, 0).unwrap();
        assert_eq!(&b.data[..8], &[3, 3, 3, 3, 3, 5, 7, 9]);
    }

    #[test]
    fn read_dcs_zero_bsize_repeats_seed() {
        // 11 bits start, no sign for intra. Seed=42, then chunk(8) with
        // bsize=0 (just repeats), then remaining=3 with bsize=0.
        let mut b = Bundle::new(64);
        b.len = 4;
        let buf = pack(&[
            (12, 4),  // count = 12
            (42, 11), // seed = 42 (intra, no sign bit)
            (0, 4),   // bsize chunk #1 = 0 → 8 repeats
            (0, 4),   // bsize chunk #2 = 0 → 3 repeats
        ]);
        let mut r = BitReader::new(&buf);
        read_dcs(&mut r, &mut b, DC_START_BITS, /*has_sign=*/ false).unwrap();
        // 12 i16 values = 24 bytes, all == 42 LE.
        for i in 0..12 {
            let lo = b.data[i * 2];
            let hi = b.data[i * 2 + 1];
            assert_eq!(((hi as i16) << 8) | (lo as i16), 42);
        }
    }
}
