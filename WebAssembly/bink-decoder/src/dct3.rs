//! FFT-based inverse DCT-III used by the `binkaudio_dct` audio variant.
//!
//! Direct port of FFmpeg's `ff_tx_dctIII` (`libavutil/tx_template.c`),
//! adapted for our compact-convention [`InverseRdft`]:
//!
//! 1. Pre-shuffle the frequency-domain coefficients into a complex
//!    spectrum (see [`pre_shuffle`]).
//! 2. Inverse RDFT of length `N` (re-uses [`InverseRdft`]).
//! 3. Post-shuffle the time-domain samples into the final DCT order.
//!
//! Compared to the previous O(N²) slow DCT this brings the per-block cost
//! down to O(N log N) and replaces a `frame_len² * 4` byte cosine table
//! with two small trig tables totalling `1.5 * frame_len * 4` bytes
//! (~12 KB at `frame_len = 2048`).

use std::f32::consts::PI;

use crate::rdft::InverseRdft;

/// Inverse DCT-III context for a fixed `len = 2^bits` (= bink audio
/// `frame_len`). Reused across blocks.
pub struct Dct3 {
    pub len: usize,
    /// Concatenated trig tables, mirroring FFmpeg's `s->exp`:
    ///   `cos_tab[0..len]`     = `cos(i · π / (2N))` for `i = 0..len-1`
    ///   `cos_tab[len..3N/2]` = `0.5 / sin((2i+1) · π / (2N))` for `i = 0..len/2-1`
    /// First half drives the pre-shuffle, second half the post-shuffle.
    cos_tab: Vec<f32>,
    /// Compact-convention inverse RDFT of length `len`. The DCT pre-
    /// shuffle places "Nyquist" at `data[1]` (instead of FFmpeg's
    /// `data[len]`) so the same `InverseRdft` we use for the standalone
    /// RDFT audio path can be reused unchanged.
    rdft: InverseRdft,
}

impl Dct3 {
    /// Build a DCT-III context for length `2^nbits`.
    pub fn new(nbits: u32) -> Self {
        let len = 1usize << nbits;
        let freq = PI / (2.0 * len as f32);
        let mut cos_tab = vec![0f32; len + len / 2];
        for (i, slot) in cos_tab[..len].iter_mut().enumerate() {
            *slot = (i as f32 * freq).cos();
        }
        // Inverse-direction post-shuffle factors. FFmpeg uses
        // `0.5 / sin((2i+1) * freq)` here.
        for (i, slot) in cos_tab[len..].iter_mut().enumerate() {
            *slot = 0.5 / ((2 * i + 1) as f32 * freq).sin();
        }
        let rdft = InverseRdft::new(nbits);
        Self { len, cos_tab, rdft }
    }

