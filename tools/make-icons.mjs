// App icons, generated rather than sourced.
//
// There is no image library in this project and no binary assets in the repo,
// so this writes PNGs directly: zlib is in Node's standard library and a PNG is
// just four chunks with CRCs. Regenerating is `npm run icons`.

import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;      // bit depth
  ihdr[9] = 6;      // truecolour with alpha
  // Each scanline is prefixed with a filter byte; 0 means "none".
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Tiny raster canvas: enough to draw a truck on a hill. */
function canvas(size) {
  const buf = Buffer.alloc(size * size * 4);
  const put = (x, y, [r, g, b, a = 255]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    if (a === 255) { buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255; return; }
    const k = a / 255, inv = 1 - k;
    buf[i] = r * k + buf[i] * inv;
    buf[i + 1] = g * k + buf[i + 1] * inv;
    buf[i + 2] = b * k + buf[i + 2] * inv;
    buf[i + 3] = Math.max(buf[i + 3], a);
  };
  return {
    buf, put,
    rect(x, y, w, h, c, r = 0) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        if (r) {
          const dx = Math.min(i, w - 1 - i), dy = Math.min(j, h - 1 - j);
          if (dx < r && dy < r && (r - dx) ** 2 + (r - dy) ** 2 > r * r) continue;
        }
        put(x + i, y + j, c);
      }
    },
    disc(cx, cy, rad, c) {
      for (let j = -rad; j <= rad; j++) for (let i = -rad; i <= rad; i++) {
        const d = Math.hypot(i, j);
        if (d <= rad) put(cx + i, cy + j, d > rad - 1.2 ? [...c.slice(0, 3), 170] : c);
      }
    },
    fillAll(c) { this.rect(0, 0, size, size, c); },
  };
}

function drawIcon(size) {
  const c = canvas(size);
  const u = size / 100;               // draw in percentage units, scale at the end
  const U = (n) => Math.round(n * u);

  // Sky, darker at the top like the game's own gradient.
  for (let y = 0; y < size; y++) {
    const t = y / size;
    c.rect(0, y, size, 1, [
      Math.round(24 + t * 36), Math.round(34 + t * 60), Math.round(52 + t * 78),
    ]);
  }
  // The mountain: flat where the truck is, rising steeply ahead of it. Reads
  // as "about to climb something stupid", which is the game.
  const hillY = (x) => {
    const t = x / size;
    const rise = t < 0.42 ? 0 : ((t - 0.42) / 0.58) ** 1.7;
    return size * (0.80 - 0.46 * rise);
  };
  for (let x = 0; x < size; x++) {
    const h = Math.round(hillY(x));
    c.rect(x, h, 1, size - h, [59, 63, 71]);
    c.rect(x, h - U(2.5), 1, U(2.5), [242, 246, 250]);        // snow line
  }

  // The truck, sitting on the flat with its wheels actually touching ground.
  const ground = Math.round(hillY(size * 0.25));
  const wheelR = U(7.5);
  const axleY = ground - wheelR;
  const bedY = axleY - U(5);
  c.rect(U(8), bedY, U(40), U(5), [107, 114, 128], 1);         // trailer bed
  c.rect(U(48), bedY - U(15), U(26), U(20), [217, 79, 69], U(4)); // cab
  c.rect(U(53), bedY - U(11), U(10), U(7), [31, 41, 55], U(2));   // window
  c.disc(U(16), axleY, wheelR, [22, 24, 29]);
  c.disc(U(52), axleY, wheelR, [22, 24, 29]);
  c.disc(U(68), axleY, wheelR, [22, 24, 29]);

  // Three bots on the bed. One has already left, which is the whole premise.
  c.rect(U(13), bedY - U(11), U(9), U(11), [94, 200, 242], U(2));
  c.rect(U(25), bedY - U(11), U(9), U(11), [242, 215, 78], U(2));
  c.rect(U(37), bedY - U(11), U(9), U(11), [217, 132, 82], U(2));
  c.rect(U(30), bedY - U(31), U(9), U(11), [155, 227, 109], U(2)); // airborne

  return png(size, size, c.buf);
}

await mkdir('icons', { recursive: true });
// 1024 for the stores, 512/192 for the web manifest, 180 for iOS home screen.
for (const size of [1024, 512, 192, 180]) {
  await writeFile(`icons/icon-${size}.png`, drawIcon(size));
  console.log(`icons/icon-${size}.png`);
}
