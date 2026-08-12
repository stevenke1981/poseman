import * as THREE from 'three';
import { buildMannequin, DEG, sanitizeAppearance } from './mannequin.js';
import { scene } from './scene.js';
import { state, setSelectedProp } from './state.js';
import { transform } from './interaction.js';
import { canRemoveFigure, captureFigureRebuildState } from './sceneSchema.js';
import {
  figInfo,
  rotX,
  rotY,
  rotZ,
  rotXVal,
  rotYVal,
  rotZVal,
  skinToneSelect,
  outfitSelect,
  bodyProfileSelect,
  hairStyleSelect,
  hairColorSelect,
  eyeColorSelect,
  skinQualitySelect,
  figureSelect,
} from './dom.js';

export const figures = [];
let onFiguresChange = () => {};

export function setFiguresChangeHandler(handler) {
  onFiguresChange = typeof handler === 'function' ? handler : () => {};
  onFiguresChange();
}

function notifyFiguresChange() {
  onFiguresChange();
}

export function extractPose(f) {
  const pose = {};
  for (const [name, j] of Object.entries(f.joints)) {
    pose[name] = [j.rotation.x / DEG, j.rotation.y / DEG, j.rotation.z / DEG];
  }
  return pose;
}

export function syncSliders() {
  if (!state.activeFigure) return;
  const j = state.activeFigure.joints[state.activeJointName];
  const dx = Math.round(j.rotation.x / DEG);
  const dy = Math.round(j.rotation.y / DEG);
  const dz = Math.round(j.rotation.z / DEG);
  rotX.value = THREE.MathUtils.clamp(dx, -180, 180);
  rotY.value = THREE.MathUtils.clamp(dy, -180, 180);
  rotZ.value = THREE.MathUtils.clamp(dz, -180, 180);
  rotXVal.textContent = dx + '°';
  rotYVal.textContent = dy + '°';
  rotZVal.textContent = dz + '°';
}

export function setActiveFigure(f) {
  state.activeFigure = f;
  setSelectedProp(null);
  notifyFiguresChange();
  if (!f) return;
  const idx = figures.indexOf(f);
  figInfo.textContent = f.imported || f.externalPending
    ? `人物 ${idx + 1} / ${figures.length} ・ ${f.externalPending ? '外部載入中' : '外部 GLB'}`
    : `人物 ${idx + 1} / ${figures.length} ・ ${f.female ? '女' : '男'}`;
  if (figureSelect) figureSelect.value = String(idx);
  const appearance = sanitizeAppearance(f.appearance);
  skinToneSelect.value = appearance.skinTone;
  outfitSelect.value = appearance.outfit;
  bodyProfileSelect.value = appearance.bodyProfile;
  hairStyleSelect.value = appearance.hairStyle;
  hairColorSelect.value = appearance.hairColor;
  eyeColorSelect.value = appearance.eyeColor;
  skinQualitySelect.value = appearance.skinQuality;
  syncSliders();
}

export function addFigure(female, appearance) {
  const m = buildMannequin({ female, appearance });
  for (const mesh of m.pickMeshes) mesh.userData.figure = m;
  // New figures spawn right of the rightmost one; manual positions are kept.
  const maxX = figures.reduce((a, f) => Math.max(a, f.group.position.x), -0.8);
  m.group.position.x = figures.length ? maxX + 0.8 : 0;
  scene.add(m.group);
  figures.push(m);
  setActiveFigure(m);
  return m;
}

/** Add a validated, owned GLB figure while preserving the mannequin manager API. */
export function addImportedFigure(figure, { assetId, license, assetName, position, pose } = {}) {
  if (!figure?.group || !figure?.joints || !figure?.imported) throw new TypeError('外部人物資料不完整。');
  const maxX = figures.reduce((a, f) => Math.max(a, Number(f?.group?.position?.x) || 0), -0.8);
  const safePosition = position && typeof position === 'object' ? position : {};
  figure.group.position.set(
    Number.isFinite(Number(safePosition.x)) ? Number(safePosition.x) : (figures.length ? maxX + 0.8 : 0),
    Number.isFinite(Number(safePosition.y)) ? Number(safePosition.y) : 0,
    Number.isFinite(Number(safePosition.z)) ? Number(safePosition.z) : 0,
  );
  if (typeof assetId === 'string' && /^[a-f0-9]{64}$/i.test(assetId)) figure.assetRef.assetId = assetId.toLowerCase();
  if (assetName) figure.assetName = String(assetName).slice(0, 120);
  if (license && typeof license === 'object') figure.license = { ...license };
  for (const mesh of figure.pickMeshes || []) mesh.userData.figure = figure;
  scene.add(figure.group);
  figures.push(figure);
  if (pose && typeof pose === 'object') figure.setPose(pose);
  setActiveFigure(figure);
  return figure;
}

