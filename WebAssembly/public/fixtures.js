export function createRefPackLiteralSample() {
  return Uint8Array.from([
    0x10, 0xfb, 0x00, 0x00, 0x03, 0xff, 0x41, 0x42, 0x43,
  ]);
}

function writeBe32(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function writeLe32(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function asciiBytes(text) {
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

export function createBigArchiveSample() {
  const files = [
    {
      name: "Data\\INI\\GameData.ini",
      bytes: asciiBytes("GameData = Yes\n"),
    },
    {
      name: "Data\\Generals.str",
      bytes: asciiBytes("CONTROL:OK\n"),
    },
  ];
  const directorySize = files.reduce((size, file) => size + 8 + file.name.length + 1, 16);
  let dataOffset = directorySize;

  for (const file of files) {
    file.offset = dataOffset;
    dataOffset += file.bytes.length;
  }

  const archive = new Uint8Array(dataOffset);
  archive.set(asciiBytes("BIGF"), 0);
  writeLe32(archive, 4, archive.length);
  writeBe32(archive, 8, files.length);

  let cursor = 16;
  for (const file of files) {
    writeBe32(archive, cursor, file.offset);
    writeBe32(archive, cursor + 4, file.bytes.length);
    cursor += 8;
    archive.set(asciiBytes(file.name), cursor);
    cursor += file.name.length;
    archive[cursor++] = 0;
  }

  for (const file of files) {
    archive.set(file.bytes, file.offset);
  }

  return {
    archive,
    files: files.map((file) => ({
      name: file.name.replaceAll("\\", "/").toLowerCase(),
      offset: file.offset,
      size: file.bytes.length,
      text: new TextDecoder().decode(file.bytes),
    })),
  };
}
