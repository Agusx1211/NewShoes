//! Bink-specific DSP primitives — port of FFmpeg's `binkdsp.c`.
//!
//! All routines are scalar (no SIMD): the focus of this crate is *pure
//! Rust* and *correctness*, and a Bink frame at 640×480 only adds up to
//! ~4800 8×8 IDCTs per frame — the C scalar version is already comfortably
//! real-time on a modern CPU, so a faithful Rust translation is plenty.
//!
//! The four primitives:
//! * [`idct_put`] — IDCT an 8×8 DCT block and *replace* the destination.
//!   Used for `INTRA_BLOCK`.
//! * [`idct_add`] — IDCT an 8×8 DCT block and *add* it to the destination.
//!   Used for `INTER_BLOCK` after motion compensation.
//! * [`scale_block`] — copy an 8×8 source into a 16×16 destination by
//!   2×2 pixel replication. Used for `SCALED_BLOCK`.
//! * [`add_pixels8`] — add an 8×8 i16 residue to an 8×8 u8 destination.
//!   Used for `RESIDUE_BLOCK`.
//!
//! Plus [`unquantize_dct_coeffs`] — apply the 64-entry quant table to a
//! sparse list of DCT coefficient indices, mirroring FFmpeg's
//! `unquantize_dct_coeffs` in `bink.c`.

/// IDCT butterfly constants. Lifted verbatim from `binkdsp.c`.
const A1: i32 = 2896; // (1/sqrt(2)) << 12
const A2: i32 = 2217;
const A3: i32 = 3784;
const A4: i32 = -5352;

/// Fixed-point multiply: matches the C `MUL(X, Y)` macro semantics including
/// the cast-to-unsigned-then-shift trick (which makes the shift behaviour
/// well-defined for the `A4 * x` case where `A4` is negative).
#[inline(always)]
fn mul(x: i32, y: i32) -> i32 {
    ((x as u32).wrapping_mul(y as u32) as i32) >> 11
}

/// Apply the 8-tap IDCT butterfly to one row or column.
///
/// `src` lays out 8 source samples at strides `s_stride`, `dst` lays out 8
/// destination samples at strides `d_stride`. `munge` is applied to each
/// output before storage — `MUNGE_ROW` rounds & shifts down by 8 for the
/// final row pass, `MUNGE_NONE` is the identity for the column pass.
#[inline(always)]
fn idct_step(
    src: &[i32],
    s_off: usize,
    s_stride: usize,
    dst: &mut [i32],
    d_off: usize,
    d_stride: usize,
    munge: impl Fn(i32) -> i32,
) {
    let s = |i: usize| src[s_off + i * s_stride];
    let a0 = s(0) + s(4);
    let a1 = s(0) - s(4);
    let a2 = s(2) + s(6);
    let a3 = mul(A1, s(2) - s(6));
    let a4 = s(5) + s(3);
    let a5 = s(5) - s(3);
    let a6 = s(1) + s(7);
    let a7 = s(1) - s(7);
    let b0 = a4 + a6;
    let b1 = mul(A3, a5 + a7);
    let b2 = mul(A4, a5) - b0 + b1;
    let b3 = mul(A1, a6 - a4) - b2;
    let b4 = mul(A2, a7) + b3 - b1;

    dst[d_off] = munge(a0 + a2 + b0);
    dst[d_off + d_stride] = munge(a1 + a3 - a2 + b2);
    dst[d_off + 2 * d_stride] = munge(a1 - a3 + a2 + b3);
    dst[d_off + 3 * d_stride] = munge(a0 - a2 - b4);
    dst[d_off + 4 * d_stride] = munge(a0 - a2 + b4);
    dst[d_off + 5 * d_stride] = munge(a1 - a3 + a2 - b3);
    dst[d_off + 6 * d_stride] = munge(a1 + a3 - a2 - b2);
    dst[d_off + 7 * d_stride] = munge(a0 + a2 - b0);
}

/// Column IDCT with the all-zero short-circuit from `binkdsp.c`. When all
/// non-DC entries are zero, the eight outputs collapse to a single value —
/// this happens often in flat regions, so the fast path is genuinely worth
/// having.
#[inline]
fn idct_col(temp: &mut [i32; 64], block: &[i32; 64], col: usize) {
    let any_ac = block[col + 8]
        | block[col + 16]
        | block[col + 24]
        | block[col + 32]
        | block[col + 40]
        | block[col + 48]
        | block[col + 56];
    if any_ac == 0 {
        let v = block[col];
        for row in 0..8 {
            temp[col + row * 8] = v;
        }
    } else {
        idct_step(block, col, 8, temp, col, 8, |x| x);
    }
}

