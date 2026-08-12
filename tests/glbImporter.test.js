import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GLB_LIMITS,
  createImportedFigure,
  mapSkeletonBones,
  validateGlbHeader,
  validateGltfJson,
  validateImagePayloads,
  validateLicenseMetadata,
} from '../src/glbImporter.js';
import * as THREE from 'three';
import {
  sanitizeAssetRef,
  sanitizeFigureRecord,
  serializeFigureRecord,
  SCENE_VERSION,
} from '../src/sceneSchema.js';
import { getAsset, putAsset, clearMemoryAssetsForTests } from '../src/assetStore.js';

function glbWithJson(json, declaredLength = null) {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const padded = new Uint8Array((jsonBytes.length + 3) & ~3);
  padded.set(jsonBytes);
  const bytes = new Uint8Array(12 + 8 + padded.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, declaredLength ?? bytes.length, true);
  view.setUint32(12, padded.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(padded, 20);
  return bytes.buffer;
}

function pngHeaderDataUri(width, height) {
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
    (width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff,
    (height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff,
  ]);
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

test('license validator requires acknowledgement and safe https metadata', () => {
  assert.equal(validateLicenseMetadata({ licenseType: 'cc-by-4.0', assetName: 'A', author: 'B', source: 'http://bad', confirmed: true }).ok, false);
  assert.equal(validateLicenseMetadata({ licenseType: 'cc-by-4.0', assetName: 'A', author: 'B', source: 'https://example.test/a', confirmed: true }).ok, true);
  assert.equal(validateLicenseMetadata({ licenseType: 'cc-by-4.0', assetName: 'A', author: 'B', source: 'https://u:p@example.test/a', confirmed: true }).ok, false);
  assert.equal(validateLicenseMetadata({ licenseType: 'other', assetName: 'A', notes: '自有授權說明', confirmed: true }).ok, false, '其他仍須作者');
  assert.equal(validateLicenseMetadata({ licenseType: 'own', assetName: '__proto__', confirmed: true }).metadata.assetName, '__proto__');
});

test('GLB header validates magic/version/declared length and JSON chunk', () => {
  const valid = validateGlbHeader(glbWithJson({ asset: { version: '2.0' } }));
  assert.equal(valid.ok, true);
  const badMagic = new Uint8Array(glbWithJson({ asset: { version: '2.0' } }));
  badMagic[0] = 0;
  assert.equal(validateGlbHeader(badMagic).ok, false);
  assert.equal(validateGlbHeader(glbWithJson({ asset: { version: '2.0' } }, 999)).ok, false);
  const malformed = new Uint8Array(glbWithJson({ asset: { version: '2.0' } }));
  malformed[24] = 0xff;
  assert.equal(validateGlbHeader(malformed).ok, false);
  assert.equal(validateGlbHeader(valid.bytes, { ...GLB_LIMITS, maxBytes: 16 }).ok, false);
});

test('GLTF JSON rejects external URI and unsafe scale limits', () => {
  const base = {
    asset: { version: '2.0' },
    nodes: [{ mesh: 0, skin: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 } }] }],
    accessors: [{ count: 4, componentType: 5126, type: 'VEC3' }, { count: 4, componentType: 5126, type: 'VEC4' }, { count: 4, componentType: 5126, type: 'VEC4' }],
    skins: [{ joints: Array.from({ length: 17 }, (_, i) => i) }],
    buffers: [{ uri: 'https://evil.test/a.bin' }],
  };
  const result = validateGltfJson(base);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /外部 URI/);
  assert.equal(validateGltfJson({ ...base, buffers: [{ uri: 'data:application/octet-stream;base64,AA==' }] }).ok, true);
  assert.equal(validateGltfJson({ ...base, buffers: [{ uri: 'blob:https://example.test/id' }] }).ok, false);
  assert.equal(validateGltfJson({ ...base, nodes: Array.from({ length: GLB_LIMITS.maxNodes + 1 }, () => ({ mesh: 0, skin: 0 })) }).ok, false);
  assert.equal(validateGltfJson({ ...base, meshes: Array.from({ length: GLB_LIMITS.maxMeshes + 1 }, () => ({ primitives: [] })) }).ok, false);
  assert.equal(validateGltfJson({ ...base, accessors: [{ count: 1_000_000_000, componentType: 5126, type: 'VEC4' }] }).ok, false);
  assert.equal(validateGltfJson({ ...base, accessors: [{ count: 2, componentType: 5126, type: 'VEC4', sparse: { count: 99_999_999, indices: { bufferView: 0, componentType: 5121 }, values: { bufferView: 0 } } }] }).ok, false);
  assert.equal(validateGltfJson({ ...base, images: Array.from({ length: GLB_LIMITS.maxImages + 1 }, () => ({ uri: 'data:image/png;base64,AA==' })) }).ok, false);
  assert.ok(GLB_LIMITS.maxBytes >= 25 * 1024 * 1024);
});

