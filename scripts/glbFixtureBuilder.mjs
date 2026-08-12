import fs from 'node:fs';
import pathModule from 'node:path';

export function encodeGlb(json, binBytes) {
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const jsonPadded = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)]);
  const bin = Buffer.from(binBytes);
  const totalLength = 12 + 8 + jsonPadded.length + 8 + bin.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const jsonChunk = Buffer.alloc(8);
  jsonChunk.writeUInt32LE(jsonPadded.length, 0);
  jsonChunk.writeUInt32LE(0x4e4f534a, 4);
  const binChunk = Buffer.alloc(8);
  binChunk.writeUInt32LE(bin.length, 0);
  binChunk.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonChunk, jsonPadded, binChunk, bin]);
}

export function alignedBytes(parts) {
  const bytes = [];
  const add = (typed) => {
    const view = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    while (bytes.length % 4) bytes.push(0);
    const offset = bytes.length;
    bytes.push(...view);
    return { offset, length: view.byteLength };
  };
  const views = parts.map(add);
  return { bytes: Buffer.from(bytes), views };
}

export function writeGlb(path, json, binBytes) {
  fs.mkdirSync(pathModule.dirname(path), { recursive: true });
  fs.writeFileSync(path, encodeGlb(json, binBytes));
}
