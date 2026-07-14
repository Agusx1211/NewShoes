//! DCT-coefficient and residue bitstream decoders.
//!
//! Both functions implement the same `coef_list` / `mode_list` state-machine
//! coding scheme that Bink uses to scatter the non-zero coefficients of an
//! 8×8 block. Mirrors `read_dct_coeffs` and `read_residue` in FFmpeg's
//! `bink.c`. The shared four-mode dispatch lives in [`walk_coef_list`];
//! each consumer plugs in its own per-coefficient emit closure (signed
//! width-coded value for DCT, ±mask for residue).

use crate::bitreader::BitReader;
use crate::error::{BikError, BikResult};

/// Mutable scratch the walker carries between iterations. Allocated on
/// the stack — total size is 128 + 128 + 16 = 272 bytes.
struct CoefListState {
    coef_list: [i32; 128],
    mode_list: [u8; 128],
    list_start: usize,
    list_end: usize,
}

impl CoefListState {
    /// Create an empty state. Slot 64 is the "centre" — `list_start`
    /// decrements from there (mode-3 prepends), `list_end` increments
    /// (case-1/case-2 appends). Both are valid indices in `[0, 128)`
    /// across any decoded block.
    fn new() -> Self {
        Self {
            coef_list: [0; 128],
            mode_list: [0; 128],
            list_start: 64,
            list_end: 64,
        }
    }

    fn push(&mut self, ccoef: i32, mode: u8) {
        self.coef_list[self.list_end] = ccoef;
        self.mode_list[self.list_end] = mode;
        self.list_end += 1;
    }
}

