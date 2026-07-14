use std::fmt;

/// Errors that can occur while decoding a Bink stream.
#[derive(Debug)]
pub enum BikError {
    Io(std::io::Error),

    BadSignature([u8; 4]),

    InvalidHeader {
        field: &'static str,
        value: u64,
        limit: u64,
    },

    InvalidFrameIndex {
        index: usize,
        cur: u32,
        next: u32,
    },

    Unsupported(&'static str),

    Truncated {
        pos: usize,
        needed: usize,
    },

    Malformed(&'static str),
}

impl fmt::Display for BikError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(f, "I/O error: {error}"),
            Self::BadSignature(signature) => write!(f, "not a Bink Video v1 file: {signature:?}"),
            Self::InvalidHeader {
                field,
                value,
                limit,
            } => {
                write!(f, "rejected header: {field} = {value} (limit: {limit})")
            }
            Self::InvalidFrameIndex { index, cur, next } => {
                write!(
                    f,
                    "invalid frame index {index}: next {next} <= current {cur}"
                )
            }
            Self::Unsupported(reason) => write!(f, "unsupported codec variant: {reason}"),
            Self::Truncated { pos, needed } => {
                write!(
                    f,
                    "bitstream truncated at byte {pos} (needs {needed} more bytes)"
                )
            }
            Self::Malformed(reason) => write!(f, "malformed bitstream: {reason}"),
        }
    }
}

impl std::error::Error for BikError {}

impl From<std::io::Error> for BikError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

pub type BikResult<T> = std::result::Result<T, BikError>;

impl From<BikError> for std::io::Error {
    fn from(val: BikError) -> Self {
        match val {
            BikError::Io(e) => e,
            _ => std::io::Error::other(val),
        }
    }
}
