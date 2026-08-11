import { grid } from './scene.js';
import { state } from './state.js';
import { figures, addFigure, setActiveFigure, extractPose } from './figures.js';
import { props, addProp } from './propsManager.js';
import { transform } from './interaction.js';
import { JOINT_NAMES } from './mannequin.js';
import { PROP_TYPES } from './props.js';
import { gridToggle } from './dom.js';

const STORAGE_KEY = 'poseman-scene-v1';
const SCENE_VERSION = 1;

export function serializeScene() {
  return {
    version: SCENE_VERSION,
    grid: grid.visible,
    figures: figures.map((f) => ({
      female: f.female,
      x: f.group.position.x,
      y: f.group.position.y,
      z: f.group.position.z,
      pose: extractPose(f),
    })),
    props: props.map((p) => ({
      type: p.type,
      x: p.group.position.x,
      y: p.group.position.y,
      z: p.group.position.z,
      rotY: p.group.rotation.y,
    })),
  };
}

// ---------------------------------------------------------------- validation (T1-3)
function finiteOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function sanitizePose(pose) {
  const out = {};
  if (!pose || typeof pose !== 'object' || Array.isArray(pose)) return out;
  for (const [name, rot] of Object.entries(pose)) {
    if (!JOINT_NAMES.includes(name) || !Array.isArray(rot)) continue;
    const r = rot.slice(0, 3).map(Number);
    if (r.length === 3 && r.every(Number.isFinite)) out[name] = r;
  }
  return out;
}

export function applyScene(data) {
  transform.detach();
  for (const f of figures) {
    // NOTE: never dispose geometries/materials here — they are shared caches in parts.js.
    f.group.removeFromParent();
  }
  figures.length = 0;
  for (const p of props) p.group.removeFromParent();
  props.length = 0;
  state.selectedProp = null;

  const version = Number(data?.version) || 1;
  if (version > SCENE_VERSION) {
    console.warn(
      `PoseMan: 場景版本 ${version} 新於支援版本 ${SCENE_VERSION}，以最佳相容方式載入。`,
    );
  }
  // Migration skeleton for future scene versions:
  // switch (version) { case 1: break; ... }

  const rawFigs = Array.isArray(data?.figures)
    ? data.figures.filter((f) => f && typeof f === 'object')
    : [];
  if (rawFigs.length) {
    for (const fd of rawFigs) {
      const m = addFigure(Boolean(fd.female));
      const x = finiteOrNull(fd.x);
      const y = finiteOrNull(fd.y);
      const z = finiteOrNull(fd.z);
      if (x !== null) m.group.position.x = x;
      if (y !== null) m.group.position.y = y;
      if (z !== null) m.group.position.z = z;
      const pose = sanitizePose(fd.pose);
      if (Object.keys(pose).length) m.setPose(pose);
    }
  } else {
    addFigure(false).group.position.x = -0.4;
    addFigure(true).group.position.x = 0.4;
  }

  const rawProps = Array.isArray(data?.props)
    ? data.props.filter((p) => p && typeof p === 'object' && PROP_TYPES[p.type])
    : [];
  for (const pd of rawProps) addProp(pd.type, pd);

  gridToggle.checked = data?.grid !== false;
  grid.visible = gridToggle.checked;
  setActiveFigure(figures[0]);
}

export function saveScene() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeScene()));
  } catch {
    /* storage unavailable (private mode / quota) */
  }
}

let saveTimer = 0;
export function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveScene, 250);
}

export function loadStoredScene() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    /* corrupt storage: fall back to defaults */
  }
  applyScene(stored);
}

window.addEventListener('pagehide', saveScene);
