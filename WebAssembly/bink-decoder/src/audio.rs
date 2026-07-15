//! Bink audio decoder.
//!
//! Mirrors FFmpeg's `binkaudio.c`. Both variants are covered:
//!
//! * **`binkaudio_dct`** — DCT-based path. The decoder runs the parsed
//!   coefficients through an inverse DCT-III; one logical buffer per
//!   channel.
//! * **`binkaudio_rdft`** — RDFT-based path. The decoder treats the
//!   stream as one virtual mono channel running at the doubled sample
//!   rate; the FFT-based inverse-RDFT produces interleaved L/R samples
//!   directly. Used by older Bink files (`original.bik` in the corpus).
//!
//! Architecture:
//!
//! * Each audio packet starts with a 32-bit reported size (skipped) and
//!   then carries one or more *blocks*, packed at 32-bit alignment.
//! * Each block decodes per "internal channel" (= 1 for RDFT, =
//!   `channels` for DCT): two floats for the DC pair, per-band
//!   quantiser indices, then variable-width groups of coefficients.
//! * The frequency-domain coefficients go through the inverse transform
//!   (DCT-III / RDFT) to produce time-domain samples.
//! * Overlap-add with the previous block's tail forms the block's
//!   beginning, smoothing across block boundaries.
//! * Channel samples are converted to interleaved `i16` PCM.
//!
//! References:
//! * `libavcodec/binkaudio.c` (FFmpeg release/6.1).
//! * <http://wiki.multimedia.cx/index.php?title=Bink_Audio>

use crate::bitreader::BitReader;
use crate::container::{AudioFlags, AudioTrack};
use crate::dct3::Dct3;
use crate::error::{BikError, BikResult};
use crate::rdft::InverseRdft;

/// WMA critical frequency table (`ff_wma_critical_freqs`). Used to derive
/// per-block band boundaries.
const WMA_CRITICAL_FREQS: [u16; 25] = [
    100, 200, 300, 400, 510, 630, 770, 920, 1080, 1270, 1480, 1720, 2000, 2320, 2700, 3150, 3700,
    4400, 5300, 6400, 7700, 9500, 12000, 15500, 24500,
];

/// RLE expansion table for the coefficient-width run codes.
const RLE_LENGTH_TAB: [u8; 16] = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 32, 64];

const MAX_CHANNELS: usize = 2;

/// Bink audio decoder, covering both `binkaudio_dct` and `binkaudio_rdft`.
pub struct AudioDecoder {
    /// User-facing sample rate (e.g. 44100 for stereo @ 44.1kHz, even when
    /// the RDFT path internally treats it as 88200 mono).
    sample_rate: u32,
    /// User-facing channel count (1 or 2).
    channels: usize,
    /// `true` for `binkaudio_dct`, `false` for `binkaudio_rdft`.
    use_dct: bool,
    /// Number of "internal" channels processed per block — equals
    /// `channels` for DCT, always 1 for RDFT (where stereo is folded into
    /// the doubled frame length).
    internal_channels: usize,
    /// Block size in samples (after the boost for RDFT-stereo).
    frame_len: usize,
    /// `frame_len / 16` — overlap-add region length.
    overlap_len: usize,
    num_bands: usize,
    bands: [u32; 26],
    quant_table: [f32; 96],
    root: f32,
    previous: [Vec<f32>; MAX_CHANNELS],
    /// `false` means "this is not the first block, do overlap-add".
    first: bool,
    /// Per-channel coefficient scratch buffers (`frame_len + 2` long
    /// each). Reused across `decode_packet` calls so the audio hot path
    /// doesn't allocate. The trailing 2 floats are the Nyquist re/im
    /// that the inverse RDFT pre-pass writes (and that the DCT path
    /// simply ignores).
    coeffs_scratch: [Vec<f32>; MAX_CHANNELS],
    /// FFT-based DCT-III context. Populated when `use_dct == true`.
    /// Replaces the previous O(N²) slow DCT plus `frame_len² * 4`-byte
    /// cosine table.
    dct: Option<Dct3>,
    /// Inverse RDFT context. Only populated when `use_dct == false`.
    inverse_rdft: Option<InverseRdft>,
}

