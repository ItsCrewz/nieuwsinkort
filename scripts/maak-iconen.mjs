// Bouwt de icoonbestanden in public/ uit het ontwerp hieronder (#597). Handmatig draaien: node scripts/maak-iconen.mjs
// De SVG in public/favicon.svg is het bronontwerp; de maskable variant heeft een vol vlak en inhoud binnen de veilige zone (80%).
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const svg = readFileSync("public/favicon.svg");
const balken = '<rect x="19" y="20" width="26" height="7" rx="3.5" fill="#fff"/><rect x="19" y="31" width="20" height="5.5" rx="2.75" fill="#fff" fill-opacity=".85"/><rect x="19" y="40" width="23" height="5.5" rx="2.75" fill="#fff" fill-opacity=".85"/>';
const maskable = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#d6331f"/>${balken}</svg>`);
const png = (bron, n) => sharp(bron, { density: 384 }).resize(n, n).png({ compressionLevel: 9, palette: true, quality: 100 }).toBuffer();

for (const n of [48, 96, 192, 512]) writeFileSync(`public/icon-${n}.png`, await png(svg, n));
writeFileSync("public/apple-touch-icon.png", await png(maskable, 180));
writeFileSync("public/icon-maskable-512.png", await png(maskable, 512));

// ICO met drie PNG-beelden (16/32/48)
const maten = [16, 32, 48];
const beelden = await Promise.all(maten.map((n) => png(svg, n)));
const kop = Buffer.alloc(6); kop.writeUInt16LE(1, 2); kop.writeUInt16LE(maten.length, 4);
let pos = 6 + 16 * maten.length;
const dir = beelden.map((b, i) => {
  const e = Buffer.alloc(16); e[0] = maten[i]; e[1] = maten[i]; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(b.length, 8); e.writeUInt32LE(pos, 12); pos += b.length; return e;
});
writeFileSync("public/favicon.ico", Buffer.concat([kop, ...dir, ...beelden]));
