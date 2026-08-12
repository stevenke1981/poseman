import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  GLB_LIMITS,
  createImportedFigure,
  disposeParsedGltf,
  inspectGlbArrayBuffer,
  inspectImportedGltf,
  mapSkeletonBones,
  validateManualMapping,
  validateGlbHeader,
  validateGltfJson,
  validateImagePayloads,
  validateLicenseMetadata,
} from '../src/glbImporter.js';
import * as THREE from 'three';
import { JOINT_NAMES } from '../src/mannequin.js';
import { DEFAULT_HUMAN, isDefaultHumanAssetId, verifyDefaultHumanBytes } from '../src/defaultHuman.js';
import {
  loadMappingPresets,
  saveMappingPreset,
  deleteMappingPreset,
} from '../src/mappingPresets.js';
import {
  sanitizeAssetRef,
  sanitizeFigureRecord,
  serializeFigureRecord,
  SCENE_VERSION,
} from '../src/sceneSchema.js';
import { getAsset, putAsset, clearMemoryAssetsForTests } from '../src/assetStore.js';
import { createGlbImportSession } from '../src/glbImportSession.js';

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

test('GLB import request session invalidates stale parse/finalize results deterministically', () => {
  const session = createGlbImportSession();
  const first = session.begin();
  assert.equal(session.isCurrent(first), true);
  const second = session.begin();
  assert.equal(session.isCurrent(first), false);
  assert.equal(session.isCurrent(second), true);
  session.invalidate();
  assert.equal(session.isCurrent(second), false);
  assert.equal(session.complete(second), false);
  const third = session.begin();
  assert.equal(session.complete(third), true);
  assert.equal(session.isCurrent(third), false);
});

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

test('chest alias keeps legacy spine2 priority when spine2 and spine3 coexist', () => {
  const mapping = mapSkeletonBones(['spine', 'spine2', 'spine3'].map((name) => ({ name })));
  assert.equal(mapping.mapping.chest, 'spine2');
});

test('chest alias selects Mesh2Motion spine_03 ahead of spine_02', () => {
  const mapping = mapSkeletonBones(['spine_01', 'spine_02', 'spine_03'].map((name) => ({ name })));
  assert.equal(mapping.mapping.chest, 'spine_03');
});

test('inspect reports complete, missing, duplicate, and unused bones for one actual skeleton', () => {
  const complete = fixtureFigure();
  const diagnosis = inspectImportedGltf({ scene: complete.scene });
  assert.equal(diagnosis.skeletons.length, 1);
  assert.equal(diagnosis.complete, true);
  assert.equal(diagnosis.selected.boneCount, 17);
  assert.equal(diagnosis.selected.hit.length, 17);
  assert.deepEqual(diagnosis.selected.missing, []);
  assert.deepEqual(diagnosis.selected.duplicate, []);
  assert.equal(diagnosis.selected.unused.length, 0);
  complete.scene.removeFromParent();
  const duplicate = fixtureFigure();
  duplicate.bones[16].name = duplicate.bones[15].name;
  const duplicateDiagnosis = inspectImportedGltf({ scene: duplicate.scene });
  assert.deepEqual(duplicateDiagnosis.selected.duplicateBones, ['kneeR']);
});

test('opaque skeleton diagnosis enables strict same-skeleton manual mapping', () => {
  const opaque = fixtureFigure({ opaque: true });
  const diagnosis = inspectImportedGltf({ scene: opaque.scene });
  assert.equal(diagnosis.complete, false);
  assert.equal(diagnosis.selected.missing.length, 17);
  assert.equal(diagnosis.selected.unused.length, 17);
  const mapping = Object.fromEntries(JOINT_NAMES.map((joint, index) => [joint, opaque.names[index]]));
  const valid = validateManualMapping(mapping, diagnosis.selected.boneObjects);
  assert.equal(valid.ok, true);
  const figure = createImportedFigure({ scene: opaque.scene }, { mapping: valid.mapping });
  try {
    assert.deepEqual(Object.keys(figure.mapping).sort(), [...JOINT_NAMES].sort());
  } finally {
    figure.dispose();
  }
});

test('committed opaque CC0 fixture parses through the bounded GLB inspection path', async () => {
  const bytes = fs.readFileSync(path.join(process.cwd(), 'fixtures', 'opaque_humanoid', 'opaque-humanoid.glb'));
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const inspection = await inspectGlbArrayBuffer(arrayBuffer);
  try {
    assert.equal(inspection.selected.boneCount, 17);
    assert.equal(inspection.complete, false);
    assert.equal(inspection.selected.missing.length, 17);
  } finally {
    disposeParsedGltf(inspection.gltf);
  }
});

