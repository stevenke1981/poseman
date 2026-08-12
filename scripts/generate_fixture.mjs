import fs from 'node:fs';
import path from 'node:path';

// A tiny, self-authored 17-bone GLB used only by local tests/browser smoke.
// It contains one skinned box, no animations, and no external URI.  The source
// is released as CC0 for this repository's test/acceptance use.
const outDir = path.resolve('fixtures/mini_humanoid');
fs.mkdirSync(outDir, { recursive: true });

const names = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'];
const children = [[1, 11, 14], [2], [3, 5, 8], [4], [], [6], [7], [], [9], [10], [], [12], [13], [], [15], [16], []];
const nodes = names.map((name, index) => ({ name, translation: [index === 11 || index === 14 ? (index === 11 ? -0.12 : 0.12) : 0, index === 0 ? 0 : 0.1, 0], ...(children[index].length ? { children: children[index] } : {}) }));
nodes.push({ name: 'MiniSkinnedMesh', mesh: 0, skin: 0 });

const bytes = [];
const add = (typed) => {
  const view = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
  while (bytes.length % 4) bytes.push(0);
  const offset = bytes.length;
  bytes.push(...view);
  return { offset, length: view.byteLength };
};
const matrices = new Float32Array(names.length * 16);
for (let i = 0; i < names.length; i += 1) matrices[i * 16] = matrices[i * 16 + 5] = matrices[i * 16 + 10] = matrices[i * 16 + 15] = 1;
const ibm = add(matrices);
const positions = add(new Float32Array([
  -0.12, 0, -0.12, 0.12, 0, -0.12, 0.12, 1.7, -0.12, -0.12, 1.7, -0.12,
  -0.12, 0, 0.12, 0.12, 0, 0.12, 0.12, 1.7, 0.12, -0.12, 1.7, 0.12,
]));
const normals = add(new Float32Array(Array(8).fill(0).flatMap(() => [0, 1, 0])));
const texcoords = add(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]));
const joints = add(new Uint8Array(Array.from({ length: 8 }, (_, i) => [Math.min(i * 2, 16), 0, 0, 0]).flat()));
const weights = add(new Float32Array(Array.from({ length: 8 }, () => [1, 0, 0, 0]).flat()));
const indices = add(new Uint16Array([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2]));

const json = {
  asset: { version: '2.0', generator: 'PoseMan self-authored CC0 fixture' },
  scene: 0,
  scenes: [{ nodes: [0, names.length] }],
  nodes,
  skins: [{ skeleton: 0, joints: names.map((_, index) => index), inverseBindMatrices: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 1, NORMAL: 2, TEXCOORD_0: 3, JOINTS_0: 4, WEIGHTS_0: 5 }, indices: 6, material: 0 }] }],
  materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.55, 0.7, 0.9, 1], metallicFactor: 0, roughnessFactor: 0.8 } }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: names.length, type: 'MAT4' },
    { bufferView: 1, componentType: 5126, count: 8, type: 'VEC3', min: [-0.12, 0, -0.12], max: [0.12, 1.7, 0.12] },
    { bufferView: 2, componentType: 5126, count: 8, type: 'VEC3' },
    { bufferView: 3, componentType: 5126, count: 8, type: 'VEC2' },
    { bufferView: 4, componentType: 5121, count: 8, type: 'VEC4' },
    { bufferView: 5, componentType: 5126, count: 8, type: 'VEC4' },
    { bufferView: 6, componentType: 5123, count: indices.length / 2, type: 'SCALAR' },
  ],
  bufferViews: [ibm, positions, normals, texcoords, joints, weights, indices].map(({ offset, length }) => ({ buffer: 0, byteOffset: offset, byteLength: length })),
  buffers: [{ byteLength: bytes.length }],
};
const jsonBytes = Buffer.from(JSON.stringify(json));
const jsonPadded = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)]);
const bin = Buffer.from(bytes);
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
fs.writeFileSync(path.join(outDir, 'mini-humanoid.glb'), Buffer.concat([header, jsonChunk, jsonPadded, binChunk, bin]));
fs.writeFileSync(path.join(outDir, 'LICENSE.txt'), 'SPDX-License-Identifier: CC0-1.0\n\nThis self-authored PoseMan test fixture is dedicated to the public domain under\nCreative Commons CC0 1.0 Universal:\nhttps://creativecommons.org/publicdomain/zero/1.0/\n');
fs.writeFileSync(path.join(outDir, 'README.md'), '# mini-humanoid fixture\n\n由 `scripts/generate_fixture.mjs` 產生，無外部資產、無動畫、無外部 URI。授權為 CC0 1.0。\n');

// The opaque-name variant intentionally does not contain any PoseMan alias.
// It exercises the CHANGE-006 manual mapping editor while keeping the same
// self-authored CC0 geometry, hierarchy, skin, and no-animation guarantees.
const opaqueDir = path.resolve('fixtures/opaque_humanoid');
const opaqueNames = names.map((_, index) => `rigbone_${String(index + 1).padStart(2, '0')}`);
const opaqueJson = {
  ...json,
  nodes: json.nodes.map((node, index) => index < names.length ? { ...node, name: opaqueNames[index] } : node),
};
const opaqueJsonBytes = Buffer.from(JSON.stringify(opaqueJson));
const opaqueJsonPadded = Buffer.concat([opaqueJsonBytes, Buffer.alloc((4 - (opaqueJsonBytes.length % 4)) % 4, 0x20)]);
const opaqueTotalLength = 12 + 8 + opaqueJsonPadded.length + 8 + bin.length;
const opaqueHeader = Buffer.alloc(12);
opaqueHeader.writeUInt32LE(0x46546c67, 0);
opaqueHeader.writeUInt32LE(2, 4);
opaqueHeader.writeUInt32LE(opaqueTotalLength, 8);
const opaqueJsonChunk = Buffer.alloc(8);
opaqueJsonChunk.writeUInt32LE(opaqueJsonPadded.length, 0);
opaqueJsonChunk.writeUInt32LE(0x4e4f534a, 4);
const opaqueBinChunk = Buffer.alloc(8);
opaqueBinChunk.writeUInt32LE(bin.length, 0);
opaqueBinChunk.writeUInt32LE(0x004e4942, 4);
fs.mkdirSync(opaqueDir, { recursive: true });
fs.writeFileSync(path.join(opaqueDir, 'opaque-humanoid.glb'), Buffer.concat([opaqueHeader, opaqueJsonChunk, opaqueJsonPadded, opaqueBinChunk, bin]));
fs.writeFileSync(path.join(opaqueDir, 'LICENSE.txt'), 'SPDX-License-Identifier: CC0-1.0\n\nThis self-authored PoseMan test fixture is dedicated to the public domain under\nCreative Commons CC0 1.0 Universal.\n');
fs.writeFileSync(path.join(opaqueDir, 'README.md'), '# opaque-humanoid fixture\n\n由 `scripts/generate_fixture.mjs` 產生，骨骼名稱刻意不含 PoseMan alias，用於 CHANGE-006 手動映射測試。無外部資產、無動畫、無外部 URI。授權為 CC0 1.0。\n');
console.log(path.join(outDir, 'mini-humanoid.glb'));
