import { grid } from './scene.js';
import { figures, addFigure, setActiveFigure, extractPose } from './figures.js';
import { props, addProp, setActiveProp, notifyPropsChange } from './propsManager.js';
import { transform } from './interaction.js';
import { JOINT_NAMES } from './mannequin.js';
import { hasPropType } from './props.js';
import { gridToggle } from './dom.js';
import {
  SCENE_VERSION,
  serializeFigureRecord,
  sanitizeFigureRecord,
  serializePropRecord,
  sanitizePropRecord,
} from './sceneSchema.js';

const STORAGE_KEY = 'poseman-scene-v1';

export function serializeScene() {
  return {
    version: SCENE_VERSION,
    grid: grid.visible,
    figures: figures.map((f) => serializeFigureRecord(f, extractPose(f))),
    props: props.map(serializePropRecord),
  };
}

// ---------------------------------------------------------------- validation (T1-3)
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
    // Geometry remains in the shared cache; dispose only this figure's owned materials.
    f.group.removeFromParent();
    f.dispose?.();
  }
  figures.length = 0;
  for (const p of props) p.group.removeFromParent();
  props.length = 0;
  setActiveProp(null);

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
      const normalized = sanitizeFigureRecord(fd, sanitizePose);
      const m = addFigure(normalized.female, normalized.appearance);
      if (normalized.x !== null) m.group.position.x = normalized.x;
      if (normalized.y !== null) m.group.position.y = normalized.y;
      if (normalized.z !== null) m.group.position.z = normalized.z;
      const pose = normalized.pose;
      if (Object.keys(pose).length) m.setPose(pose);
    }
  } else {
    addFigure(false).group.position.x = -0.4;
    addFigure(true).group.position.x = 0.4;
  }

  const rawProps = Array.isArray(data?.props)
    ? data.props
        .map(sanitizePropRecord)
        .filter((p) => hasPropType(p.type))
    : [];
  // Restore props without selecting the last record. Selection is transient
  // UI state and a freshly loaded scene should keep the default panel sections
  // collapsed until the user chooses an item.
  for (const pd of rawProps) addProp(pd.type, pd, { select: false, notify: false });

  gridToggle.checked = data?.grid !== false;
  grid.visible = gridToggle.checked;
  setActiveFigure(figures[0]);
  // Bulk scene replacement bypasses individual UI events while clearing and
  // rebuilding arrays; force the manager callback once more so empty scenes
  // cannot leave stale prop options or enabled controls behind.
  notifyPropsChange({ bulk: true });
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