test('pinned Mesh2Motion CC0 humanoid is exact, bounded, auto-maps 17 joints, and has provenance', async () => {
  const templatePath = path.join(process.cwd(), 'public', 'templates', 'poseman-default-human.glb');
  const licensePath = path.join(process.cwd(), 'public', 'templates', 'poseman-default-human.PROVENANCE.md');
  const licenseTextPath = path.join(process.cwd(), 'public', 'templates', 'poseman-default-human.LICENSE-CC0.md');
  assert.equal(fs.existsSync(templatePath), true);
  assert.equal(fs.existsSync(licensePath), true);
  assert.equal(fs.existsSync(licenseTextPath), true);
  assert.match(fs.readFileSync(licensePath, 'utf8'), /CC0/);
  assert.match(fs.readFileSync(licensePath, 'utf8'), /2b1c47e5eeebffd5097eb8a52add4ba6556dab85e50fc1c5240d744099bebae1/);
  assert.match(fs.readFileSync(licensePath, 'utf8'), /human-female\.glb/);
  assert.match(fs.readFileSync(licenseTextPath, 'utf8'), /CC0 1\.0 Universal/);
  const after = fs.readFileSync(templatePath);
  assert.equal(after.byteLength, DEFAULT_HUMAN.bytes);
  assert.equal(createHash('sha256').update(after).digest('hex'), DEFAULT_HUMAN.sha256);
  assert.equal(isDefaultHumanAssetId(DEFAULT_HUMAN.sha256.toUpperCase()), true);
  const verified = await verifyDefaultHumanBytes(after);
  assert.equal(verified.byteLength, DEFAULT_HUMAN.bytes);

  const previousSelf = globalThis.self;
  const previousDocument = globalThis.document;
  class FakeImage {
    constructor() { this.width = 1; this.height = 1; this.naturalWidth = 1; this.naturalHeight = 1; this.listeners = new Map(); }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    removeEventListener(type) { this.listeners.delete(type); }
    set src(value) { this._src = value; queueMicrotask(() => this.listeners.get('load')?.call(this)); }
  }
  globalThis.self = globalThis;
  globalThis.document = { createElementNS: () => new FakeImage() };
  let inspection = null;
  try {
    inspection = await inspectGlbArrayBuffer(after.buffer.slice(after.byteOffset, after.byteOffset + after.byteLength));
    assert.equal(inspection.selected.boneCount, 66);
    assert.equal(inspection.mapping.chest, 'spine_03');
    assert.equal(inspection.complete, true);
    assert.equal(inspection.selected.hit.length, 17);
    assert.deepEqual(inspection.selected.missing, []);
    assert.deepEqual(inspection.selected.duplicate, []);
    assert.equal(inspection.gltf.animations?.length || 0, 0);
    assert.equal(inspection.gltf.parser?.json?.buffers?.[0]?.uri, undefined);
    const figure = createImportedFigure(inspection.gltf, {
      mapping: inspection.mapping,
      skeletonSelector: inspection.selectedSkeletonSelector,
      assetName: 'Mesh2Motion human-female',
      license: { licenseType: 'cc0', assetName: 'Mesh2Motion human-female', confirmed: true },
    });
    try {
      figure.group.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(figure.group);
      assert.ok(bounds.min.y >= -1e-5, `default human ground=${bounds.min.y}`);
      assert.ok(bounds.max.y - bounds.min.y <= 1.73, `default human height=${bounds.max.y - bounds.min.y}`);
      assert.equal(Object.keys(figure.mapping).length, 17);
    } finally {
      figure.dispose();
    }
  } finally {
    if (inspection?.gltf) disposeParsedGltf(inspection.gltf);
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('parsed GLTF inspection cancellation releases source geometry/material ownership', () => {
  const source = fixtureFigure();
  let geometryDisposals = 0;
  let materialDisposals = 0;
  source.mesh.geometry.addEventListener('dispose', () => geometryDisposals += 1);
  source.mesh.material.addEventListener('dispose', () => materialDisposals += 1);
  disposeParsedGltf({ scene: source.scene });
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
});

test('create imported figure owns cloned resources while parser disposal leaves clone usable', () => {
  const source = fixtureFigure();
  const sourceGeometry = source.mesh.geometry;
  const sourceMaterial = source.mesh.material;
  const figure = createImportedFigure({ scene: source.scene }, {});
  let cloneMesh = null;
  figure.group.traverse((object) => { if (object.isSkinnedMesh) cloneMesh = object; });
  assert.ok(cloneMesh);
  disposeParsedGltf({ scene: source.scene });
  assert.notEqual(cloneMesh.geometry, sourceGeometry);
  assert.notEqual(cloneMesh.material, sourceMaterial);
  assert.equal(cloneMesh.geometry.attributes.position.count > 0, true);
  figure.dispose();
});

test('manual mapping rejects cross-skeleton, duplicate, and prototype selections', () => {
  const first = fixtureFigure();
  const second = fixtureFigure({ offset: 3, opaque: true });
  const bones = first.bones;
  const mapping = Object.fromEntries(JOINT_NAMES.map((joint, index) => [joint, bones[index].name]));
  mapping.head = second.bones[4].name;
  assert.equal(validateManualMapping(mapping, bones).ok, false, 'a bone from another skeleton is not accepted');
  mapping.head = bones[4].name;
  mapping.head = mapping.hips;
  assert.equal(validateManualMapping(mapping, bones).ok, false);
  assert.equal(validateManualMapping({ ...mapping, __proto__: 'hips' }, bones).ok, false);
});

test('manual mapping preserves the selected skeleton index when multiple rigs share names', () => {
  const first = fixtureFigure();
  const second = fixtureFigure({ offset: 3 });
  second.bones[0].rotation.x = 0.37;
  const scene = new THREE.Group();
  scene.add(first.scene, second.scene);
  const mapping = Object.fromEntries(JOINT_NAMES.map((joint) => [joint, joint]));
  const figure = createImportedFigure({ scene }, { mapping, skeletonIndex: 1 });
  try {
    const restEuler = new THREE.Euler().setFromQuaternion(figure.restRotations.hips);
    assert.ok(Math.abs(restEuler.x - 0.37) < 1e-6, `actual rest x=${restEuler.x}`);
  } finally {
    figure.dispose();
  }
});

test('stable skeleton selector survives clone and shared-skeleton multi-mesh dedupe', () => {
  const first = fixtureFigure();
  const second = fixtureFigure({ offset: 3 });
  const shared = new THREE.SkinnedMesh(first.mesh.geometry.clone(), new THREE.MeshBasicMaterial());
  shared.name = 'SharedMesh';
  shared.bind(first.mesh.skeleton);
  first.scene.add(shared);
  const source = new THREE.Group();
  source.add(first.scene, second.scene);
  const inspection = inspectImportedGltf({ scene: source });
  assert.equal(inspection.skeletons.length, 2);
  assert.ok(inspection.skeletons[0].meshNames.includes('SharedMesh'));
  const selected = inspection.skeletons[1];
  const mapping = Object.fromEntries(JOINT_NAMES.map((joint) => [joint, joint]));
  const figure = createImportedFigure({ scene: source }, { mapping, skeletonSelector: selected.selector });
  try {
    assert.equal(figure.skeletonSelector, selected.selector);
    assert.equal(figure.assetRef.skeletonSelector, selected.selector);
  } finally {
    figure.dispose();
  }
});

test('source selector keeps the rear shared-skeleton rig after clone splits meshes', () => {
  const front = fixtureFigure();
  front.bones[0].rotation.x = 0.11;
  const rear = fixtureFigure({ offset: 3 });
  rear.bones[0].rotation.x = 0.42;
  const rearShared = new THREE.SkinnedMesh(rear.mesh.geometry.clone(), new THREE.MeshBasicMaterial());
  rearShared.name = 'RearSharedMesh';
  rearShared.bind(rear.mesh.skeleton);
  rear.scene.add(rearShared);
  const source = new THREE.Group();
  source.add(front.scene, rear.scene);
  const inspection = inspectImportedGltf({ scene: source });
  const rearEntry = inspection.skeletons.find((entry) => entry.meshNames.includes('RearSharedMesh'));
  assert.ok(rearEntry);
  const mapping = Object.fromEntries(JOINT_NAMES.map((joint) => [joint, joint]));
  const figure = createImportedFigure({ scene: source }, { mapping, skeletonSelector: rearEntry.selector });
  try {
    const restEuler = new THREE.Euler().setFromQuaternion(figure.restRotations.hips);
    assert.ok(Math.abs(restEuler.x - 0.42) < 1e-6, `actual rest x=${restEuler.x}`);
    assert.equal(figure.skeletonSelector, rearEntry.selector);
    figure.assetRef.assetId = 'a'.repeat(64);
    const persisted = serializeFigureRecord(figure, {});
    const hydrated = createImportedFigure({ scene: source }, {
      mapping: persisted.assetRef.mapping,
      skeletonSelector: persisted.assetRef.skeletonSelector,
    });
    try {
      const hydratedRest = new THREE.Euler().setFromQuaternion(hydrated.restRotations.hips);
      assert.ok(Math.abs(hydratedRest.x - 0.42) < 1e-6, `hydrated rest x=${hydratedRest.x}`);
    } finally {
      hydrated.dispose();
    }
  } finally {
    figure.dispose();
  }
});

test('saved mapping override wins over alias auto mapping for hydrate-compatible create', () => {
  const source = fixtureFigure();
  const mapping = Object.fromEntries(JOINT_NAMES.map((joint) => [joint, joint]));
  [mapping.spine, mapping.head] = [mapping.head, mapping.spine];
  const figure = createImportedFigure({ scene: source.scene }, { mapping });
  try {
    assert.equal(figure.mapping.spine, 'head');
    assert.equal(figure.mapping.head, 'spine');
  } finally {
    figure.dispose();
  }
});

test('invalid persisted selector or mapping safely falls back to a complete auto rig', () => {
  const source = fixtureFigure();
  const figure = createImportedFigure({ scene: source.scene }, {
    skeletonSelector: 'poseman-skeleton-v1-stale',
    mapping: { hips: 'missing-bone' },
  });
  try {
    assert.equal(figure.mapping.hips, 'hips');
    assert.equal(figure.skeletonSelector.startsWith('poseman-skeleton-v1-'), true);
  } finally {
    figure.dispose();
  }
});

test('failed cloned figure construction disposes owned clone without disposing parser source', () => {
  const source = fixtureFigure();
  source.bones.splice(0, 1);
  source.mesh.bind(new THREE.Skeleton(source.bones));
  let sourceGeometryDisposals = 0;
  source.mesh.geometry.addEventListener('dispose', () => sourceGeometryDisposals += 1);
  assert.throws(() => createImportedFigure({ scene: source.scene }), /骨架缺少必要關節/);
  assert.equal(sourceGeometryDisposals, 0);
});

test('mapping presets are bounded, prototype-safe, and localStorage-only', () => {
  const previous = globalThis.localStorage;
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
  });
  try {
    const mapping = Object.fromEntries(JOINT_NAMES.map((joint) => [joint, `bone-${joint}`]));
    assert.equal(saveMappingPreset('Opaque rig', mapping).ok, true);
    assert.equal(loadMappingPresets().length, 1);
    assert.equal(loadMappingPresets()[0].mapping.__proto__, undefined);
    assert.equal(saveMappingPreset('__proto__', mapping).ok, true, 'names are strings, not object keys');
    assert.equal(deleteMappingPreset('Opaque rig').ok, true);
    assert.equal(loadMappingPresets().some((preset) => preset.name === 'Opaque rig'), false);
    assert.equal(saveMappingPreset('one', mapping, { maxPresets: 1, maxNameLength: 4, maxBoneNameLength: 8 }).ok, true);
    assert.equal(saveMappingPreset('two', mapping, { maxPresets: 1, maxNameLength: 4, maxBoneNameLength: 8 }).ok, true);
    assert.equal(loadMappingPresets({ maxPresets: 1, maxNameLength: 4, maxBoneNameLength: 8 }).length, 1);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previous });
  }
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

function fixtureFigure({ opaque = false, offset = 0 } = {}) {
  const root = new THREE.Group();
  const aliases = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'];
  const names = opaque ? aliases.map((_, index) => `rigbone_${String(index + 1).padStart(2, '0')}`) : aliases;
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
  root.position.set(5 + offset, -3, 2);
  root.scale.setScalar(2);
  return { scene: root, bones, mesh, names };
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
    assetRef: { assetId: 'B'.repeat(64), skeletonSelector: 'poseman-skeleton-v1-abc123', mapping: { hips: 'Hips', __proto__: 'bad', chest: 'Chest' } },
    license: { licenseType: 'cc-by-4.0', assetName: 'A', author: 'B', source: 'https://example.test/a', confirmed: true },
  };
  const safe = sanitizeFigureRecord(source, (pose) => pose);
  assert.equal(safe.assetRef.assetId, 'b'.repeat(64));
  assert.equal(safe.assetRef.mapping.chest, 'Chest');
  assert.equal(safe.assetRef.skeletonSelector, 'poseman-skeleton-v1-abc123');
  assert.equal(Object.hasOwn(safe.assetRef.mapping, '__proto__'), false);
  assert.equal(safe.license.source, 'https://example.test/a');
  assert.equal(sanitizeAssetRef({ assetId: 'constructor' }), null);
  const fake = { female: false, appearance: {}, group: { position: { x: 0, y: 0, z: 0 } }, assetRef: safe.assetRef, license: safe.license };
  const record = serializeFigureRecord(fake, { hips: [0, 0, 0] });
  assert.equal(record.assetRef.assetId, 'b'.repeat(64));
  assert.equal(record.assetRef.skeletonSelector, 'poseman-skeleton-v1-abc123');
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
