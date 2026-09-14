// Small dependency-free ZIP writer (stored entries, UTF-8 names, CRC-32).
// Files are deliberately uncompressed so exports need no external library.
const table = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function header(size) {
  const data = new Uint8Array(size), view = new DataView(data.buffer);
  return { data, u16: (offset, n) => view.setUint16(offset, n, true), u32: (offset, n) => view.setUint32(offset, n, true) };
}
export function createZip(files) {
  const encoder = new TextEncoder(), parts = [], directory = [];
  let offset = 0, directorySize = 0;
  for (const [filename, content] of Object.entries(files)) {
    const name = encoder.encode(filename), bytes = encoder.encode(content), crc = crc32(bytes);
    const local = header(30);
    local.u32(0, 0x04034b50); local.u16(4, 20); local.u16(6, 0x800);
    local.u16(12, 33); local.u32(14, crc); local.u32(18, bytes.length); local.u32(22, bytes.length); local.u16(26, name.length);
    parts.push(local.data, name, bytes);
    const central = header(46);
    central.u32(0, 0x02014b50); central.u16(4, 20); central.u16(6, 20); central.u16(8, 0x800);
    central.u16(14, 33); central.u32(16, crc); central.u32(20, bytes.length); central.u32(24, bytes.length); central.u16(28, name.length); central.u32(42, offset);
    directory.push(central.data, name);
    directorySize += 46 + name.length;
    offset += 30 + name.length + bytes.length;
  }
  const end = header(22);
  end.u32(0, 0x06054b50); end.u16(8, directory.length / 2); end.u16(10, directory.length / 2); end.u32(12, directorySize); end.u32(16, offset);
  return new Blob([...parts, ...directory, end.data], { type: 'application/zip' });
}
