const fs = require('fs');

// Create a minimal 32x32 PNG with a music note symbol
// This is a valid PNG file - a simple colored square as placeholder
function createMinimalPNG(size) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);  // width
  ihdrData.writeUInt32BE(size, 4);  // height
  ihdrData.writeUInt8(8, 8);        // bit depth
  ihdrData.writeUInt8(6, 9);        // color type (RGBA)
  ihdrData.writeUInt8(0, 10);       // compression
  ihdrData.writeUInt8(0, 11);       // filter
  ihdrData.writeUInt8(0, 12);       // interlace
  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT chunk - create image data
  const rawData = [];
  for (let y = 0; y < size; y++) {
    rawData.push(0); // filter byte for each row
    for (let x = 0; x < size; x++) {
      const cx = x - size/2;
      const cy = y - size/2;
      const dist = Math.sqrt(cx*cx + cy*cy);
      const radius = size * 0.4;

      if (dist <= radius) {
        // Purple-pink gradient circle
        const t = dist / radius;
        const r = Math.round(180 + 75 * t);
        const g = Math.round(80 - 30 * t);
        const b = Math.round(220 - 40 * t);
        rawData.push(r, g, b, 255);
      } else {
        rawData.push(0, 0, 0, 0); // transparent
      }
    }
  }

  const zlib = require('zlib');
  const compressed = zlib.deflateSync(Buffer.from(rawData));
  const idat = createChunk('IDAT', compressed);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Generate a 1024x1024 icon
const png = createMinimalPNG(1024);
fs.writeFileSync('app-icon.png', png);
console.log('Created app-icon.png (1024x1024)');
