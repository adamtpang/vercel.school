// Draws the vercel.school mark (a chalk-yellow triangle outline on the slate board) and
// writes favicon.svg, favicon.ico (16, 32, 48) and apple-touch-icon.png (180).
// No dependencies: run `node scripts/make-favicon.mjs` after changing the mark.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const BOARD = [0x10, 0x15, 0x1a];
const CHALK = [0xf2, 0xd4, 0x78];
// Geometry in a 0..1 box.
const RADIUS = 0.22;
const TRI = [[0.5, 0.2], [0.82, 0.76], [0.18, 0.76]];
const STROKE = 0.1;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="${RADIUS * 100}" fill="#10151a"/><path d="M${TRI.map(([x, y]) => `${x * 100} ${y * 100}`).join("L")}Z" fill="none" stroke="#f2d478" stroke-width="${STROKE * 100}" stroke-linejoin="round"/></svg>\n`;

function segmentDistance(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function inBoard(x, y, full) {
  if (full) return true; // iOS rounds the touch icon itself
  const cx = Math.min(Math.max(x, RADIUS), 1 - RADIUS), cy = Math.min(Math.max(y, RADIUS), 1 - RADIUS);
  return Math.hypot(x - cx, y - cy) <= RADIUS;
}

function render(size, full = false) {
  const ss = 6, px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let board = 0, chalk = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const u = (x + (sx + 0.5) / ss) / size, v = (y + (sy + 0.5) / ss) / size;
      if (!inBoard(u, v, full)) continue;
      board++;
      const d = Math.min(segmentDistance(u, v, TRI[0], TRI[1]), segmentDistance(u, v, TRI[1], TRI[2]), segmentDistance(u, v, TRI[2], TRI[0]));
      if (d <= STROKE / 2) chalk++;
    }
    const i = (y * size + x) * 4, n = ss * ss;
    if (!board) continue;
    const mix = chalk / board;
    for (let c = 0; c < 3; c++) px[i + c] = Math.round(BOARD[c] + (CHALK[c] - BOARD[c]) * mix);
    px[i + 3] = Math.round((board / n) * 255);
  }
  return px;
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), body.length + 4);
  return out;
}
function png(size, full) {
  const px = render(size, full), raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4); head[8] = 8; head[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
function ico(sizes) {
  const images = sizes.map((s) => png(s));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    header[e] = s; header[e + 1] = s; header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(images[i].length, e + 8); header.writeUInt32LE(offset, e + 12);
    offset += images[i].length;
  });
  return Buffer.concat([header, ...images]);
}

writeFileSync("favicon.svg", svg);
writeFileSync("favicon.ico", ico([16, 32, 48]));
writeFileSync("apple-touch-icon.png", png(180, true));
console.log("Wrote favicon.svg, favicon.ico (16, 32, 48) and apple-touch-icon.png.");
