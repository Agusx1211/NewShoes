//! Little-endian bitstream reader for the Bink video / audio bitstreams.
//!
//! Mirrors FFmpeg's `BITSTREAM_READER_LE` semantics in `get_bits.h`: bits are
//! consumed lowest-bit-first inside each byte. The reader keeps a position
//! in *bits* and pulls a fresh aligned word from the underlying buffer on
//! each access; this is the simplest implementation and is plenty fast at
//! the scale of one Bink frame.
//!
//! API limits chosen to match how Bink uses them — `read_bits(n)` accepts
//! `n ≤ 25` (FFmpeg's `get_bits` limit), and `read_bits_long(n)` chains two
//! reads for up to 32 bits. `peek_bits(n)` does not consume.

use crate::error::BikResult;

/// LE bitstream reader over a borrowed byte buffer.
pub struct BitReader<'a> {
    data: &'a [u8],
    /// Current read position in **bits** from the start of `data`.
    pos: usize,
}

impl<'a> BitReader<'a> {
    pub fn new(data: &'a [u8]) -> Self {
        Self { data, pos: 0 }
    }

    /// Current bit offset.
    pub fn bit_pos(&self) -> usize {
        self.pos
    }

    /// Total bits in the buffer.
    pub fn bit_len(&self) -> usize {
        self.data.len() * 8
    }

    /// Bits remaining; can be negative if a previous read overshot, in which
    /// case the next read should fail. Returns `isize` for that reason.
    pub fn bits_left(&self) -> isize {
        self.bit_len() as isize - self.pos as isize
    }

    /// Reads up to **25 bits**. The 25-bit cap matches FFmpeg's `get_bits`
    /// fast path; for wider values use `read_bits_long`.
    #[inline]
    pub fn read_bits(&mut self, n: u32) -> BikResult<u32> {
        debug_assert!(n <= 25, "read_bits caller must split if n > 25");
        if n == 0 {
            return Ok(0);
        }
        let v = self.peek_bits(n)?;
        self.pos += n as usize;
        Ok(v)
    }

    /// Peek the next `n` bits without consuming. Reads past the end of the
    /// buffer silently zero-extend — matching FFmpeg's default `get_bits`
    /// behavior (`BITSTREAM_READER_LE` with no end-checks). Bink streams
    /// occasionally encode the last block with a tail that overruns the
    /// buffer by a few bits; FFmpeg ignores that and so do we. Use
    /// [`bits_left`] for explicit end-of-stream checks.
    #[inline]
    pub fn peek_bits(&mut self, n: u32) -> BikResult<u32> {
        debug_assert!(n <= 25);
        let byte_pos = self.pos >> 3;
        let bit_off = (self.pos & 7) as u32;
        let mut buf = [0u8; 8];
        if byte_pos < self.data.len() {
            let take = (self.data.len() - byte_pos).min(8);
            buf[..take].copy_from_slice(&self.data[byte_pos..byte_pos + take]);
        }
        let word = u64::from_le_bytes(buf);
        let mask = if n == 32 {
            u32::MAX as u64
        } else {
            (1u64 << n) - 1
        };
        let v = ((word >> bit_off) & mask) as u32;
        Ok(v)
    }

    /// Reads a single bit.
    #[inline]
    pub fn read_bit(&mut self) -> BikResult<u32> {
        self.read_bits(1)
    }

    /// Reads up to **32 bits**. Splits internally if `n > 25`.
    pub fn read_bits_long(&mut self, n: u32) -> BikResult<u32> {
        debug_assert!(n <= 32);
        if n == 0 {
            return Ok(0);
        }
        if n <= 25 {
            self.read_bits(n)
        } else {
            let lo = self.read_bits(16)?;
            let hi = self.read_bits(n - 16)?;
            Ok(lo | (hi << 16))
        }
    }

    /// Skip `n` bits unconditionally; will succeed even if it walks past EOS,
    /// matching FFmpeg's `skip_bits_long`. Subsequent reads then fail.
    pub fn skip_bits(&mut self, n: usize) {
        self.pos += n;
    }

    /// Align the read position to the next 32-bit boundary. Used between
    /// Bink "bundles" — see FFmpeg's `align_get_bits` in plane decoding.
    pub fn align32(&mut self) {
        self.pos = (self.pos + 31) & !31;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lsb_first_simple() {
        // bytes 0b1100_1010, 0b0000_0001 -> bits 0,1,0,1,0,0,1,1, 1,0,...
        let buf = [0xCAu8, 0x01];
        let mut r = BitReader::new(&buf);
        assert_eq!(r.read_bits(4).unwrap(), 0b1010);
        assert_eq!(r.read_bits(4).unwrap(), 0b1100);
        assert_eq!(r.read_bits(1).unwrap(), 1);
        assert_eq!(r.read_bits(7).unwrap(), 0);
    }

    #[test]
    fn read_long_32_bits() {
        let buf = [0x78u8, 0x56, 0x34, 0x12];
        let mut r = BitReader::new(&buf);
        assert_eq!(r.read_bits_long(32).unwrap(), 0x12345678);
    }

    #[test]
    fn align32_jumps_to_word_boundary() {
        let buf = [0x00u8; 16];
        let mut r = BitReader::new(&buf);
        r.skip_bits(3);
        r.align32();
        assert_eq!(r.bit_pos(), 32);
        r.skip_bits(33);
        r.align32();
        assert_eq!(r.bit_pos(), 96);
    }

    #[test]
    fn past_eos_zero_extends() {
        // Match FFmpeg's `get_bits` semantics: reading past the end of the
        // buffer returns zeros, no error. Callers that care about EOS must
        // check `bits_left` explicitly (Bink does this around DCT coeff
        // reads and the like).
        let buf = [0xFFu8];
        let mut r = BitReader::new(&buf);
        assert_eq!(r.read_bits(8).unwrap(), 0xFF);
        assert_eq!(r.read_bits(1).unwrap(), 0);
        assert_eq!(r.read_bits(7).unwrap(), 0);
    }
}
