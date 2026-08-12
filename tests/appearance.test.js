import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  buildMannequin,
  DEFAULT_APPEARANCE,
  sanitizeAppearance,
} from '../src/mannequin.js';
import {
  sanitizeFigureRecord,
  serializeFigureRecord,
  sanitizePropRecord,
  serializePropRecord,
  clampPropScale,
  normalizePropRotation,
  canRemoveFigure,
  captureFigureRebuildState,
  sceneSnapshotsDiffer,
  SCENE_VERSION,
} from '../src/sceneSchema.js';
import { buildProp, hasPropType } from '../src/props.js';
import { chooseTransformTarget } from '../src/state.js';

test('appearance sanitizer accepts finite options and rejects prototype keys', () => {
  assert.deepEqual(sanitizeAppearance({ skinTone: 'deep', outfit: 'sage' }), {
    skinTone: 'deep',
    outfit: 'sage',
    bodyProfile: 'balanced',
    hairStyle: 'short',
    hairColor: 'espresso',
    eyeColor: 'brown',
    skinQuality: 'natural',
  });
  assert.deepEqual(sanitizeAppearance({ skin: 'tan', style: 'terracotta' }), {
    skinTone: 'tan',
    outfit: 'terracotta',
    bodyProfile: 'balanced',
    hairStyle: 'short',
    hairColor: 'espresso',
    eyeColor: 'brown',
    skinQuality: 'natural',
  });
  assert.deepEqual(
    sanitizeAppearance({ bodyProfile: 'athletic', hairStyle: 'long', hairColor: 'auburn' }),
    { ...DEFAULT_APPEARANCE, bodyProfile: 'athletic', hairStyle: 'long', hairColor: 'auburn' },
  );
  assert.deepEqual(
    sanitizeAppearance({ bodyProfile: 'constructor', hairStyle: '__proto__', hairColor: 'toString' }),
    DEFAULT_APPEARANCE,
  );
  const inherited = Object.create({ skinTone: 'deep', bodyProfile: 'athletic' });
  assert.deepEqual(sanitizeAppearance(inherited), DEFAULT_APPEARANCE);
  assert.deepEqual(sanitizeAppearance({ skinTone: '__proto__', outfit: 'constructor' }), DEFAULT_APPEARANCE);
  assert.deepEqual(sanitizeAppearance({ skinTone: 'toString', outfit: 'hasOwnProperty' }), DEFAULT_APPEARANCE);
  assert.deepEqual(sanitizeAppearance(null), DEFAULT_APPEARANCE);
});

test('each figure owns appearance materials and edits stay isolated', () => {
  const first = buildMannequin({ female: false, appearance: { skinTone: 'deep', outfit: 'terracotta' } });
  const second = buildMannequin({ female: true });
  try {
    assert.notEqual(first.pickMeshes[0].material, second.pickMeshes[0].material);
    const secondSkin = second.pickMeshes[0].material.color.getHex();
    first.setAppearance({ skinTone: 'fair', outfit: 'sage' });
    assert.equal(first.appearance.skinTone, 'fair');
    assert.equal(first.appearance.outfit, 'sage');
    assert.equal(second.pickMeshes[0].material.color.getHex(), secondSkin);
  } finally {
    first.dispose();
    second.dispose();
  }
});

test('dispose releases owned materials but never shared geometry', () => {
  const figure = buildMannequin();
  const materials = new Set(figure.pickMeshes.map((mesh) => mesh.material));
  const geometries = new Set(figure.pickMeshes.map((mesh) => mesh.geometry));
  let materialDisposals = 0;
  let geometryDisposals = 0;
  for (const material of materials) material.addEventListener('dispose', () => materialDisposals++);
  for (const geometry of geometries) geometry.addEventListener('dispose', () => geometryDisposals++);
  figure.dispose();
  figure.dispose();
  assert.equal(materialDisposals, materials.size);
  assert.equal(geometryDisposals, 0);
});

test('scan-real PBR face materials and textures stay per-figure', () => {
  const first = buildMannequin({ appearance: { eyeColor: 'blue', skinQuality: 'smooth' } });
  const second = buildMannequin({ appearance: { eyeColor: 'green', skinQuality: 'natural' } });
  try {
    const materials = new Set(first.pickMeshes.map((mesh) => mesh.material));
    assert.ok([...materials].some((material) => material.isMeshPhysicalMaterial && material.clearcoat > 0));
    assert.ok([...materials].some((material) => material.transmission > 0 && material.transparent));
    const maps = [...materials].map((material) => material.map).filter(Boolean);
    assert.ok(maps.length >= 2);
    assert.equal(new Set(maps).size, 1, 'skin map is shared within one figure only');
    const mapBytes = maps[0].image.data;
    const average = mapBytes.reduce((sum, value, index) => (index % 4 === 3 ? sum : sum + value), 0) / (mapBytes.length * 0.75);
    assert.ok(average > 220, `skin map should be near-white variation, average=${average}`);
    assert.notEqual(maps[0], new Set(second.pickMeshes.map((mesh) => mesh.material.map).filter(Boolean)).values().next().value);
    assert.ok(first.pickMeshes.length < 180, `pick mesh count ${first.pickMeshes.length} should stay interactive`);
  } finally {
    first.dispose();
    second.dispose();
  }
});

