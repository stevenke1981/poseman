import { buildProp } from './props.js';
import { scene } from './scene.js';
import { state } from './state.js';
import { transform } from './interaction.js';

export const props = [];

export function addProp(type, saved = null) {
  const group = buildProp(type);
  if (!group) return null;
  const entry = { type, group, meshes: [] };
  group.traverse((o) => {
    if (o.isMesh) {
      o.userData.prop = entry;
      entry.meshes.push(o);
    }
  });
  group.position.x = Number.isFinite(saved?.x) ? saved.x : ((props.length % 3) - 1) * 0.7;
  group.position.y = Number.isFinite(saved?.y) ? saved.y : 0;
  group.position.z = Number.isFinite(saved?.z) ? saved.z : 1.1;
  group.rotation.y = Number.isFinite(saved?.rotY) ? saved.rotY : 0;
  scene.add(group);
  props.push(entry);
  state.selectedProp = entry;
  return entry;
}

export function removeProp(entry) {
  const i = props.indexOf(entry);
  if (i < 0) return;
  if (transform.object === entry.group) transform.detach();
  scene.remove(entry.group);
  props.splice(i, 1);
  if (state.selectedProp === entry) state.selectedProp = null;
}