test('image validation rejects oversized PNG header before GLTFLoader decode', () => {
  const png = `data:image/png;base64,${Buffer.from(new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x40, 0x01, 0x00, 0x00, 0x40, 0x01,
  ])).toString('base64')}`;
  const source = {
    asset: { version: '2.0' },
    nodes: [{ mesh: 0, skin: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 } }] }],
    accessors: [{ count: 4, componentType: 5126, type: 'VEC3' }, { count: 4, componentType: 5126, type: 'VEC4' }, { count: 4, componentType: 5126, type: 'VEC4' }],
    skins: [{ joints: Array.from({ length: 17 }, (_, i) => i) }],
    images: [{ uri: png }],
  };
  assert.equal(validateGltfJson(source).ok, true);
  const imageErrors = validateImagePayloads(source, null, GLB_LIMITS);
  assert.match(imageErrors.join(' '), /像素尺寸超過安全上限/);
});

test('image bufferView resolves its declared data buffer instead of always using GLB BIN', () => {
  const binImage = Buffer.from(pngHeaderDataUri(1, 1).split(',')[1], 'base64');
  const dataBufferImage = Buffer.from(pngHeaderDataUri(9000, 1).split(',')[1], 'base64');
  const source = {
    buffers: [
      { byteLength: binImage.length },
      { uri: `data:image/png;base64,${dataBufferImage.toString('base64')}`, byteLength: dataBufferImage.length },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: binImage.length },
      { buffer: 1, byteOffset: 0, byteLength: dataBufferImage.length },
    ],
    images: [
      { bufferView: 0, mimeType: 'image/png' },
      { bufferView: 1, mimeType: 'image/png' },
    ],
  };
  const errors = validateImagePayloads(source, binImage, GLB_LIMITS);
  assert.match(errors.join(' '), /像素尺寸超過安全上限/);
});

test('image aggregate decoded-pixel budget rejects individually safe images', () => {
  const source = {
    images: [
      { uri: pngHeaderDataUri(4096, 4096) },
      { uri: pngHeaderDataUri(4096, 4096) },
      { uri: pngHeaderDataUri(4096, 4096) },
    ],
  };
  const errors = validateImagePayloads(source, null, GLB_LIMITS);
  assert.match(errors.join(' '), /解碼後總像素/);
});

test('Mixamo aliases map to all 17 PoseMan joints and reject incomplete rigs', () => {
  const names = [
    'mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:Spine2', 'mixamorig:Neck', 'mixamorig:Head',
    'mixamorig:LeftShoulder', 'mixamorig:LeftArm', 'mixamorig:LeftForeArm', 'mixamorig:LeftHand',
    'mixamorig:RightShoulder', 'mixamorig:RightArm', 'mixamorig:RightForeArm', 'mixamorig:RightHand',
    'mixamorig:LeftUpLeg', 'mixamorig:LeftLeg', 'mixamorig:LeftFoot', 'mixamorig:RightUpLeg',
    'mixamorig:RightLeg', 'mixamorig:RightFoot',
  ];
  const mapping = mapSkeletonBones(names.map((name) => ({ name })));
  assert.equal(mapping.complete, true);
  assert.equal(Object.keys(mapping.mapping).length, 17);
  assert.equal(mapSkeletonBones(names.slice(0, -1).map((name) => ({ name }))).complete, false);
});

test('multi-rig imports select one complete SkinnedMesh skeleton, never mix bones across rigs', () => {
  const incomplete = fixtureFigure();
  incomplete.bones.pop();
  incomplete.mesh.bind(new THREE.Skeleton(incomplete.bones));
  const complete = fixtureFigure();
  complete.scene.position.x = 2;
  const scene = new THREE.Group();
  scene.add(incomplete.scene, complete.scene);
  const figure = createImportedFigure({ scene }, { assetName: 'multi-rig' });
  try {
    assert.equal(Object.keys(figure.mapping).length, 17);
    assert.equal(figure.mapping.elbowL, 'elbowL');
    assert.equal(figure.mapping.kneeR, 'kneeR');
  } finally {
    figure.dispose();
  }
});