/// IDCT all 8 columns of `block` into `temp`.
fn idct_columns(block: &[i32; 64], temp: &mut [i32; 64]) {
    for col in 0..8 {
        idct_col(temp, block, col);
    }
}

/// Row pass with rounding (`(x + 0x7F) >> 8`) — used for both `idct_put`
/// and `idct_add`'s in-place row reduction.
#[inline]
fn munge_row(x: i32) -> i32 {
    (x + 0x7F) >> 8
}

/// Replace the 8×8 region at `dest`/`linesize` with the IDCT of `block`.
/// `dest.len()` must be at least `linesize * 7 + 8`.
pub fn idct_put(dest: &mut [u8], linesize: usize, block: &[i32; 64]) {
    let mut temp = [0i32; 64];
    idct_columns(block, &mut temp);
    let mut row_out = [0i32; 8];
    for row in 0..8 {
        idct_step(&temp, row * 8, 1, &mut row_out, 0, 1, munge_row);
        let off = row * linesize;
        for j in 0..8 {
            // The C version stores the int directly into uint8_t, which is
            // a wrapping truncation. Bink's IDCT inputs are all in range
            // such that a clamp wouldn't change the result on valid streams,
            // but matching the C wrap exactly keeps fuzzed/malformed inputs
            // bit-identical to FFmpeg.
            dest[off + j] = row_out[j] as u8;
        }
    }
}

/// Add the IDCT of `block` to the existing 8×8 region at `dest`/`linesize`.
/// Used for `INTER_BLOCK` after motion compensation has filled `dest`.
pub fn idct_add(dest: &mut [u8], linesize: usize, block: &mut [i32; 64]) {
    // bink_idct_add_c writes the row-pass output back into `block`, then
    // adds pixel-by-pixel.
    let mut temp = [0i32; 64];
    idct_columns(block, &mut temp);
    for row in 0..8 {
        let mut tmp = [0i32; 8];
        idct_step(&temp, row * 8, 1, &mut tmp, 0, 1, munge_row);
        let bdst = &mut block[row * 8..row * 8 + 8];
        bdst.copy_from_slice(&tmp);
    }
    for row in 0..8 {
        let off = row * linesize;
        for j in 0..8 {
            dest[off + j] = dest[off + j].wrapping_add(block[row * 8 + j] as u8);
        }
    }
}

/// Replicate the 8×8 source into a 16×16 destination via 2×2 pixel
/// duplication. Used for `SCALED_BLOCK`. `dst` must have at least
/// `linesize * 15 + 16` bytes accessible from index 0.
pub fn scale_block(src: &[u8; 64], dst: &mut [u8], linesize: usize) {
    for j in 0..8 {
        let s_off = j * 8;
        let d_off1 = j * 2 * linesize;
        let d_off2 = (j * 2 + 1) * linesize;
        for i in 0..8 {
            let v = src[s_off + i];
            dst[d_off1 + i * 2] = v;
            dst[d_off1 + i * 2 + 1] = v;
            dst[d_off2 + i * 2] = v;
            dst[d_off2 + i * 2 + 1] = v;
        }
    }
}

/// Add an 8×8 i16 residue block to a u8 destination. Used by `RESIDUE_BLOCK`
/// once the residue's nonzero coefficients have been decoded into `block`.
/// Wraps on overflow — matches the C version.
pub fn add_pixels8(pixels: &mut [u8], block: &[i16; 64], linesize: usize) {
    for j in 0..8 {
        let p_off = j * linesize;
        let b_off = j * 8;
        for i in 0..8 {
            pixels[p_off + i] = pixels[p_off + i].wrapping_add(block[b_off + i] as u8);
        }
    }
}