test('owned procedural textures dispose once and shared geometry survives', () => {
  const figure = buildMannequin({ appearance: { skinQuality: 'smooth' } });
  const textures = new Set(figure.pickMeshes.map((mesh) => mesh.material.map).filter(Boolean));
  const geometries = new Set(figure.pickMeshes.map((mesh) => mesh.geometry));
  let textureDisposals = 0;
  let geometryDisposals = 0;
  for (const texture of textures) texture.addEventListener('dispose', () => textureDisposals++);
  for (const geometry of geometries) geometry.addEventListener('dispose', () => geometryDisposals++);
  figure.dispose();
  figure.dispose();
  assert.equal(textureDisposals, textures.size);
  assert.equal(geometryDisposals, 0);
});

test('legacy figure and v2 scene record round-trip preserve safe appearance', () => {
  const legacy = sanitizeFigureRecord(
    { female: true, x: '1.25', y: 'bad', z: -0.5, pose: { chest: [8, 0, 0] } },
    (pose) => pose,
  );
  assert.deepEqual(legacy.appearance, DEFAULT_APPEARANCE);
  assert.equal(legacy.x, 1.25);
  assert.equal(legacy.y, null);
  assert.deepEqual(legacy.pose, { chest: [8, 0, 0] });

  const figure = buildMannequin({ female: false, appearance: { skinTone: 'tan', outfit: 'graphite' } });
  figure.group.position.set(1.1, 0.4, -0.8);
  try {
    const source = serializeFigureRecord(figure, { chest: [12, -3, 7] });
    const container = JSON.parse(JSON.stringify({ version: 2, figures: [source] }));
    assert.equal(container.version, 2);
    const roundTrip = sanitizeFigureRecord(container.figures[0], (pose) => pose);
    assert.deepEqual(roundTrip.appearance, {
      skinTone: 'tan',
      outfit: 'graphite',
      bodyProfile: 'balanced',
      hairStyle: 'short',
      hairColor: 'espresso',
      eyeColor: 'brown',
      skinQuality: 'natural',
    });
    assert.deepEqual([roundTrip.x, roundTrip.y, roundTrip.z], [1.1, 0.4, -0.8]);
    assert.deepEqual(roundTrip.pose, source.pose);
  } finally {
    figure.dispose();
  }
});

test('v4 eye color and skin quality round-trip while v1-v3 default safely', () => {
  const figure = buildMannequin({ appearance: { eyeColor: 'gray', skinQuality: 'smooth' } });
  try {
    const source = serializeFigureRecord(figure, { head: [2, 0, 0] });
    const restored = sanitizeFigureRecord(source, (pose) => pose);
    assert.equal(restored.appearance.eyeColor, 'gray');
    assert.equal(restored.appearance.skinQuality, 'smooth');
    const legacy = sanitizeFigureRecord({ female: false, appearance: { eyeColor: 'constructor' } }, (pose) => pose);
    assert.equal(legacy.appearance.eyeColor, DEFAULT_APPEARANCE.eyeColor);
    assert.equal(legacy.appearance.skinQuality, DEFAULT_APPEARANCE.skinQuality);
  } finally {
    figure.dispose();
  }
});

test('gender rebuild smoke retains pose, position, and appearance', () => {
  const pose = { head: [15, -4, 2], wristL: [-20, 0, 8] };
  const oldFigure = buildMannequin({ female: false, appearance: { skinTone: 'deep', outfit: 'sage' } });
  const nextFigure = buildMannequin({ female: !oldFigure.female, appearance: oldFigure.appearance });
  try {
    oldFigure.group.position.set(-0.75, 0.3, 1.2);
    oldFigure.setPose(pose);
    nextFigure.group.position.copy(oldFigure.group.position);
    nextFigure.setPose(pose);
    assert.equal(nextFigure.female, true);
    assert.deepEqual(nextFigure.appearance, oldFigure.appearance);
    assert.deepEqual(nextFigure.group.position.toArray(), oldFigure.group.position.toArray());
    assert.equal(nextFigure.joints.head.rotation.x, oldFigure.joints.head.rotation.x);
    assert.equal(nextFigure.joints.wristL.rotation.z, oldFigure.joints.wristL.rotation.z);
  } finally {
    oldFigure.dispose();
    nextFigure.dispose();
  }
});

test('default mannequin feet remain above ground plane', () => {
  for (const female of [false, true]) {
    const figure = buildMannequin({ female });
    try {
      figure.group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(figure.group);
      assert.ok(box.min.y >= 0.005, `${female ? 'female' : 'male'} min.y=${box.min.y}`);
    } finally {
      figure.dispose();
    }
  }
});

