import * as THREE from 'three';
import { buildMannequin, DEG } from './mannequin.js';
import { scene } from './scene.js';
import { state } from './state.js';
import { transform } from './interaction.js';
import { figInfo, rotX, rotY, rotZ, rotXVal, rotYVal, rotZVal } from './dom.js';

export const figures = [];

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
  const idx = figures.indexOf(f);
  figInfo.textContent = `人物 ${idx + 1} / ${figures.length} ・ ${f.female ? '女' : '男'}`;
  syncSliders();
}

export function addFigure(female) {
  const m = buildMannequin({ female });
  for (const mesh of m.pickMeshes) mesh.userData.figure = m;
  // New figures spawn right of the rightmost one; manual positions are kept.
  const maxX = figures.reduce((a, f) => Math.max(a, f.group.position.x), -0.8);
  m.group.position.x = figures.length ? maxX + 0.8 : 0;
  scene.add(m.group);
  figures.push(m);
  setActiveFigure(m);
  return m;
}

export function removeFigureAt(i) {
  if (figures.length <= 1 || !figures[i]) return;
  const m = figures[i];
  if (transform.object === m.group) transform.detach();
  scene.remove(m.group);
  figures.splice(i, 1);
  setActiveFigure(
    figures.includes(state.activeFigure) ? state.activeFigure : figures[figures.length - 1],
  );
}

export function removeFigure() {
  removeFigureAt(figures.length - 1);
}