/** Replace a temporary external-asset placeholder without changing list order. */
export function replaceFigureAt(index, figure, { assetId, license, assetName, position, pose } = {}) {
  if (!Number.isInteger(index) || !figure?.group || !figure?.imported || !figures[index]) return null;
  const previous = figures[index];
  const wasActive = state.activeFigure === previous;
  const fallback = position && typeof position === 'object' ? position : previous.group.position;
  scene.remove(previous.group);
  previous.dispose?.();
  figure.group.position.set(
    Number.isFinite(Number(fallback.x)) ? Number(fallback.x) : 0,
    Number.isFinite(Number(fallback.y)) ? Number(fallback.y) : 0,
    Number.isFinite(Number(fallback.z)) ? Number(fallback.z) : 0,
  );
  if (assetId) figure.assetRef.assetId = String(assetId).toLowerCase();
  if (assetName) figure.assetName = String(assetName).slice(0, 120);
  if (license && typeof license === 'object') figure.license = { ...license };
  for (const mesh of figure.pickMeshes || []) mesh.userData.figure = figure;
  scene.add(figure.group);
  figures[index] = figure;
  if (pose && typeof pose === 'object') figure.setPose(pose);
  if (transform.object === previous.group) transform.attach(figure.group);
  if (wasActive) setActiveFigure(figure);
  else notifyFiguresChange();
  return figure;
}

/** Rebuild one figure when a geometry-affecting appearance option changes. */
export function rebuildFigure(oldFigure, { female = oldFigure?.female, appearance } = {}) {
  const idx = figures.indexOf(oldFigure);
  if (idx < 0 || !oldFigure) return null;
  const previous = captureFigureRebuildState(oldFigure, extractPose(oldFigure));
  const oldGroup = oldFigure.group;
  const m = buildMannequin({ female: Boolean(female), appearance: appearance || previous.appearance });
  m.setPose(previous.pose);
  m.group.position.set(previous.position.x, previous.position.y, previous.position.z);
  for (const mesh of m.pickMeshes) mesh.userData.figure = m;
  scene.remove(oldGroup);
  oldFigure.dispose?.();
  scene.add(m.group);
  figures[idx] = m;
  if (transform.object === oldGroup) transform.attach(m.group);
  setActiveFigure(m);
  return m;
}

export function removeFigureAt(i) {
  if (!canRemoveFigure(figures.length) || !figures[i]) return;
  const m = figures[i];
  if (transform.object === m.group) transform.detach();
  scene.remove(m.group);
  m.dispose?.();
  figures.splice(i, 1);
  setActiveFigure(
    figures.includes(state.activeFigure) ? state.activeFigure : figures[figures.length - 1],
  );
}

export function removeFigure() {
  const i = figures.indexOf(state.activeFigure);
  removeFigureAt(i >= 0 ? i : figures.length - 1);
}

// ---------------------------------------------------------------- mirror (T2-3)
// Mirror across the character's sagittal plane: rotation.x unchanged,
// rotation.y / rotation.z sign-flipped; L/R joints swapped.
const ARM_PAIRS = [
  ['shoulderL', 'shoulderR'],
  ['elbowL', 'elbowR'],
  ['wristL', 'wristR'],
];
const LEG_PAIRS = [
  ['hipL', 'hipR'],
  ['kneeL', 'kneeR'],
  ['ankleL', 'ankleR'],
];
const CENTER_JOINTS = ['hips', 'spine', 'chest', 'neck', 'head'];

function flipRot(r) {
  return [r[0], -r[1], -r[2]];
}

// scope: 'all' | 'arms' | 'legs'
export function mirroredPose(pose, scope) {
  const out = {};
  for (const [n, r] of Object.entries(pose)) out[n] = r.slice();
  const pairs = scope === 'arms' ? ARM_PAIRS : scope === 'legs' ? LEG_PAIRS : [...ARM_PAIRS, ...LEG_PAIRS];
  for (const [a, b] of pairs) {
    const ra = pose[a] || [0, 0, 0];
    const rb = pose[b] || [0, 0, 0];
    out[a] = flipRot(rb);
    out[b] = flipRot(ra);
  }
  if (scope === 'all') {
    for (const c of CENTER_JOINTS) if (out[c]) out[c] = flipRot(out[c]);
  }
  return out;
}

// dir 'LR': copy left limbs onto right (mirrored); 'RL' the reverse.
export function copiedSidePose(pose, dir) {
  const out = {};
  for (const [n, r] of Object.entries(pose)) out[n] = r.slice();
  for (const [l, r] of [...ARM_PAIRS, ...LEG_PAIRS]) {
    if (dir === 'LR') out[r] = flipRot(pose[l] || [0, 0, 0]);
    else out[l] = flipRot(pose[r] || [0, 0, 0]);
  }
  return out;
}
