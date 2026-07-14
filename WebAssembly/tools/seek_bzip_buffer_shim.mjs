export class Buffer extends Uint8Array {
  copy(target, targetStart = 0, sourceStart = 0, sourceEnd = this.length) {
    target.set(this.subarray(sourceStart, sourceEnd), targetStart);
    return Math.min(sourceEnd - sourceStart, target.length - targetStart);
  }

  toString(encoding) {
    if (encoding === "hex") {
      return Array.from(this, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    return new TextDecoder().decode(this);
  }
}