/// One pass of the inner state-machine walk. Drains every gated slot in
/// `state` until `list_end` is reached, calling `emit(r, ccoef)` for
/// each discovered non-zero coefficient. The closure returns `Ok(true)`
/// to keep going or `Ok(false)` to abort the pass early — the residue
/// decoder uses the latter once its `masks_count` budget runs out.
fn walk_coef_list<E>(
    r: &mut BitReader<'_>,
    state: &mut CoefListState,
    mut emit: E,
) -> BikResult<bool>
where
    E: FnMut(&mut BitReader<'_>, i32) -> BikResult<bool>,
{
    let mut list_pos = state.list_start;
    while list_pos < state.list_end {
        // Skip empty slots (mode 0 *and* coef 0) and gated-off ones. The
        // C code expresses "empty" as `!(mode_list[i] | coef_list[i])`
        // which we mirror with `(ml | (cl != 0)) == 0` — equivalent because
        // `mode_list` is u8 in [0,3] and `coef_list != 0` is the second bit.
        let ml = state.mode_list[list_pos];
        let cl = state.coef_list[list_pos];
        if (ml | (cl != 0) as u8) == 0 || r.read_bit()? == 0 {
            list_pos += 1;
            continue;
        }
        let mut ccoef = cl;
        match ml {
            0 => {
                // Mode 0: promote the slot to mode 1 (still pointing at
                // the same starting coef + 4) so the next iteration of
                // the outer pass walks the next four positions; emit /
                // prepend the four current ones now.
                state.coef_list[list_pos] = ccoef + 4;
                state.mode_list[list_pos] = 1;
                if !emit_or_prepend_four(r, state, &mut ccoef, &mut emit)? {
                    return Ok(false);
                }
            }
            1 => {
                // Mode 1: demote to mode 2 in place and append three more
                // mode-2 slots four positions further out. No emits.
                state.mode_list[list_pos] = 2;
                for _ in 0..3 {
                    ccoef += 4;
                    state.push(ccoef, 2);
                }
            }
            2 => {
                // Mode 2: like mode 0's body but the slot is consumed
                // (cleared) and we advance past it before the four-emit.
                state.coef_list[list_pos] = 0;
                state.mode_list[list_pos] = 0;
                list_pos += 1;
                if !emit_or_prepend_four(r, state, &mut ccoef, &mut emit)? {
                    return Ok(false);
                }
            }
            3 => {
                // Mode 3: a single coefficient at `ccoef`. Emit, then
                // clear the slot.
                let keep_going = emit(r, ccoef)?;
                state.coef_list[list_pos] = 0;
                state.mode_list[list_pos] = 0;
                list_pos += 1;
                if !keep_going {
                    return Ok(false);
                }
            }
            _ => unreachable!("mode is 2 bits, 0..=3 only"),
        }
    }
    Ok(true)
}

/// Mode-0 / mode-2 inner body: four iterations, each either prepends a
/// mode-3 slot at `ccoef` (when the gate bit is set) or emits the
/// coefficient. `ccoef` is incremented after every iteration. Returns
/// `Ok(false)` if the emit closure asked us to stop early.
fn emit_or_prepend_four<E>(
    r: &mut BitReader<'_>,
    state: &mut CoefListState,
    ccoef: &mut i32,
    emit: &mut E,
) -> BikResult<bool>
where
    E: FnMut(&mut BitReader<'_>, i32) -> BikResult<bool>,
{
    for _ in 0..4 {
        if r.read_bit()? != 0 {
            state.list_start -= 1;
            state.coef_list[state.list_start] = *ccoef;
            state.mode_list[state.list_start] = 3;
        } else if !emit(r, *ccoef)? {
            return Ok(false);
        }
        *ccoef += 1;
    }
    Ok(true)
}

/// Decode the non-DC coefficients of an 8×8 DCT block. The DC coefficient
/// (`block[0]`) must already be filled in by the caller.
///
/// `coef_idx[0..count]` is filled with the *zig-zag* indices (0..63) of the
/// non-zero coefficients written. `count` does not include the DC coef.
///
/// Returns the quantization-table index (0..15) used for this block. When
/// `q < 0`, the index is read from the bitstream; otherwise `q` is used and
/// no bits are consumed for it (BinkB intra/inter blocks supply `q`
/// explicitly).
pub fn read_dct_coeffs(
    r: &mut BitReader<'_>,
    block: &mut [i32; 64],
    scan: &[u8; 64],
    coef_idx: &mut [u8; 64],
    count: &mut usize,
    q: i32,
) -> BikResult<u8> {
    if r.bits_left() < 4 {
        return Err(BikError::Truncated {
            pos: r.bit_pos(),
            needed: 4,
        });
    }

    let mut state = CoefListState::new();
    // Three groups of four (4..8, 24..28, 44..48), then three mode-3
    // singletons at zig-zag positions 1, 2, 3.
    state.push(4, 0);
    state.push(24, 0);
    state.push(44, 0);
    state.push(1, 3);
    state.push(2, 3);
    state.push(3, 3);

    let mut coef_count = 0usize;
    let mut bits = (r.read_bits(4)? as i32) - 1;
    while bits >= 0 {
        // Capture `bits` and `coef_count` by moving them into the
        // closure-friendly mutable references below.
        let bits_now = bits;
        walk_coef_list(r, &mut state, |r, ccoef| {
            let t = if bits_now == 0 {
                1 - ((r.read_bit()? as i32) << 1)
            } else {
                let raw = r.read_bits(bits_now as u32)? as i32 | (1 << bits_now);
                let sign = -(r.read_bit()? as i32);
                (raw ^ sign) - sign
            };
            block[scan[ccoef as usize] as usize] = t;
            coef_idx[coef_count] = ccoef as u8;
            coef_count += 1;
            Ok(true) // DCT never aborts mid-pass
        })?;
        bits -= 1;
    }

    let quant_idx = if q < 0 {
        r.read_bits(4)? as u8
    } else {
        if (q as u32) > 15 {
            return Err(BikError::Malformed("quant_idx out of range"));
        }
        q as u8
    };

    *count = coef_count;
    Ok(quant_idx)
}

/// Decode the residue (i16 difference) layered onto a motion-compensated
/// block. Mirrors `read_residue` in bink.c. `masks_count` is the upper bound
/// on how many "mask updates" the bitstream is allowed to perform; when it
/// hits zero the function returns even mid-pass.
pub fn read_residue(
    r: &mut BitReader<'_>,
    block: &mut [i16; 64],
    masks_count: i32,
) -> BikResult<()> {
    let mut state = CoefListState::new();
    state.push(4, 0);
    state.push(24, 0);
    state.push(44, 0);
    state.push(0, 2);

    let mut nz_coeff = [0u8; 64];
    let mut nz_coeff_count = 0usize;
    let mut masks_count = masks_count;

    let initial_bits = r.read_bits(3)?;
    let mut mask: i32 = 1 << initial_bits;
    while mask != 0 {
        // First pass: refine existing non-zeros with ±mask (no list
        // walking — they're tracked in `nz_coeff`).
        for &nz in nz_coeff.iter().take(nz_coeff_count) {
            if r.read_bit()? == 0 {
                continue;
            }
            let pos = nz as usize;
            if block[pos] < 0 {
                block[pos] = block[pos].wrapping_sub(mask as i16);
            } else {
                block[pos] = block[pos].wrapping_add(mask as i16);
            }
            masks_count -= 1;
            if masks_count < 0 {
                return Ok(());
            }
        }

        // Second pass: walk the coef_list to discover new non-zeros.
        let keep_going = walk_coef_list(r, &mut state, |r, ccoef| {
            let pos = crate::tables::BINK_SCAN[ccoef as usize];
            nz_coeff[nz_coeff_count] = pos;
            nz_coeff_count += 1;
            let sign = -(r.read_bit()? as i32);
            block[pos as usize] = ((mask ^ sign) - sign) as i16;
            masks_count -= 1;
            Ok(masks_count >= 0)
        })?;
        if !keep_going {
            return Ok(());
        }
        mask >>= 1;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bitreader::BitReader;
    use crate::tables::BINK_SCAN;

    /// Helper: pack `(value, bit_count)` pairs LSB-first into a byte buffer.
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
    fn empty_dct_block() {
        // bits = 0, q = read_bits(4) at end. With bits-1 = -1, the outer
        // loop never fires, so we just consume 4 bits for `bits` and 4 bits
        // for `quant_idx`.
        let buf = pack(&[
            (0, 4), // initial_bits = 0 -> bits = -1, no passes
            (7, 4), // quant_idx = 7
        ]);
        let mut r = BitReader::new(&buf);
        let mut block = [0i32; 64];
        let scan = BINK_SCAN;
        let mut coef_idx = [0u8; 64];
        let mut count = 0usize;
        let q = read_dct_coeffs(&mut r, &mut block, &scan, &mut coef_idx, &mut count, -1).unwrap();
        assert_eq!(q, 7);
        assert_eq!(count, 0);
        assert!(block.iter().all(|&v| v == 0));
    }

    #[test]
    fn fixed_quant_idx_path() {
        // Same as above but supply q explicitly; no quant_idx bits read.
        let buf = pack(&[
            (0, 4), // initial_bits = 0
        ]);
        let mut r = BitReader::new(&buf);
        let mut block = [0i32; 64];
        let scan = BINK_SCAN;
        let mut coef_idx = [0u8; 64];
        let mut count = 0usize;
        let q = read_dct_coeffs(&mut r, &mut block, &scan, &mut coef_idx, &mut count, 9).unwrap();
        assert_eq!(q, 9);
        assert_eq!(count, 0);
    }
}
