//! Radix-2 Cooley-Tukey complex FFT, used by the inverse-RDFT path of the
//! Bink audio decoder. Sizes Bink needs: 256–2048 (forward) plus the same
//! sizes inverse for the second pass of the RDFT.
//!
//! The implementation is a textbook in-place decimation-in-time radix-2
//! Cooley-Tukey: bit-reverse permutation of the input, then `log2(N)`
//! butterfly stages with twiddle factors `exp(±2π·i·k / N)`. Twiddle
//! factors are computed inline (cached per instance) — the precision is
//! `f32`, matching FFmpeg's `FFTSample`.

use std::f32::consts::PI;

#[derive(Debug, Clone, Copy)]
pub struct ComplexF32 {
    pub re: f32,
    pub im: f32,
}

impl ComplexF32 {
    pub const ZERO: Self = Self { re: 0.0, im: 0.0 };

    pub fn new(re: f32, im: f32) -> Self {
        Self { re, im }
    }
}

pub struct Fft {
    /// Number of points (power of two).
    pub n: usize,
    /// `true` => inverse FFT (twiddles use `+i` convention, no 1/N
    /// normalisation — caller divides if they want it).
    inverse: bool,
    /// Pre-built bit-reversal permutation table.
    revtab: Vec<u32>,
    /// Pre-built twiddle factors. `twiddle[k]` for `k ∈ [0, n/2)` holds
    /// `exp(±2π·i·k / n)`.
    twiddle: Vec<ComplexF32>,
}

impl Fft {
    /// Build an FFT context for `2^nbits` points. `inverse=false` is the
    /// forward transform `X[k] = Σ x[n] · exp(-2πi·k·n/N)`; `inverse=true`
    /// flips the sign of the exponential and produces the unnormalised
    /// inverse `x[n] = Σ X[k] · exp(+2πi·k·n/N)`.
    pub fn new(nbits: u32, inverse: bool) -> Self {
        assert!(
            (1..=15).contains(&nbits),
            "FFT size must be 2..=32768 points",
        );
        let n = 1usize << nbits;
        let mut revtab = vec![0u32; n];
        for (i, slot) in revtab.iter_mut().enumerate() {
            let mut rev = 0u32;
            let mut idx = i as u32;
            for _ in 0..nbits {
                rev = (rev << 1) | (idx & 1);
                idx >>= 1;
            }
            *slot = rev;
        }
        let sign = if inverse { 1.0f32 } else { -1.0f32 };
        let mut twiddle = vec![ComplexF32::ZERO; n / 2];
        for (k, slot) in twiddle.iter_mut().enumerate() {
            let theta = sign * 2.0 * PI * k as f32 / n as f32;
            *slot = ComplexF32::new(theta.cos(), theta.sin());
        }
        Self {
            n,
            inverse,
            revtab,
            twiddle,
        }
    }

    /// Apply the FFT to `data[0..n]` in place.
    pub fn run(&self, data: &mut [ComplexF32]) {
        debug_assert_eq!(data.len(), self.n);
        // Bit-reverse permutation. Swap `data[i]` with `data[revtab[i]]`
        // when `revtab[i] > i` so each pair gets swapped exactly once.
        for i in 0..self.n {
            let r = self.revtab[i] as usize;
            if r > i {
                data.swap(i, r);
            }
        }

        // Cooley-Tukey butterflies. Stage `s` has step size `m = 2^s` and
        // pulls twiddle factors from `twiddle[k * (n / m)]`.
        let mut m = 1usize;
        while m < self.n {
            let m2 = m << 1;
            let stride = self.n / m2;
            let mut k = 0;
            while k < self.n {
                for j in 0..m {
                    let w = self.twiddle[j * stride];
                    let t_re = w.re * data[k + j + m].re - w.im * data[k + j + m].im;
                    let t_im = w.re * data[k + j + m].im + w.im * data[k + j + m].re;
                    let u = data[k + j];
                    data[k + j] = ComplexF32::new(u.re + t_re, u.im + t_im);
                    data[k + j + m] = ComplexF32::new(u.re - t_re, u.im - t_im);
                }
                k += m2;
            }
            m = m2;
        }
        let _ = self.inverse; // affects twiddle sign already; flag kept for docs
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Round-trip: forward FFT then inverse FFT then divide by N should
    /// recover the input within float-rounding tolerance.
    #[test]
    fn fft_round_trip_recovers_input() {
        let n = 64usize;
        let fwd = Fft::new(6, false);
        let inv = Fft::new(6, true);
        let mut data: Vec<ComplexF32> = (0..n)
            .map(|i| ComplexF32::new((i as f32).sin(), (i as f32 * 0.5).cos()))
            .collect();
        let original = data.clone();

        fwd.run(&mut data);
        inv.run(&mut data);
        for v in data.iter_mut() {
            v.re /= n as f32;
            v.im /= n as f32;
        }
        for (i, (a, b)) in data.iter().zip(original.iter()).enumerate() {
            assert!(
                (a.re - b.re).abs() < 1e-4 && (a.im - b.im).abs() < 1e-4,
                "round-trip mismatch at {}: got ({}, {}), expected ({}, {})",
                i,
                a.re,
                a.im,
                b.re,
                b.im,
            );
        }
    }

    /// Forward FFT of a unit DC signal: x[n] = 1 → X[0] = N, X[k≠0] = 0.
    #[test]
    fn fft_dc_input() {
        let n = 32usize;
        let fwd = Fft::new(5, false);
        let mut data = vec![ComplexF32::new(1.0, 0.0); n];
        fwd.run(&mut data);
        assert!((data[0].re - n as f32).abs() < 1e-4);
        assert!(data[0].im.abs() < 1e-4);
        for (k, x) in data.iter().enumerate().skip(1).take(n - 1) {
            assert!(
                x.re.abs() < 1e-3 && x.im.abs() < 1e-3,
                "X[{k}] = ({}, {}) should be zero",
                x.re,
                x.im,
            );
        }
    }
}
