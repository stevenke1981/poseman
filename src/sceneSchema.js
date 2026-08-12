import { sanitizeAppearance } from './mannequin.js';

// v5 adds portable external-asset references.  Binary GLB payloads never enter
// scene JSON; they live in IndexedDB and are addressed by SHA-256 asset id.
// v1-v4 records remain readable with the same appearance/prop defaults.
export const SCENE_VERSION = 5;
export const PROP_SCALE_MIN = 0.25;
export const PROP_SCALE_MAX = 3;

const ASSET_ID = /^[a-f0-9]{64}$/i;
const SAFE_LICENSE_TYPES = new Set(['own', 'cc0', 'cc-by-4.0', 'other']);

function safeText(value, max = 500) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';
}

export function sanitizeLicenseRecord(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const rawLicenseType = Object.hasOwn(source, 'licenseType') ? source.licenseType : undefined;
  const licenseType = typeof rawLicenseType === 'string' && SAFE_LICENSE_TYPES.has(rawLicenseType)
    ? rawLicenseType
    : 'other';
  const url = safeText(Object.hasOwn(source, 'source') ? source.source : '', 500);
  let safeUrl = '';
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && parsed.hostname && !parsed.username && !parsed.password) safeUrl = url;
    } catch {
      safeUrl = '';
    }
  }
  return {
    licenseType,
    assetName: safeText(Object.hasOwn(source, 'assetName') ? source.assetName : '', 120),
    author: safeText(Object.hasOwn(source, 'author') ? source.author : '', 160),
    source: safeUrl,
    notes: safeText(Object.hasOwn(source, 'notes') ? source.notes : '', 500),
    confirmed: Object.hasOwn(source, 'confirmed') && source.confirmed === true,
  };
}

export function sanitizeAssetRef(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const rawAssetId = Object.hasOwn(source, 'assetId') ? source.assetId : undefined;
  const assetId = typeof rawAssetId === 'string' && ASSET_ID.test(rawAssetId) ? rawAssetId.toLowerCase() : '';
  const mapping = {};
  const rawMapping = Object.hasOwn(source, 'mapping') ? source.mapping : null;
  if (rawMapping && typeof rawMapping === 'object' && !Array.isArray(rawMapping)) {
    for (const name of ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'wristL', 'wristR', 'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR']) {
      const value = Object.hasOwn(rawMapping, name) ? rawMapping[name] : undefined;
      if (typeof value === 'string' && value.length > 0 && value.length <= 160) mapping[name] = value;
    }
  }
  return assetId ? { assetId, mapping } : null;
}

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
  const record = {
    female: Boolean(figure.female),
    appearance: sanitizeAppearance(figure.appearance),
    x: figure.group.position.x,
    y: figure.group.position.y,
    z: figure.group.position.z,
    pose,
  };
  if (figure?.assetRef?.assetId) {
    const assetRef = sanitizeAssetRef(figure.assetRef);
    if (assetRef) {
      record.assetRef = assetRef;
      record.license = sanitizeLicenseRecord(figure.license || {
        assetName: figure.assetName,
      });
    }
  }
  return record;
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
  const record = {
    female: Object.hasOwn(source, 'female') && Boolean(source.female),
    appearance: sanitizeAppearance(Object.hasOwn(source, 'appearance') ? source.appearance : undefined),
    x: finiteOrNull(Object.hasOwn(source, 'x') ? source.x : undefined),
    y: finiteOrNull(Object.hasOwn(source, 'y') ? source.y : undefined),
    z: finiteOrNull(Object.hasOwn(source, 'z') ? source.z : undefined),
    pose: sanitizePose(Object.hasOwn(source, 'pose') ? source.pose : undefined),
  };
  const assetRef = sanitizeAssetRef(Object.hasOwn(source, 'assetRef') ? source.assetRef : undefined);
  if (assetRef) {
    record.assetRef = assetRef;
    record.license = sanitizeLicenseRecord(Object.hasOwn(source, 'license') ? source.license : undefined);
  }
  return record;
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
