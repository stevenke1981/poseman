import * as THREE from 'three';
import { DEG, JOINT_NAMES } from './mannequin.js';
import { PRESETS } from './poses.js';
import { PROP_TYPES } from './props.js';
import { state } from './state.js';
import { figures, addFigure, removeFigureAt, syncSliders } from './figures.js';
import { props, addProp, removeProp } from './propsManager.js';
import { transform } from './interaction.js';
import { scheduleSave } from './persistence.js';
import { beginGesture, endGesture } from './history.js';

function selectedInfo() {
  const group = transform.object || (state.selectedProp && state.selectedProp.group);
  if (!group) return null;
  const pos = {
    x: +group.position.x.toFixed(2),
    y: +group.position.y.toFixed(2),
    z: +group.position.z.toFixed(2),
  };
  const fi = figures.findIndex((f) => f.group === group);
  if (fi >= 0) return { kind: 'figure', figure: fi, ...pos };
  const pi = props.findIndex((p) => p.group === group);
  if (pi >= 0) return { kind: 'prop', prop: pi, type: props[pi].type, ...pos };
  return null;
}

export function sceneSnapshot() {
  return {
    selected: selectedInfo(),
    figures: figures.map((f) => ({
      female: f.female,
      x: +f.group.position.x.toFixed(2),
      y: +f.group.position.y.toFixed(2),
      z: +f.group.position.z.toFixed(2),
      joints: Object.fromEntries(
        Object.entries(f.joints)
          .map(([n, j]) => [
            n,
            [
              Math.round(j.rotation.x / DEG),
              Math.round(j.rotation.y / DEG),
              Math.round(j.rotation.z / DEG),
            ],
          ])
          .filter(([, r]) => r.some((v) => v !== 0)),
      ),
    })),
    props: props.map((p) => ({
      type: p.type,
      x: +p.group.position.x.toFixed(2),
      y: +p.group.position.y.toFixed(2),
      z: +p.group.position.z.toFixed(2),
      rotY: Math.round(p.group.rotation.y / DEG),
    })),
  };
}

// ---------------------------------------------------------------- action validation (T1-4)
const clampDeg = (v) => THREE.MathUtils.clamp(Number(v) || 0, -180, 180);

function figureIndex(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n < figures.length ? n : -1;
}

function propIndex(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n < props.length ? n : -1;
}

export function applyActions(actions) {
  const skipped = [];
  let applied = 0;
  if (!Array.isArray(actions)) return { applied, skipped: ['actions 不是陣列'] };
  beginGesture();
  actions.forEach((a, i) => {
    const skip = (msg) => skipped.push(`#${i + 1} ${a?.op ?? '?'}：${msg}`);
    if (!a || typeof a !== 'object') return skip('格式無效');
    switch (a.op) {
      case 'setJoint': {
        const f = figures[figureIndex(a.figure)];
        if (!f) return skip(`找不到人物 ${a.figure}`);
        const j = f.joints[a.joint];
        if (!JOINT_NAMES.includes(a.joint) || !j) return skip(`未知關節 ${a.joint}`);
        if (!Array.isArray(a.rot)) return skip('rot 需為 [x,y,z]');
        j.rotation.set(clampDeg(a.rot[0]) * DEG, clampDeg(a.rot[1]) * DEG, clampDeg(a.rot[2]) * DEG);
        applied++;
        break;
      }
      case 'addJoint': {
        const f = figures[figureIndex(a.figure)];
        if (!f) return skip(`找不到人物 ${a.figure}`);
        const j = f.joints[a.joint];
        if (!JOINT_NAMES.includes(a.joint) || !j) return skip(`未知關節 ${a.joint}`);
        if (!Array.isArray(a.delta)) return skip('delta 需為 [x,y,z]');
        j.rotation.x += clampDeg(a.delta[0]) * DEG;
        j.rotation.y += clampDeg(a.delta[1]) * DEG;
        j.rotation.z += clampDeg(a.delta[2]) * DEG;
        applied++;
        break;
      }
      case 'preset': {
        const f = figures[figureIndex(a.figure)];
        if (!f) return skip(`找不到人物 ${a.figure}`);
        if (!PRESETS[a.preset]) return skip(`未知姿勢範本 ${a.preset}`);
        f.setPose(PRESETS[a.preset]);
        applied++;
        break;
      }
      case 'resetPose': {
        const f = figures[figureIndex(a.figure)];
        if (!f) return skip(`找不到人物 ${a.figure}`);
        f.resetPose();
        applied++;
        break;
      }
      case 'moveFigure': {
        const f = figures[figureIndex(a.figure)];
        if (!f) return skip(`找不到人物 ${a.figure}`);
        if (Number.isFinite(a.x)) f.group.position.x = THREE.MathUtils.clamp(a.x, -10, 10);
        if (Number.isFinite(a.y)) f.group.position.y = THREE.MathUtils.clamp(a.y, 0, 10);
        if (Number.isFinite(a.z)) f.group.position.z = THREE.MathUtils.clamp(a.z, -10, 10);
        applied++;
        break;
      }
      case 'addFigure':
        addFigure(Boolean(a.female));
        applied++;
        break;
      case 'removeFigure': {
        const i = figureIndex(a.figure);
        if (i < 0) return skip(`找不到人物 ${a.figure}`);
        if (figures.length <= 1) return skip('至少需保留一個人物');
        removeFigureAt(i);
        applied++;
        break;
      }
      case 'addProp':
        if (!PROP_TYPES[a.type]) return skip(`未知物品類型 ${a.type}`);
        addProp(a.type, a);
        applied++;
        break;
      case 'moveProp': {
        const p = props[propIndex(a.prop)];
        if (!p) return skip(`找不到物品 ${a.prop}`);
        if (Number.isFinite(a.x)) p.group.position.x = THREE.MathUtils.clamp(a.x, -10, 10);
        if (Number.isFinite(a.y)) p.group.position.y = THREE.MathUtils.clamp(a.y, 0, 10);
        if (Number.isFinite(a.z)) p.group.position.z = THREE.MathUtils.clamp(a.z, -10, 10);
        applied++;
        break;
      }
      case 'rotateProp': {
        const p = props[propIndex(a.prop)];
        if (!p) return skip(`找不到物品 ${a.prop}`);
        p.group.rotation.y += (Number(a.deg) || 45) * DEG;
        applied++;
        break;
      }
      case 'removeProp': {
        const p = props[propIndex(a.prop)];
        if (!p) return skip(`找不到物品 ${a.prop}`);
        removeProp(p);
        applied++;
        break;
      }
      default:
        skip(`未知動作 ${a.op}`);
    }
  });
  endGesture();
  if (applied) {
    syncSliders();
    scheduleSave();
  }
  return { applied, skipped };
}