/// Apply the 64-entry dequantization table to the DC + sparse non-DC
/// coefficients of an 8×8 DCT block.
///
/// `coef_idx[0..coef_count]` are the *zig-zag positions* of the non-zero
/// coefficients (per `read_dct_coeffs`). The actual block-array position is
/// `scan[coef_idx[i]]`. DC (zig-zag position 0, block position 0) is always
/// dequantized regardless of `coef_idx`.
pub fn unquantize_dct_coeffs(
    block: &mut [i32; 64],
    quant: &[i32; 64],
    coef_idx: &[u8],
    scan: &[u8; 64],
) {
    // DC: always dequantized first.
    block[0] = ((block[0] as i64 * quant[0] as i64) >> 11) as i32;
    for &zz in coef_idx {
        let pos = scan[zz as usize] as usize;
        block[pos] = ((block[pos] as i64 * quant[zz as usize] as i64) >> 11) as i32;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn idct_zero_block_is_zero() {
        let mut dst = [0xCCu8; 64];
        let block = [0i32; 64];
        idct_put(&mut dst, 8, &block);
        assert_eq!(dst, [0u8; 64]);
    }

    #[test]
    fn idct_dc_only_block() {
        // DC value = 256 → all pixels = (256 + 0x7F) >> 8 = 1.
        let mut dst = [0u8; 64];
        let mut block = [0i32; 64];
        block[0] = 256;
        idct_put(&mut dst, 8, &block);
        assert_eq!(dst, [1u8; 64]);

        // DC = 2048 → (2048 + 0x7F) >> 8 = 8.
        let mut dst = [0u8; 64];
        block[0] = 2048;
        idct_put(&mut dst, 8, &block);
        assert_eq!(dst, [8u8; 64]);
    }

    #[test]
    fn idct_dc_via_munge_round() {
        // Precise rounding behaviour at the half-step. (x + 127) >> 8.
        // x = 128 → (128 + 127) >> 8 = 255 >> 8 = 0.
        // x = 129 → (129 + 127) >> 8 = 256 >> 8 = 1.
        let mut dst = [0u8; 64];
        let mut block = [0i32; 64];
        block[0] = 128;
        idct_put(&mut dst, 8, &block);
        assert_eq!(dst, [0u8; 64]);
        block[0] = 129;
        idct_put(&mut dst, 8, &block);
        assert_eq!(dst, [1u8; 64]);
    }

    #[test]
    fn idct_add_to_existing_image() {
        // DC = 256 → adds 1 to every pixel.
        let mut dst = [10u8; 64];
        let mut block = [0i32; 64];
        block[0] = 256;
        idct_add(&mut dst, 8, &mut block);
        assert_eq!(dst, [11u8; 64]);
    }

    #[test]
    fn scale_block_replicates_2x2() {
        let src: [u8; 64] = std::array::from_fn(|i| i as u8);
        let mut dst = [0u8; 256]; // 16x16
        scale_block(&src, &mut dst, 16);
        // top-left input pixel (0) → dst[0..2] and dst[16..18]
        assert_eq!(dst[0], 0);
        assert_eq!(dst[1], 0);
        assert_eq!(dst[16], 0);
        assert_eq!(dst[17], 0);
        // input (row 1, col 0) = 8 → dst[32..34] and dst[48..50].
        assert_eq!(dst[32], 8);
        assert_eq!(dst[33], 8);
        assert_eq!(dst[48], 8);
        assert_eq!(dst[49], 8);
        // input (row 7, col 7) = 63 → dst[14..16, row 14..16 of 16-stride]
        assert_eq!(dst[14 * 16 + 14], 63);
        assert_eq!(dst[15 * 16 + 15], 63);
    }

    #[test]
    fn add_pixels8_wraps() {
        let mut pix = [200u8; 64];
        let mut block = [0i16; 64];
        block[0] = 100; // 200 + 100 = 300 → wraps to 44.
        block[63] = -50; // 200 - 50 = 150.
        add_pixels8(&mut pix, &block, 8);
        assert_eq!(pix[0], 44);
        assert_eq!(pix[63], 150);
    }

    #[test]
    fn dequant_dc_then_sparse_coeffs() {
        // quant[0] = 1<<11 means the dequantize is identity for that slot.
        let mut block = [0i32; 64];
        block[0] = 42;
        block[5] = 7;
        block[20] = -3;
        let mut q = [0i32; 64];
        q[0] = 1 << 11;
        q[3] = 2 << 11;
        q[10] = 4 << 11;
        // Scan: for the test, choose a scan whose [3] = 5 and [10] = 20.
        let mut scan = [0u8; 64];
        scan[3] = 5;
        scan[10] = 20;
        let coef_idx = [3u8, 10];
        unquantize_dct_coeffs(&mut block, &q, &coef_idx, &scan);
        assert_eq!(block[0], 42); // identity
        assert_eq!(block[5], 14); // 7 * 2 = 14
        assert_eq!(block[20], -12); // -3 * 4 = -12
    }
}
