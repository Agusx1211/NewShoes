# infinitier_bik_decoder

Pure-Rust decoder for **Bink Video v1** (`BIKi`), the format the IWD2 cutscenes
ship under (despite their `.mve` extension).

The implementation is a port of FFmpeg's `libavcodec/bink.c` and
`binkaudio.c` (release/6.1 snapshot).

Supported variants in scope:

| Codec | What it covers |
|---|---|
| `binkvideo` (BIKi/BIKf/BIKg/BIKh/BIKk) | Bink Video v1 with YUV420p output, optional alpha |
| `binkvideo` (BIKb) | BinkB |
| `binkaudio_dct` | DCT-based Bink audio |
| `binkaudio_rdft` | RDFT-based Bink audio |

`binkvideo2` (KB2) is out of scope.

## Usage

The crate exposes two layers:

* **High-level streaming**: [`BikStreamingDecoder`] — pull one
  [`BikFrame`] (video + audio chunks) at a time, with the pixel format
  configurable to either YUV420p planes (default — codec-native, zero
  conversion cost) or RGBA8 (one BT.601 conversion per frame).
* **Low-level building blocks**: [`parse_header`], [`VideoDecoder`],
  [`AudioDecoder`] — drop down to these when you need raw control over
  packet reading or want to drive the codec from a non-`Read+Seek`
  source.

### Streaming, YUV (default)

The codec's native output. Each frame carries the Y, U and V planes
plus an optional alpha plane; chroma is 4:2:0 (half resolution in both
axes).

```rust,no_run
use std::fs::File;
use infinitier_bik_decoder::{BikPixels, BikStreamingDecoder};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let f = File::open("intro.bik")?;
    let mut decoder = BikStreamingDecoder::new(f, "intro.bik")?;

    println!(
        "{}x{} @ {:.2} fps, {} frames",
        decoder.width(),
        decoder.height(),
        1_000_000.0 / decoder.frame_duration_us() as f64,
        decoder.frame_count(),
    );

    while let Some(frame) = decoder.next_frame()? {
        if let BikPixels::Yuv(planes) = &frame.video.pixels {
            // `planes.y / planes.u / planes.v` are 4:2:0 `Plane`s; each
            // exposes `data: Vec<u8>`, a `stride` (≥ width) and its
            // logical `width / height`. Hand them to a GPU shader, or
            // upsample on the CPU as you see fit.
            let _y_plane: &[u8] = &planes.y.data;
        }
        for chunk in &frame.audio {
            // chunk.samples — interleaved s16 PCM at chunk.sample_rate.
            let _ = chunk;
        }
    }
    Ok(())
}
```

### Streaming, RGBA8

Same loop, but the decoder converts each frame to tightly-packed RGBA8
(`width * height * 4` bytes) using BT.601 with nearest-neighbour chroma
upsample. Use this when feeding directly into an egui texture, an
image dump, or any consumer that doesn't want to handle YUV.

```rust,no_run
use std::fs::File;
use infinitier_bik_decoder::{BikOutputFormat, BikPixels, BikStreamingDecoder};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let f = File::open("intro.bik")?;
    let mut decoder = BikStreamingDecoder::new(f, "intro.bik")?
        .with_output_format(BikOutputFormat::Rgba);

    while let Some(frame) = decoder.next_frame()? {
        if let BikPixels::Rgba(pixels) = &frame.video.pixels {
            // `pixels` has `width * height * 4` bytes, row-major.
            let _: &[u8] = pixels;
        }
    }
    Ok(())
}
```

### Low-level: parse the header and drive the codecs yourself

When the streaming wrapper isn't a fit (custom packet sources,
non-sequential decoding, instrumentation, …) skip it and use the
demuxer + codec primitives directly. The packet layout is: a `u32`
audio length, that many bytes of audio bitstream, then the video
bytes through the end of the packet. Files without audio skip the
prefix.

```rust,no_run
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};

use infinitier_bik_decoder::{AudioDecoder, VideoDecoder, parse_header};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut f = File::open("intro.bik")?;
    let header = parse_header(&mut f)?;

    let mut video = VideoDecoder::new(&header)?;
    let mut audio = header
        .audio_tracks
        .first()
        .map(AudioDecoder::new)
        .transpose()?;
    let has_audio = audio.is_some();

    let mut packet = Vec::with_capacity(header.max_frame_size as usize);
    for fr in &header.frames {
        packet.resize(fr.size as usize, 0);
        f.seek(SeekFrom::Start(fr.pos as u64))?;
        f.read_exact(&mut packet)?;

        let video_bytes = if has_audio {
            let aud_len = u32::from_le_bytes(
                [packet[0], packet[1], packet[2], packet[3]]
            ) as usize;
            let pcm: Vec<i16> =
                audio.as_mut().unwrap().decode_packet(&packet[4..4 + aud_len])?;
            let _ = pcm;
            &packet[4 + aud_len..]
        } else {
            &packet[..]
        };

        let frame = video.decode_frame(video_bytes)?;
        let _y_plane: &[u8] = &frame.y.data;
    }
    Ok(())
}
```

### Extract the audio track to a WAV file

```rust,no_run
use infinitier_bik_decoder::extract_audio_to_wav;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    extract_audio_to_wav("intro.bik", "intro_audio.wav")?;
    Ok(())
}
```

If the input has no audio track the destination is still created — as
an empty stereo / 22050 Hz PCM-WAV — so the path always exists after
the call returns.
