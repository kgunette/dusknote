// Generates the app icons: near-black square, three ragged "dusk bands" in the
// dim olive accent, fading downward.
// The bands read as a dusk horizon settling into night AND as stacked log
// entries powering down; the ragged lengths + opacity fade keep it from reading
// as a hamburger menu. Chosen variant: C-soft (opacities 1 / 0.72 / 0.46).
// Dependency-free: rasterizes the geometry and writes PNGs by hand.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BG = [0x12, 0x15, 0x1d];
const FG = [0x8e, 0x9a, 0x73];

let crcTable;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function png(size, rgb) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  const stride = 1 + size * 3;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    rgb.copy(raw, y * stride + 1, y * size * 3, (y + 1) * size * 3);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Three horizontal bands (round caps), all coordinates normalized 0..1.
// x1 fixed at the left; x2 shrinks and opacity fades on each lower band, so the
// mark powers down and reads as ragged entries rather than an even menu.
// Drawn in a 100-unit viewBox: y = 32/50/68, x1 = 22,
// x2 = 78/66/54, stroke-width 5 (cap radius 2.5).
const HALF = 0.025;
const BANDS = [
  { y: 0.32, x1: 0.22, x2: 0.78, op: 1.0 },
  { y: 0.5, x1: 0.22, x2: 0.66, op: 0.72 },
  { y: 0.68, x1: 0.22, x2: 0.54, op: 0.46 },
];

// The olive coverage (0..1) at a normalized point: nearest band's opacity if the
// point falls within its rounded capsule, else 0. Bands never overlap in y.
function bandAt(px, py) {
  for (const b of BANDS) {
    const cx = Math.min(Math.max(px, b.x1), b.x2);
    if (Math.hypot(px - cx, py - b.y) <= HALF) return b.op;
  }
  return 0;
}

function render(size) {
  const rgb = Buffer.alloc(size * size * 3);
  const S = 4; // supersample for anti-aliasing
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          acc += bandAt((x + (sx + 0.5) / S) / size, (y + (sy + 0.5) / S) / size);
        }
      }
      const a = acc / (S * S); // coverage × opacity, already blended
      const i = (y * size + x) * 3;
      for (let ch = 0; ch < 3; ch++) rgb[i + ch] = Math.round(BG[ch] + (FG[ch] - BG[ch]) * a);
    }
  }
  return png(size, rgb);
}

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'icon-512.png'), render(512));
writeFileSync(join(out, 'icon-192.png'), render(192));
writeFileSync(join(out, 'apple-touch-icon.png'), render(180));
console.log('icons written to', out);