function fixtureFigure() {
  const root = new THREE.Group();
  const names = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'];
  const bones = [];
  let parent = root;
  for (const name of names) {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.y = 0.1;
    parent.add(bone);
    bones.push(bone);
    parent = bone;
  }
  const geometry = new THREE.BoxGeometry(0.2, 1.7, 0.2);
  const count = geometry.attributes.position.count;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) weights[i * 4] = 1;
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton);
  root.add(mesh);
  root.position.set(5, -3, 2);
  root.scale.setScalar(2);
  return { scene: root, bones, mesh };
}

test('imported joints are rest-relative, normalize height/ground, and dispose owned resources once', () => {
  const source = fixtureFigure();
  const figure = createImportedFigure(source, {
    assetId: 'a'.repeat(64),
    assetName: 'Fixture',
    license: { licenseType: 'own', confirmed: true },
  });
  let head = null;
  figure.group.traverse((object) => { if (object.isBone && object.name === 'head') head = object; });
  assert.ok(head);
  const rest = head.quaternion.clone();
  let ownedMesh = null;
  figure.group.traverse((object) => { if (object.isSkinnedMesh) ownedMesh = object; });
  assert.ok(ownedMesh);
  const ownedGeometry = ownedMesh.geometry;
  const material = ownedMesh.material;
  let geometryDisposals = 0;
  let materialDisposals = 0;
  let sourceGeometryDisposals = 0;
  source.mesh.geometry.addEventListener('dispose', () => sourceGeometryDisposals += 1);
  ownedGeometry.addEventListener('dispose', () => geometryDisposals += 1);
  material.addEventListener('dispose', () => materialDisposals += 1);
  try {
    figure.joints.head.rotation.x = Math.PI / 4;
    assert.equal(figure.joints.head.rotation.x, Math.PI / 4);
    assert.notDeepEqual(head.quaternion.toArray(), rest.toArray());
    figure.setPose({ head: [0, 0, 0] });
    assert.deepEqual(head.quaternion.toArray(), rest.toArray());
    figure.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(figure.group);
    assert.ok(box.min.y >= -1e-5);
    assert.ok(box.max.y - box.min.y <= 1.73);
    assert.deepEqual(figure.group.position.toArray(), [0, 0, 0], 'manager placement wrapper may move group without losing model grounding');
  } finally {
    figure.dispose();
    figure.dispose();
  }
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
  assert.equal(sourceGeometryDisposals, 0);
});

test('v5 asset refs are safe, portable, and legacy scene records keep defaults', () => {
  assert.equal(SCENE_VERSION, 5);
  const source = {
    female: false,
    appearance: { skinTone: 'constructor' },
    x: 1,
    pose: { chest: [1, 2, 3] },
    assetRef: { assetId: 'B'.repeat(64), mapping: { hips: 'Hips', __proto__: 'bad', chest: 'Chest' } },
    license: { licenseType: 'cc-by-4.0', assetName: 'A', author: 'B', source: 'https://example.test/a', confirmed: true },
  };
  const safe = sanitizeFigureRecord(source, (pose) => pose);
  assert.equal(safe.assetRef.assetId, 'b'.repeat(64));
  assert.equal(Object.hasOwn(safe.assetRef.mapping, '__proto__'), false);
  assert.equal(safe.license.source, 'https://example.test/a');
  assert.equal(sanitizeAssetRef({ assetId: 'constructor' }), null);
  const fake = { female: false, appearance: {}, group: { position: { x: 0, y: 0, z: 0 } }, assetRef: safe.assetRef, license: safe.license };
  const record = serializeFigureRecord(fake, { hips: [0, 0, 0] });
  assert.equal(record.assetRef.assetId, 'b'.repeat(64));
});

test('asset store addresses bytes by SHA-256 and reports missing assets explicitly', async () => {
  clearMemoryAssetsForTests();
  assert.equal(await getAsset('c'.repeat(64)), null);
  const data = new Uint8Array([1, 2, 3, 4]).buffer;
  const id = await putAsset(data, { assetName: 'fixture', licenseType: 'cc0', confirmed: true });
  assert.match(id, /^[a-f0-9]{64}$/);
  const record = await getAsset(id);
  assert.deepEqual([...new Uint8Array(record.data)], [1, 2, 3, 4]);
  clearMemoryAssetsForTests();
});
