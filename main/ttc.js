// Extrai uma face de um arquivo TTC/OTC como um arquivo sfnt independente,
// para que o Chromium consiga renderizar qualquer face da coleção (ele só lê a primeira).

function extractFromCollection(buf, index) {
  if (buf.toString('ascii', 0, 4) !== 'ttcf') return buf;
  const numFonts = buf.readUInt32BE(8);
  if (index >= numFonts) index = 0;
  const offset = buf.readUInt32BE(12 + index * 4);

  const sfntVersion = buf.readUInt32BE(offset);
  const numTables = buf.readUInt16BE(offset + 4);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const rec = offset + 12 + i * 16;
    tables.push({
      tag: buf.toString('ascii', rec, rec + 4),
      checksum: buf.readUInt32BE(rec + 4),
      offset: buf.readUInt32BE(rec + 8),
      length: buf.readUInt32BE(rec + 12),
    });
  }

  const headerSize = 12 + numTables * 16;
  let total = headerSize;
  for (const t of tables) total += (t.length + 3) & ~3;

  const out = Buffer.alloc(total);
  out.writeUInt32BE(sfntVersion, 0);
  out.writeUInt16BE(numTables, 4);
  let p = 1, log = 0;
  while (p * 2 <= numTables) { p *= 2; log++; }
  out.writeUInt16BE(p * 16, 6);
  out.writeUInt16BE(log, 8);
  out.writeUInt16BE(numTables * 16 - p * 16, 10);

  let cursor = headerSize;
  tables.forEach((t, i) => {
    const rec = 12 + i * 16;
    out.write(t.tag, rec, 4, 'ascii');
    out.writeUInt32BE(t.checksum, rec + 4);
    out.writeUInt32BE(cursor, rec + 8);
    out.writeUInt32BE(t.length, rec + 12);
    buf.copy(out, cursor, t.offset, t.offset + t.length);
    cursor += (t.length + 3) & ~3;
  });
  return out;
}

module.exports = { extractFromCollection };
