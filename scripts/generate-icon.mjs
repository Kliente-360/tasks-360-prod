// Gera apple-touch-icon.png (180x180) e favicon.png (32x32) com a marca k360
// (4 pontos brancos em diamante sobre fundo verde da marca).
// Roda com: node assets/generate-icon.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x00, 0x99, 0x00, 0xff];   // --brand
const FG = [0xff, 0xff, 0xff, 0xff];   // dots

function render(size, dotRadius, distance) {
  const W = size, H = size;
  const cx = W / 2, cy = H / 2;
  const dots = [
    [cx, cy - distance],
    [cx - distance, cy],
    [cx + distance, cy],
    [cx, cy + distance],
  ];
  const stride = 1 + W * 4;
  const data = Buffer.alloc(stride * H);
  for (let y = 0; y < H; y++) {
    data[y * stride] = 0; // filter: None
    for (let x = 0; x < W; x++) {
      let r = BG[0], g = BG[1], b = BG[2];
      let bestA = 0;
      for (const [dcx, dcy] of dots) {
        const dx = x + 0.5 - dcx, dy = y + 0.5 - dcy;
        const d = Math.sqrt(dx * dx + dy * dy);
        const a = Math.max(0, Math.min(1, dotRadius - d + 0.5));
        if (a > bestA) bestA = a;
      }
      if (bestA > 0) {
        r = Math.round(BG[0] * (1 - bestA) + FG[0] * bestA);
        g = Math.round(BG[1] * (1 - bestA) + FG[1] * bestA);
        b = Math.round(BG[2] * (1 - bestA) + FG[2] * bestA);
      }
      const o = y * stride + 1 + x * 4;
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 0xff;
    }
  }
  const idat = deflateSync(data, { level: 9 });

  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = (table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
    return (crc ^ 0xffffffff) >>> 0;
  }
  function chunk(type, payload) {
    const len = Buffer.alloc(4); len.writeUInt32BE(payload.length);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, payload])));
    return Buffer.concat([len, t, payload, crc]);
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(new URL('./apple-touch-icon.png', import.meta.url), render(180, 20, 42));
writeFileSync(new URL('./favicon-32.png',       import.meta.url), render(32,  4,  8));
writeFileSync(new URL('./icon-512.png',         import.meta.url), render(512, 57, 119));
console.log('icons gerados em assets/');
