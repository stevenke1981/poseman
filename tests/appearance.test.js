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
} from '../src/sceneSchema.js';

test('appearance sanitizer accepts finite options and rejects prototype keys', () => {
  assert.deepEqual(sanitizeAppearance({ skinTone: 'deep', outfit: 'sage' }), {
    skinTone: 'deep',
    outfit: 'sage',
  });
  assert.deepEqual(sanitizeAppearance({ skin: 'tan', style: 'terracotta' }), {
    skinTone: 'tan',
    outfit: 'terracotta',
  });
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
    assert.deepEqual(roundTrip.appearance, { skinTone: 'tan', outfit: 'graphite' });
    assert.deepEqual([roundTrip.x, roundTrip.y, roundTrip.z], [1.1, 0.4, -0.8]);
    assert.deepEqual(roundTrip.pose, source.pose);
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
