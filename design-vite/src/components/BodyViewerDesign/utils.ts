export function formatHexDump(bytes: Uint8Array, bytesPerLine = 16): string {
  return Array.from({ length: Math.ceil(bytes.length / bytesPerLine) }, (_, index) => {
    const offset = index * bytesPerLine;
    const chunk = bytes.subarray(offset, offset + bytesPerLine);
    const hex = Array.from(chunk, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
    const text = Array.from(chunk, (byte) => byte >= 32 && byte < 127 ? String.fromCharCode(byte) : '.').join('');
    return `${offset.toString(16).padStart(8, '0')}  ${hex.padEnd(bytesPerLine * 3 - 1)}  ${text}`;
  }).join('\n');
}