test('body profile and hair options produce safe, distinct rebuilds', () => {
  const base = buildMannequin({
    female: false,
    appearance: { bodyProfile: 'balanced', hairStyle: 'short', hairColor: 'espresso' },
  });
  const variant = buildMannequin({
    female: false,
    appearance: { bodyProfile: 'athletic', hairStyle: 'long', hairColor: 'auburn' },
  });
  try {
    assert.notEqual(base.pickMeshes.length, variant.pickMeshes.length);
    assert.deepEqual(variant.appearance, {
      skinTone: 'warm',
      outfit: 'indigo',
      bodyProfile: 'athletic',
      hairStyle: 'long',
      hairColor: 'auburn',
      eyeColor: 'brown',
      skinQuality: 'natural',
    });
    const baseShoulder = base.joints.shoulderL.position.x;
    const variantShoulder = variant.joints.shoulderL.position.x;
    assert.ok(variantShoulder > baseShoulder);
  } finally {
    base.dispose();
    variant.dispose();
  }
});

test('continuous silhouette uses capsules and restrained joint volumes', () => {
  const figure = buildMannequin();
  try {
    const capsuleCount = figure.pickMeshes.filter((mesh) => mesh.geometry?.type === 'CapsuleGeometry').length;
    assert.ok(capsuleCount >= 20, `expected continuous limb/cloth capsules, got ${capsuleCount}`);
    for (const name of ['shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'kneeL', 'kneeR']) {
      const jointSpheres = figure.joints[name].children.filter((mesh) => mesh.geometry?.type === 'SphereGeometry');
      assert.ok(jointSpheres.every((mesh) => Math.max(mesh.scale.x, mesh.scale.y, mesh.scale.z) <= 1.06), `${name} has oversized visible joint volume`);
    }
  } finally {
    figure.dispose();
  }
});

test('prop v1/v2 defaults and v5 round-trip sanitize scale and rotation', () => {
  assert.equal(SCENE_VERSION, 5);
  assert.deepEqual(sanitizePropRecord({ type: 'chair', x: 1, rotY: 0 }), {
    type: 'chair', x: 1, y: null, z: null, rotY: 0, scale: 1,
  });
  assert.equal(clampPropScale(-50), 0.25);
  assert.equal(clampPropScale(99), 3);
  const group = new THREE.Group();
  group.position.set(1.2, 0.4, -0.8);
  group.rotation.y = 7;
  group.scale.setScalar(1.45);
  const source = serializePropRecord({ type: 'sofa', group });
  assert.equal(source.type, 'sofa');
  assert.equal(source.scale, 1.45);
  const roundTrip = sanitizePropRecord(JSON.parse(JSON.stringify(source)));
  assert.deepEqual(roundTrip, { type: 'sofa', x: 1.2, y: 0.4, z: -0.8, rotY: 7 - Math.PI * 2, scale: 1.45 });
});

test('prop catalog rejects prototype keys without throwing', () => {
  for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal(hasPropType(key), false);
    assert.doesNotThrow(() => buildProp(key));
    assert.equal(buildProp(key), null);
  }
  assert.ok(buildProp('sofa'));
});

test('prop rotation stays canonical after repeated turns', () => {
  const deg = (value) => (value * Math.PI) / 180;
  assert.equal(Math.round((normalizePropRotation(deg(225)) * 180) / Math.PI), -135);
  assert.equal(Math.round((normalizePropRotation(deg(-225)) * 180) / Math.PI), 135);
  assert.equal(Math.round((normalizePropRotation(deg(180)) * 180) / Math.PI), -180);
});

test('scene helpers cover manager guard, rebuild payload, and history change decision', () => {
  assert.equal(canRemoveFigure(0), false);
  assert.equal(canRemoveFigure(1), false);
  assert.equal(canRemoveFigure(2), true);
  const figure = buildMannequin({ female: true, appearance: { bodyProfile: 'slender', hairStyle: 'bob' } });
  try {
    figure.group.position.set(1.2, 0.4, -0.8);
    const payload = captureFigureRebuildState(figure, { chest: [3, 4, 5] });
    assert.deepEqual(payload.position, { x: 1.2, y: 0.4, z: -0.8 });
    assert.equal(payload.female, true);
    assert.equal(payload.appearance.bodyProfile, 'slender');
    assert.deepEqual(payload.pose, { chest: [3, 4, 5] });
  } finally {
    figure.dispose();
  }
  assert.equal(sceneSnapshotsDiffer({ figures: [] }, { figures: [] }), false);
  assert.equal(sceneSnapshotsDiffer({ figures: [] }, { figures: [{}] }), true);
});

test('transform target helper prefers selected prop in move mode and detaches otherwise', () => {
  const figure = { group: { id: 'figure' } };
  const prop = { group: { id: 'prop' } };
  assert.equal(chooseTransformTarget({ moveMode: false, activeFigure: figure }), null);
  assert.equal(chooseTransformTarget({ moveMode: true, activeFigure: figure }).id, 'figure');
  assert.equal(chooseTransformTarget({ moveMode: true, activeFigure: figure, selectedProp: prop }).id, 'prop');
});