impl AudioDecoder {
    /// Build a decoder from one of the parsed audio tracks of a [`BikHeader`].
    pub fn new(track: &AudioTrack) -> BikResult<Self> {
        let channels = track.flags.channels() as usize;
        if channels == 0 || channels > MAX_CHANNELS {
            return Err(BikError::Unsupported(
                "Bink audio supports 1 or 2 channels only",
            ));
        }
        let use_dct = track.flags.contains(AudioFlags::USE_DCT);
        let user_sample_rate = track.sample_rate as u32;

        // FFmpeg's `decode_init`: pick `frame_len_bits` from the per-channel
        // sample rate first, then for the RDFT path multiply the rate by
        // `channels` and bump `frame_len_bits` by `log2(channels)`. Result:
        // RDFT-stereo's internal frame length is twice the DCT-stereo
        // value at the same nominal rate.
        let mut frame_len_bits: u32 = if user_sample_rate < 22050 {
            9
        } else if user_sample_rate < 44100 {
            10
        } else {
            11
        };
        let internal_channels;
        let internal_sample_rate;
        if use_dct {
            internal_channels = channels;
            internal_sample_rate = user_sample_rate;
        } else {
            // `version_b` (BIKb-style audio) skips this boost; we don't
            // currently observe BIKb audio in the corpus, so always boost.
            internal_channels = 1;
            internal_sample_rate =
                user_sample_rate
                    .checked_mul(channels as u32)
                    .ok_or(BikError::Unsupported(
                        "audio sample_rate * channels overflowed u32",
                    ))?;
            if channels > 1 {
                frame_len_bits += (channels as u32).ilog2();
            }
        }
        let frame_len = 1usize << frame_len_bits;
        let overlap_len = frame_len / 16;
        let sample_rate_half = internal_sample_rate.div_ceil(2);
        // FFmpeg picks two different `s->root` values:
        //   DCT  → `frame_len / (sqrt(frame_len) * 32768)` = `sqrt(N)/32768`
        //   RDFT → `2 / (sqrt(frame_len) * 32768)`
        let root = if use_dct {
            (frame_len as f32).sqrt() / 32768.0
        } else {
            2.0 / ((frame_len as f32).sqrt() * 32768.0)
        };

        // 96-entry quantizer log scale (constant from binkaudio.c).
        let mut quant_table = [0f32; 96];
        for (i, slot) in quant_table.iter_mut().enumerate() {
            *slot = (i as f32 * 0.152_891_65f32).exp() * root;
        }

        // Number of bands: count up until sample_rate_half ≤ critical freq.
        let mut num_bands = 1usize;
        while num_bands < 25 && sample_rate_half as u16 > WMA_CRITICAL_FREQS[num_bands - 1] {
            num_bands += 1;
        }

        // Band boundaries.
        let mut bands = [0u32; 26];
        bands[0] = 2;
        for i in 1..num_bands {
            let v = WMA_CRITICAL_FREQS[i - 1] as u64 * frame_len as u64
                / sample_rate_half.max(1) as u64;
            bands[i] = (v as u32) & !1u32;
        }
        bands[num_bands] = frame_len as u32;

        let dct = if use_dct {
            Some(Dct3::new(frame_len_bits))
        } else {
            None
        };
        let inverse_rdft = if use_dct {
            None
        } else {
            Some(InverseRdft::new(frame_len_bits))
        };

        Ok(Self {
            sample_rate: user_sample_rate,
            channels,
            use_dct,
            internal_channels,
            frame_len,
            overlap_len,
            num_bands,
            bands,
            quant_table,
            root,
            previous: [vec![0f32; overlap_len], vec![0f32; overlap_len]],
            first: true,
            coeffs_scratch: [vec![0f32; frame_len + 2], vec![0f32; frame_len + 2]],
            dct,
            inverse_rdft,
        })
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    pub fn channels(&self) -> usize {
        self.channels
    }

    /// Decode all blocks contained in a single audio packet (the bytes
    /// stored as the per-frame `audio_packet_len` payload). Returns
    /// interleaved 16-bit PCM samples — channel-interleaved when stereo.
    pub fn decode_packet(&mut self, packet: &[u8]) -> BikResult<Vec<i16>> {
        if packet.len() < 4 {
            return Ok(Vec::new());
        }
        // Move the scratch buffers out of `self` for the duration of the
        // call so the per-channel helpers (which take `&self`) can write
        // into them without aliasing the outer `&mut self` borrow. They
        // go back at the end via the unconditional `self.coeffs_scratch =
        // coeffs` line below — even on the `?` early-return path the
        // reference is restored, which keeps the steady-state allocation
        // count at zero.
        let mut coeffs = std::mem::take(&mut self.coeffs_scratch);
        let result = self.decode_packet_with_scratch(&mut coeffs, packet);
        self.coeffs_scratch = coeffs;
        result
    }

    #[allow(clippy::needless_range_loop)] // per-channel loops also touch
    // `self.previous[ch]` and pass `coeffs[ch]` into helpers that need
    // `&self`; rewriting them with iterators forces awkward borrow splits.
    fn decode_packet_with_scratch(
        &mut self,
        coeffs: &mut [Vec<f32>; MAX_CHANNELS],
        packet: &[u8],
    ) -> BikResult<Vec<i16>> {
        let mut r = BitReader::new(packet);
        // Skip the reported size (32-bit). FFmpeg ignores it.
        r.skip_bits(32);

        let mut out: Vec<i16> = Vec::with_capacity(self.frame_len);
        let total_bits = packet.len() * 8;

        while r.bit_pos() < total_bits {
            // 2-bit DCT mode prefix — emitted only for the DCT variant.
            if self.use_dct {
                r.skip_bits(2);
            }
            for ch in 0..self.internal_channels {
                self.parse_channel_coeffs(&mut r, &mut coeffs[ch])?;
            }
            for ch in 0..self.internal_channels {
                if self.use_dct {
                    self.dct.as_mut().expect("DCT context").run(&mut coeffs[ch]);
                } else {
                    self.inverse_rdft(&mut coeffs[ch]);
                }
            }

            // Overlap-add against `previous`, then refresh `previous`.
            for ch in 0..self.internal_channels {
                if !self.first {
                    let prev = &self.previous[ch];
                    let count = self.overlap_len * self.internal_channels;
                    let mut j = ch;
                    for i in 0..self.overlap_len {
                        let p = prev[i];
                        let c = coeffs[ch][i];
                        coeffs[ch][i] = (p * (count - j) as f32 + c * j as f32) / count as f32;
                        j += self.internal_channels;
                    }
                }
                self.previous[ch].copy_from_slice(
                    &coeffs[ch][self.frame_len - self.overlap_len..self.frame_len],
                );
            }

            // Emit `frame_len - overlap_len` samples per internal channel.
            // For DCT we interleave the two per-channel buffers; for RDFT
            // the single buffer is *already* interleaved L/R.
            let take = self.frame_len - self.overlap_len;
            if self.use_dct {
                for i in 0..take {
                    for ch in 0..self.internal_channels {
                        out.push(float_to_i16(coeffs[ch][i]));
                    }
                }
            } else {
                for i in 0..take {
                    out.push(float_to_i16(coeffs[0][i]));
                }
            }

            self.first = false;

            let pos = r.bit_pos();
            if pos & 31 != 0 {
                r.skip_bits(32 - (pos & 31));
            }
        }
        Ok(out)
    }

    /// Decode the frequency-domain coefficients for one (internal) channel.
    /// Mirrors the inner per-channel loop of `decode_block` in
    /// `binkaudio.c`.
    fn parse_channel_coeffs(&self, r: &mut BitReader<'_>, coeffs: &mut [f32]) -> BikResult<()> {
        // The first two coefficients are stored as IEEE-754 floats packed
        // 5+23+1 = 29 bits each.
        coeffs[0] = read_packed_float(r)? * self.root;
        coeffs[1] = read_packed_float(r)? * self.root;

        // num_bands × 8-bit quantizer indices.
        let mut quants = [0f32; 25];
        for q in &mut quants[..self.num_bands] {
            let v = r.read_bits(8)? as usize;
            *q = self.quant_table[v.min(95)];
        }

        let mut k = 0usize;
        let mut q = quants[0];
        let mut i = 2usize;
        while i < self.frame_len {
            let j = if r.read_bit()? != 0 {
                let v = r.read_bits(4)? as usize;
                i + RLE_LENGTH_TAB[v] as usize * 8
            } else {
                i + 8
            };
            let j = j.min(self.frame_len);

            let width = r.read_bits(4)?;
            if width == 0 {
                for slot in &mut coeffs[i..j] {
                    *slot = 0.0;
                }
                i = j;
                while (self.bands[k] as usize) < i {
                    q = quants[k];
                    k += 1;
                }
            } else {
                while i < j {
                    if self.bands[k] as usize == i {
                        q = quants[k];
                        k += 1;
                    }
                    let coeff = r.read_bits(width)? as i32;
                    if coeff != 0 {
                        let neg = r.read_bit()? != 0;
                        let mag = q * coeff as f32;
                        coeffs[i] = if neg { -mag } else { mag };
                    } else {
                        coeffs[i] = 0.0;
                    }
                    i += 1;
                }
            }
        }
        Ok(())
    }

    /// Inverse RDFT pre-process + transform. Mirrors the FFmpeg
    /// `binkaudio.c` RDFT branch: negate odd-imag coefficients, move
    /// `coeffs[1]` (Nyquist real) to `coeffs[frame_len]`, zero `coeffs[1]`
    /// and `coeffs[frame_len + 1]`, then run the inverse RDFT.
    fn inverse_rdft(&mut self, coeffs: &mut [f32]) {
        let n = self.frame_len;
        let mut i = 2;
        while i < n {
            coeffs[i + 1] = -coeffs[i + 1];
            i += 2;
        }
        coeffs[n] = coeffs[1];
        coeffs[1] = 0.0;
        coeffs[n + 1] = 0.0;
        // Slow path: there's a `Some(...)` here when `use_dct == false`.
        let rdft = self.inverse_rdft.as_mut().expect("RDFT context");
        rdft.run(coeffs);
    }
}

/// Read one of Bink audio's "packed float" values: 5-bit power, 23-bit
/// mantissa, 1-bit sign.
fn read_packed_float(r: &mut BitReader<'_>) -> BikResult<f32> {
    let power = r.read_bits(5)? as i32 - 23;
    let mantissa = r.read_bits(23)? as f32;
    let sign = r.read_bit()? != 0;
    let v = mantissa * (2f32).powi(power);
    Ok(if sign { -v } else { v })
}

/// Convert a float audio sample to a rounded i16 with saturation.
fn float_to_i16(v: f32) -> i16 {
    let scaled = (v * 32768.0).round();
    if scaled >= 32767.0 {
        32767
    } else if scaled <= -32768.0 {
        -32768
    } else {
        scaled as i16
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::container::AudioFlags;

    fn dct_track(rate: u16, stereo: bool) -> AudioTrack {
        let mut flags = AudioFlags::USE_DCT | AudioFlags::BITS_16;
        if stereo {
            flags |= AudioFlags::STEREO;
        }
        AudioTrack {
            sample_rate: rate,
            flags,
        }
    }

    fn rdft_track(rate: u16, stereo: bool) -> AudioTrack {
        let mut flags = AudioFlags::BITS_16;
        if stereo {
            flags |= AudioFlags::STEREO;
        }
        AudioTrack {
            sample_rate: rate,
            flags,
        }
    }

    #[test]
    fn frame_len_bits_picks_by_sample_rate() {
        let d = AudioDecoder::new(&dct_track(11025, true)).unwrap();
        assert_eq!(d.frame_len, 1 << 9);
        let d = AudioDecoder::new(&dct_track(22050, true)).unwrap();
        assert_eq!(d.frame_len, 1 << 10);
        let d = AudioDecoder::new(&dct_track(44100, true)).unwrap();
        assert_eq!(d.frame_len, 1 << 11);
        let d = AudioDecoder::new(&dct_track(48000, true)).unwrap();
        assert_eq!(d.frame_len, 1 << 11);
    }

    #[test]
    fn rdft_track_doubles_frame_len_for_stereo() {
        // 44.1 kHz stereo via RDFT internally uses frame_len_bits = 12 (the
        // base 11 plus log2(2)).
        let d = AudioDecoder::new(&rdft_track(44100, true)).unwrap();
        assert!(!d.use_dct);
        assert_eq!(d.internal_channels, 1);
        assert_eq!(d.frame_len, 1 << 12);
        // Mono RDFT: no boost — frame_len_bits stays at 11 for 44.1k.
        let d = AudioDecoder::new(&rdft_track(44100, false)).unwrap();
        assert!(!d.use_dct);
        assert_eq!(d.frame_len, 1 << 11);
    }

    #[test]
    fn band_boundaries_22050_stereo() {
        let d = AudioDecoder::new(&dct_track(22050, true)).unwrap();
        assert_eq!(d.bands[0], 2);
        assert_eq!(d.bands[d.num_bands], 1024);
        assert!(d.num_bands >= 5 && d.num_bands <= 25);
    }

    #[test]
    fn float_to_i16_saturates() {
        assert_eq!(float_to_i16(0.5), 16384);
        assert_eq!(float_to_i16(-0.5), -16384);
        assert_eq!(float_to_i16(1.0), 32767);
        assert_eq!(float_to_i16(-1.5), -32768);
        assert_eq!(float_to_i16(0.0), 0);
    }
}
