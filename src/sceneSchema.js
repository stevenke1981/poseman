import { sanitizeAppearance } from './mannequin.js';

export const SCENE_VERSION = 3;
export const PROP_SCALE_MIN = 0.25;
export const PROP_SCALE_MAX = 3;

export function canRemoveFigure(count) {
  return Number.isInteger(count) && count > 1;
}

export function sceneSnapshotsDiffer(before, after) {
  if (typeof before === 'string' && typeof after === 'string') return before !== after;
  return JSON.stringify(before) !== JSON.stringify(after);
}

function finiteOrNull(value) {
  try {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function clampPropScale(value) {
  let n;
  try {
    n = Number(value);
  } catch {
    n = NaN;
  }
  if (!Number.isFinite(n)) return 1;
  return Math.min(PROP_SCALE_MAX, Math.max(PROP_SCALE_MIN, n));
}

export function normalizePropRotation(value) {
  let n;
  try {
    n = Number(value);
  } catch {
    n = NaN;
  }
  if (!Number.isFinite(n)) return 0;
  // Keep the serialized value bounded even when a hand-edited file contains
  // a very large angle.  Three.js accepts any finite angle, but a finite
  // canonical range makes round-trips predictable and prevents NaN leakage.
  const wrapped = ((n + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return wrapped;
}

// Pure scene-file helpers keep persistence contracts testable without
// constructing the browser/WebGL scene.
export function serializeFigureRecord(figure, pose) {
  return {
    female: Boolean(figure.female),
    appearance: sanitizeAppearance(figure.appearance),
    x: figure.group.position.x,
    y: figure.group.position.y,
    z: figure.group.position.z,
    pose,
  };
}

export function captureFigureRebuildState(figure, pose) {
  return {
    female: Boolean(figure?.female),
    appearance: sanitizeAppearance(figure?.appearance),
    position: {
      x: finiteOrNull(figure?.group?.position?.x) ?? 0,
      y: finiteOrNull(figure?.group?.position?.y) ?? 0,
      z: finiteOrNull(figure?.group?.position?.z) ?? 0,
    },
    pose: pose && typeof pose === 'object' ? pose : {},
  };
}

export function sanitizeFigureRecord(raw, sanitizePose = () => ({})) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    female: Boolean(source.female),
    appearance: sanitizeAppearance(source.appearance),
    x: finiteOrNull(source.x),
    y: finiteOrNull(source.y),
    z: finiteOrNull(source.z),
    pose: sanitizePose(source.pose),
  };
}

export function serializePropRecord(prop) {
  return {
    type: typeof prop?.type === 'string' ? prop.type : '',
    x: finiteOrNull(prop?.group?.position?.x),
    y: finiteOrNull(prop?.group?.position?.y),
    z: finiteOrNull(prop?.group?.position?.z),
    rotY: normalizePropRotation(prop?.group?.rotation?.y),
    scale: clampPropScale(prop?.group?.scale?.x),
  };
}

export function sanitizePropRecord(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    type: Object.hasOwn(source, 'type') && typeof source.type === 'string' ? source.type : '',
    x: finiteOrNull(source.x),
    y: finiteOrNull(source.y),
    z: finiteOrNull(source.z),
    rotY: normalizePropRotation(source.rotY),
    // v1/v2 records did not carry scale; the safe migration default is 1.
    scale: clampPropScale(source.scale),
  };
}
