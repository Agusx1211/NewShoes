//! Variable-length-code (Huffman) decoder, sized for the 16 prebuilt Bink
//! trees from `binkdata.h`.
//!
//! Bink's Huffman trees encode 16 symbols with code lengths up to 7 bits, so
//! a single 128-entry direct-lookup table per tree is enough for an O(1)
//! symbol read. This mirrors FFmpeg's `get_vlc2(.., max_depth=1)` fast path —
//! we don't need the multi-step lookup that FFmpeg uses for codecs with
//! deeper trees.
//!
//! The codes in `bink_tree_bits` are stored in their natural binary form
//! (LSB-first to match the LE bitstream). For symbol *s* with *L*-bit code
//! *c*, we write `(s, L)` into every table slot whose low *L* bits equal *c*
//! — that is, slots `c | (h << L)` for `h ∈ [0, 2^(maxbits - L))`. A peek of
//! `maxbits` bits then yields the symbol and its true length in one read.

use crate::bitreader::BitReader;
use crate::error::BikResult;

/// One Bink Huffman tree as a direct-lookup table.
#[derive(Debug, Clone)]
pub struct Vlc {
    /// `(symbol, code_length)` per `peek_bits(self.bits)` index.
    table: Vec<(u8, u8)>,
    /// Number of bits to peek per lookup (= longest code in this tree).
    pub bits: u8,
}

impl Vlc {
    /// Build a VLC table from 16 (code, length) pairs. `codes[s]` is the
    /// LSB-aligned binary code for symbol *s* and `lens[s]` its length in
    /// bits. Panics in debug mode on malformed input — these tables are
    /// hard-coded constants so any error is a porting bug, not runtime data.
    pub fn build(codes: &[u8; 16], lens: &[u8; 16]) -> Self {
        let maxbits = *lens.iter().max().unwrap_or(&0);
        debug_assert!(maxbits > 0 && maxbits <= 8, "Bink trees max 7 bits");
        let size = 1usize << maxbits;
        let mut table = vec![(0u8, 0u8); size];
        for sym in 0..16u8 {
            let l = lens[sym as usize];
            debug_assert!(l > 0 && l <= maxbits, "zero-length or out-of-range code");
            let c = codes[sym as usize] as u32;
            let pad_count = 1usize << (maxbits - l);
            for high in 0..pad_count {
                let idx = (c | ((high as u32) << l)) as usize;
                debug_assert!(table[idx].1 == 0, "code prefix collision in Bink tree");
                table[idx] = (sym, l);
            }
        }
        // Sanity: every slot must be populated (the trees are complete).
        debug_assert!(
            table.iter().all(|&(_, l)| l > 0),
            "Bink VLC table is not complete after build"
        );
        Self {
            table,
            bits: maxbits,
        }
    }

    /// Read one symbol from `r` using this tree.
    #[inline]
    pub fn get(&self, r: &mut BitReader<'_>) -> BikResult<u8> {
        let idx = r.peek_bits(self.bits as u32)? as usize;
        let (sym, len) = self.table[idx];
        r.skip_bits(len as usize);
        Ok(sym)
    }
}

/// The 16 Bink trees, lazily initialised on first use. Read-only and shared
/// across decoder instances (FFmpeg does the same via `ff_thread_once`).
pub fn bink_trees() -> &'static [Vlc; 16] {
    use std::sync::OnceLock;
    static TREES: OnceLock<[Vlc; 16]> = OnceLock::new();
    TREES.get_or_init(|| {
        std::array::from_fn(|i| {
            Vlc::build(
                &crate::tables::BINK_TREE_BITS[i],
                &crate::tables::BINK_TREE_LENS[i],
            )
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tree0_is_identity_4bit() {
        // tree 0: lens [4]*16, bits [0..15] -> reading 4 bits returns the same value.
        let v = &bink_trees()[0];
        assert_eq!(v.bits, 4);
        // Encode each symbol explicitly and decode it back.
        for s in 0..16u8 {
            // 4-bit LE: byte = s in low nibble; high nibble can be anything.
            let buf = [s; 1];
            let mut r = BitReader::new(&buf);
            assert_eq!(v.get(&mut r).unwrap(), s);
        }
    }

    #[test]
    fn tree1_zero_bit_decodes_to_sym0() {
        // tree 1: lens[0]=1, bits[0]=0. So a leading zero bit -> sym 0.
        let v = &bink_trees()[1];
        // bit 0 = 0, rest fluff. 0x00 has bit 0 = 0.
        let buf = [0x00u8];
        let mut r = BitReader::new(&buf);
        assert_eq!(v.get(&mut r).unwrap(), 0);
        assert_eq!(r.bit_pos(), 1);
    }

    #[test]
    fn tree1_one_bit_then_3_zero_decodes_to_sym1() {
        // tree 1: lens[1]=4, bits[1]=0x01. So bits "1,0,0,0" -> sym 1 (4 bits).
        let v = &bink_trees()[1];
        // bit 0 = 1, bits 1..3 = 0. Byte 0b00000001 = 0x01.
        let buf = [0x01u8];
        let mut r = BitReader::new(&buf);
        assert_eq!(v.get(&mut r).unwrap(), 1);
        assert_eq!(r.bit_pos(), 4);
    }
}
