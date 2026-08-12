import { sanitizeAppearance } from './mannequin.js';

export const SCENE_VERSION = 2;

function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