    /// Compute the inverse DCT-III in place. `data.len()` must be at
    /// least `len` (the trailing two slots are not used by the compact
    /// algorithm). The output replaces the input across `data[0..len]`.
    ///
    /// The caller's `data[0]` is doubled internally to match FFmpeg's
    /// `coeffs[0] /= 0.5` adjustment; binkaudio's slow DCT folded the
    /// same factor into its dot-product sum.
    pub fn run(&mut self, data: &mut [f32]) {
        let n = self.len;
        debug_assert!(data.len() >= n);

        // Apply FFmpeg's DC-doubling so the post-RDFT values land on the
        // same scale as the slow DCT's `acc = coeffs[0]` accumulator.
        data[0] *= 2.0;

        // Capture 2·x[N-1] before the pre-shuffle clobbers `data[n-1]`.
        // FFmpeg writes this to `data[n]` (extended-convention Nyquist);
        // we stash it for the compact-convention slot at `data[1]` after
        // the pre-shuffle loop reads the original `data[1]` for the
        // i=2 iteration.
        let nyquist = 2.0 * data[n - 1];

        // Pre-shuffle CMUL loop: i goes len-2, len-4, ..., 4, 2.
        // Each iter mixes `data[i-1]`, `data[i]`, `data[i+1]` into a
        // complex pair written back into `data[i]` / `data[i+1]`. The
        // `data[1]` slot is read once (in the i=2 iteration) before we
        // overwrite it with `nyquist` below.
        let mut i = n - 2;
        while i >= 2 {
            let val1 = data[i];
            let val2 = data[i - 1] - data[i + 1];
            let exp_ni = self.cos_tab[n - i];
            let exp_i = self.cos_tab[i];
            // CMUL: dre = a_re*b_re - a_im*b_im, dim = a_re*b_im + a_im*b_re
            // FFmpeg's CMUL(src[i+1], src[i], exp[n-i], exp[i], val1, val2)
            //   src[i+1] = exp[n-i]*val1 - exp[i]*val2
            //   src[i]   = exp[n-i]*val2 + exp[i]*val1
            data[i + 1] = exp_ni * val1 - exp_i * val2;
            data[i] = exp_ni * val2 + exp_i * val1;
            i -= 2;
        }

        // Move the captured Nyquist into the compact-convention slot
        // that our `InverseRdft` reads as the half-band coefficient.
        data[1] = nyquist;

        // Inverse RDFT (in place on data[0..n]). Compact-convention.
        self.rdft.run(data);

        // Post-shuffle. Each pair (i, n-1-i) is touched once and is
        // independent of the others, so this works in place safely.
        // The trailing `* (1.0 / n as f32)` folds the orthonormalising
        // factor into the same loop. Our `InverseRdft` already absorbs
        // an implicit ½ at the DC/Nyquist butterfly, so the final scale
        // here is `1/N` rather than the `2/N` the slow DCT applied.
        let scale = 1.0 / n as f32;
        let post = &self.cos_tab[n..];
        for i in 0..n / 2 {
            let in1 = data[i];
            let in2 = data[n - i - 1];
            let c = post[i];
            let tmp1 = in1 + in2;
            let tmp2 = (in1 - in2) * c;
            data[i] = (tmp1 + tmp2) * scale;
            data[n - i - 1] = (tmp1 - tmp2) * scale;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Reference slow DCT-III matching the formula the old
    /// `audio.rs::inverse_dct` used after the December DC-scale fix:
    ///
    /// `y[n] = (2/N) · (x[0] + sum_{k>=1} x[k] · cos(π·(2n+1)·k / (2N)))`
    fn slow_dct(input: &[f32]) -> Vec<f32> {
        let n = input.len();
        let scale = 2.0 / n as f32;
        let pi_over_2n = PI / (2.0 * n as f32);
        let mut out = vec![0f32; n];
        for (idx, slot) in out.iter_mut().enumerate() {
            let mut acc = input[0];
            for (k, &x) in input.iter().enumerate().take(n).skip(1) {
                acc += x * (pi_over_2n * (2 * idx + 1) as f32 * k as f32).cos();
            }
            *slot = acc * scale;
        }
        out
    }

    fn check_against_slow(coeffs: &[f32], tol: f32) {
        let n = coeffs.len();
        let nbits = n.trailing_zeros();
        let mut data = vec![0f32; n + 2];
        data[..n].copy_from_slice(coeffs);
        let mut dct = Dct3::new(nbits);
        dct.run(&mut data);
        let want = slow_dct(coeffs);
        for (i, (got, exp)) in data[..n].iter().zip(want.iter()).enumerate() {
            assert!(
                (got - exp).abs() < tol,
                "n={} sample {} mismatch: fft={got}, slow={exp}",
                n,
                i,
            );
        }
    }

    #[test]
    fn dct3_dc_only() {
        let n = 64usize;
        let mut input = vec![0f32; n];
        input[0] = 1.0;
        check_against_slow(&input, 1e-5);
    }

    #[test]
    fn dct3_single_ac_bin() {
        // Each AC bin in turn — exercises the pre-shuffle and post-shuffle
        // for non-trivial coefficients.
        let n = 64usize;
        for k in 1..n {
            let mut input = vec![0f32; n];
            input[k] = 1.0;
            check_against_slow(&input, 5e-5);
        }
    }

    #[test]
    fn dct3_random_block() {
        // Pseudo-random coefficients so all bins are excited at once.
        // Different lengths cover the actual binkaudio frame_len values
        // (2^9, 2^10, 2^11).
        for nbits in 9..=11 {
            let n = 1usize << nbits;
            let mut input = vec![0f32; n];
            let mut state = 0x1234_5678u32;
            for slot in input.iter_mut() {
                state = state.wrapping_mul(1_103_515_245).wrapping_add(12_345);
                *slot = ((state >> 8) & 0xFFFF) as f32 / 32_768.0 - 1.0;
            }
            // Larger N means more accumulated rounding; scale tolerance
            // with sqrt(N) which empirically tracks the L2 drift.
            check_against_slow(&input, (n as f32).sqrt() * 1e-5);
        }
    }
}
