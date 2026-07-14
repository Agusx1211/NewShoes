//! Inverse Real Discrete Fourier Transform — the back-end of the
//! `binkaudio_rdft` audio variant.
//!
//! Direct port of FFmpeg's old `ff_rdft_calc_c` (the `IRDFT` configuration
//! gemrb still bundles), which in turn implements the standard "split a
//! real-input DFT of length N into a complex DFT of length N/2 plus an
//! unmangling pass" trick.
//!
//! The transform takes `N + 2` packed real floats as input and produces
//! `N` real floats in place. The packing is FFmpeg's standard layout for
//! `AV_TX_FLOAT_RDFT`:
//!
//! ```text
//! data[0]       = DC.re
//! data[1]       = DC.im        (== 0 for a real input signal)
//! data[2k]      = bin_k.re     for k ∈ [1, N/2)
//! data[2k+1]    = bin_k.im     for k ∈ [1, N/2)
//! data[N]       = Nyquist.re
//! data[N+1]     = Nyquist.im   (== 0 for a real input signal)
//! ```

use std::f32::consts::PI;

use crate::fft::{ComplexF32, Fft};

/// Inverse-RDFT context for a fixed length `N = 2^nbits`.
pub struct InverseRdft {
    nbits: u32,
    /// Length of the real signal (output samples). `N = 2^nbits`.
    pub n: usize,
    /// Internal complex FFT of size `N/2`. Set to inverse mode (`+i`
    /// twiddles) — combined with the unmangling stage this produces the
    /// inverse RDFT (`IRDFT` in FFmpeg's old enum: `sign_convention = -1`,
    /// theta sign positive).
    fft: Fft,
    /// `cos(2π·k / N)` for `k ∈ [0, N/4)`.
    tcos: Vec<f32>,
    /// `sin(2π·k / N)` for `k ∈ [0, N/4)`.
    tsin: Vec<f32>,
    /// Pre-allocated `N/2`-element scratch for the complex IFFT stage.
    /// Reused across calls to [`run`] so the audio hot path doesn't
    /// allocate.
    fft_buf: Vec<ComplexF32>,
}

impl InverseRdft {
    pub fn new(nbits: u32) -> Self {
        assert!((4..=15).contains(&nbits), "RDFT length must be 16..=32768");
        let n = 1usize << nbits;
        let quarter = n / 4;
        let mut tcos = vec![0f32; quarter];
        let mut tsin = vec![0f32; quarter];
        // Theta for IRDFT: 2π/N (positive sign in the old enum). The
        // sign_convention adjustment is folded into the unmangling pass
        // below — we pick `sign = -1` (IRDFT) which means we negate the
        // central imaginary slot at the end.
        for i in 0..quarter {
            let theta = 2.0 * PI * i as f32 / n as f32;
            tcos[i] = theta.cos();
            tsin[i] = theta.sin();
        }
        // Internal complex FFT runs INVERSE (matches IRDFT in the old
        // enum: `complex_inverse = trans == IRDFT || trans == RIDFT`).
        let fft = Fft::new(nbits - 1, /*inverse=*/ true);
        let fft_buf = vec![ComplexF32::ZERO; n / 2];
        Self {
            nbits,
            n,
            fft,
            tcos,
            tsin,
            fft_buf,
        }
    }

    /// Apply the inverse RDFT in place. `data.len()` must be `N + 2`; the
    /// trailing 2 slots hold the Nyquist real/imag.
    pub fn run(&mut self, data: &mut [f32]) {
        let n = self.n;
        debug_assert!(data.len() >= n);
        // Unmangling pass — splits the packed real-DFT representation
        // into the two interleaved size-N/2 complex DFTs that the inner
        // complex IFFT will consume.
        let k1 = 0.5f32;
        // For the inverse direction `k2 = 0.5 - 1 = -0.5` (`s->inverse`
        // is true → `(0.5 - s->inverse) = -0.5` in the C code).
        let k2 = -0.5f32;
        // i = 0 special case: DC real and Nyquist real are folded into
        // data[0] / data[1].
        let ev_re = data[0];
        data[0] = ev_re + data[1];
        data[1] = ev_re - data[1];
        for i in 1..n / 4 {
            let i1 = 2 * i;
            let i2 = n - i1;
            // Separate the implied even / odd FFT spectra.
            let ev_re = k1 * (data[i1] + data[i2]);
            let od_im = -k2 * (data[i1] - data[i2]);
            let ev_im = k1 * (data[i1 + 1] - data[i2 + 1]);
            let od_re = k2 * (data[i1 + 1] + data[i2 + 1]);
            let c = self.tcos[i];
            let s = self.tsin[i];
            data[i1] = ev_re + od_re * c - od_im * s;
            data[i1 + 1] = ev_im + od_im * c + od_re * s;
            data[i2] = ev_re - od_re * c + od_im * s;
            data[i2 + 1] = -ev_im + od_im * c + od_re * s;
        }
        // Final central-slot sign correction: IRDFT applies
        // `sign_convention = -1` to `data[2*(n/4) + 1] = data[n/2 + 1]`.
        // Negating it here matches FFmpeg's `ff_rdft_calc_c` exit
        // sequence.
        data[n / 2 + 1] = -data[n / 2 + 1];
        // DC / Nyquist halving (the `s->inverse ? data[0..1] *= k1 : ...`
        // branch).
        data[0] *= k1;
        data[1] *= k1;

        // Complex IFFT of size N/2, in place. We re-interpret `data[0..n]`
        // as `n/2` complex pairs (`(re, im)` per pair) via the pre-
        // allocated `fft_buf` (so this hot-path call doesn't allocate).
        let half = n / 2;
        for i in 0..half {
            self.fft_buf[i] = ComplexF32::new(data[2 * i], data[2 * i + 1]);
        }
        self.fft.run(&mut self.fft_buf);
        for (i, c) in self.fft_buf.iter().enumerate() {
            data[2 * i] = c.re;
            data[2 * i + 1] = c.im;
        }
        let _ = self.nbits; // recorded for clarity / future debug only
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Inverse RDFT of an all-zero input is all-zero output.
    #[test]
    fn inverse_rdft_zero_input() {
        let mut r = InverseRdft::new(5); // N = 32
        let mut data = vec![0f32; r.n + 2];
        r.run(&mut data);
        for &v in &data[..r.n] {
            assert!(v.abs() < 1e-5, "zero input → zero output, got {v}");
        }
    }

    /// Inverse RDFT of a DC-only input (real DC = N) produces a constant
    /// time-domain signal in the standard FFT convention. Since the
    /// internal FFT is unnormalised, we don't expect a unit impulse here
    /// but a constant value scaled by the un-normalised inverse.
    #[test]
    fn inverse_rdft_dc_constant() {
        let mut r = InverseRdft::new(5); // N = 32
        let mut data = vec![0f32; r.n + 2];
        data[0] = r.n as f32; // DC real = N — picks up the conventional normalisation
        // data[1] = 0 (Nyquist re), data[N..N+2] = 0 (already zero)
        r.run(&mut data);
        // Expectation: a uniform constant across all N samples (sign and
        // magnitude depend on convention; we only check uniformity here).
        let first = data[0];
        for &v in &data[..r.n] {
            assert!(
                (v - first).abs() < 1e-3,
                "DC-only input should give a constant signal, got {v} vs {first}",
            );
        }
        assert!(first.abs() > 0.0, "constant should be non-zero");
    }
}
