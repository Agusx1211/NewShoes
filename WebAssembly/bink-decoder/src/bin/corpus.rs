//! Fixture-free compatibility verifier for user-owned classic-Bink files.
//! It decodes every frame and emits stable FNV-1a checksums without adding a
//! hashing dependency to the shipping decoder.

use std::fs::{self, File};
use std::io::BufReader;
use std::path::{Path, PathBuf};

use cnc_bink_decoder::{BikPixels, BikStreamingDecoder};

fn fnv(bytes: impl IntoIterator<Item = u8>, mut hash: u64) -> u64 {
    for byte in bytes {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(1_099_511_628_211);
    }
    hash
}

fn paths(root: &Path) -> Result<Vec<PathBuf>, Box<dyn std::error::Error>> {
    let mut paths = fs::read_dir(root)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("bik"))
        })
        .collect::<Vec<_>>();
    paths.sort();
    Ok(paths)
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = std::env::args_os()
        .nth(1)
        .ok_or("usage: corpus <movie-directory>")?;
    let paths = paths(Path::new(&root))?;
    if paths.is_empty() {
        return Err("movie directory contains no .bik files".into());
    }
    let mut total_frames = 0u64;
    for path in &paths {
        let file = File::open(path)?;
        let file_bytes = file.metadata()?.len();
        let mut decoder =
            BikStreamingDecoder::new(BufReader::new(file), path.display().to_string())?;
        let width = decoder.width() as usize;
        let height = decoder.height() as usize;
        let expected_frames = decoder.frame_count();
        let mut frames = 0u32;
        let mut audio_samples = 0u64;
        let mut video_hash = 14_695_981_039_346_656_037u64;
        let mut audio_hash = 14_695_981_039_346_656_037u64;
        while let Some(frame) = decoder.next_frame()? {
            let BikPixels::Yuv(yuv) = frame.video.pixels else {
                return Err("corpus decoder returned non-YUV output".into());
            };
            for row in 0..height {
                video_hash = fnv(
                    yuv.y.data[row * yuv.y.stride..row * yuv.y.stride + width]
                        .iter()
                        .copied(),
                    video_hash,
                );
            }
            for plane in [&yuv.u, &yuv.v] {
                for row in 0..height.div_ceil(2) {
                    video_hash = fnv(
                        plane.data[row * plane.stride..row * plane.stride + width.div_ceil(2)]
                            .iter()
                            .copied(),
                        video_hash,
                    );
                }
            }
            for chunk in frame.audio {
                audio_samples += chunk.samples.len() as u64;
                audio_hash = fnv(
                    chunk.samples.into_iter().flat_map(i16::to_le_bytes),
                    audio_hash,
                );
            }
            frames += 1;
        }
        if frames != expected_frames {
            return Err(format!(
                "{} decoded {frames}/{expected_frames} frames",
                path.display()
            )
            .into());
        }
        total_frames += u64::from(frames);
        println!(
            "{{\"name\":\"{}\",\"bytes\":{file_bytes},\"frames\":{frames},\"width\":{width},\"height\":{height},\"videoFnv64\":\"{video_hash:016x}\",\"audioSamples\":{audio_samples},\"audioFnv64\":\"{audio_hash:016x}\"}}",
            path.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("unknown")
        );
    }
    eprintln!("decoded {} movies and {total_frames} frames", paths.len());
    Ok(())
}
