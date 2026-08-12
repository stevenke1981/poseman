import { buildProp } from './props.js';
import { scene } from './scene.js';
import { state, setSelectedProp } from './state.js';
import { transform } from './interaction.js';
import { sanitizePropRecord, normalizePropRotation } from './sceneSchema.js';

export const props = [];
let onPropsChange = () => {};

export function setPropsChangeHandler(handler) {
  onPropsChange = typeof handler === 'function' ? handler : () => {};
  onPropsChange();
}

export function notifyPropsChange(meta = undefined) {
  onPropsChange(meta);
}

export function setActiveProp(entry) {
  setSelectedProp(props.includes(entry) ? entry : null);
  notifyPropsChange();
  return state.selectedProp;
}

export function addProp(type, saved = null, { select = true, notify = true } = {}) {
  const group = buildProp(type);
  if (!group) return null;
  const normalized = sanitizePropRecord({ type, ...(saved || {}) });
  const entry = { type, group, meshes: [] };
  group.traverse((o) => {
    if (o.isMesh) {
      o.userData.prop = entry;
      entry.meshes.push(o);
    }
  });
  group.position.x = Number.isFinite(normalized.x) ? normalized.x : ((props.length % 3) - 1) * 0.7;
  group.position.y = Number.isFinite(normalized.y) ? normalized.y : 0;
  group.position.z = Number.isFinite(normalized.z) ? normalized.z : 1.1;
  group.rotation.y = normalizePropRotation(normalized.rotY);
  group.scale.setScalar(normalized.scale);
  scene.add(group);
  props.push(entry);
  // Interactive additions become the current target. Bulk scene restore can
  // opt out so loading a scene does not expand the props panel or enable its
  // controls before the user explicitly selects an item.
  if (select) setSelectedProp(entry);
  if (notify) notifyPropsChange();
  return entry;
}

export function removeProp(entry) {
  const i = props.indexOf(entry);
  if (i < 0) return;
  if (transform.object === entry.group) transform.detach();
  scene.remove(entry.group);
  props.splice(i, 1);
  if (state.selectedProp === entry) setActiveProp(null);
  else notifyPropsChange();
}
