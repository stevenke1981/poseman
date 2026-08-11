import './style.css';
import * as THREE from 'three';
import {
  renderer,
  scene,
  camera,
  indicator,
  groundMark,
  markYPos,
  labelSprite,
  updateMarkLabel,
  figBox,
  propBox,
} from './scene.js';
import { state } from './state.js';
import { transform } from './interaction.js';
import { loadStoredScene } from './persistence.js';
import { syncHistory } from './history.js';
import { figures } from './figures.js';
import { props } from './propsManager.js';
import { JOINT_LABELS } from './mannequin.js';
import { PROP_TYPES } from './props.js';
import { selInfo } from './dom.js';
import './ui.js';

// ---------------------------------------------------------------- boot
loadStoredScene();
syncHistory();

// ---------------------------------------------------------------- resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- render loop
const tmpV = new THREE.Vector3();
let lastSelText = null;
function tick() {
  requestAnimationFrame(tick);
  if (state.previewMode) {
    indicator.visible = false;
  } else if (state.selectedProp) {
    indicator.position.set(
      state.selectedProp.group.position.x,
      0.12,
      state.selectedProp.group.position.z,
    );
    indicator.visible = true;
  } else if (state.activeFigure && state.activeFigure.joints[state.activeJointName]) {
    state.activeFigure.joints[state.activeJointName].getWorldPosition(tmpV);
    indicator.position.copy(tmpV);
    indicator.visible = true;
  } else {
    indicator.visible = false;
  }
  // ground reference marker (move mode): axis cross on the floor, vertical
  // height line and coordinate label for the selected object.
  const markTarget = transform.object || (state.selectedProp && state.selectedProp.group);
  if (!state.previewMode && state.moveMode && markTarget) {
    const p = markTarget.position;
    const h = Math.max(p.y, 0.001);
    groundMark.visible = true;
    groundMark.position.set(p.x, 0, p.z);
    markYPos.setXYZ(1, 0, h, 0);
    markYPos.needsUpdate = true;
    labelSprite.position.y = h + 0.2;
    updateMarkLabel(`x ${p.x.toFixed(2)}  z ${p.z.toFixed(2)}  y ${p.y.toFixed(2)}`);
  } else {
    groundMark.visible = false;
  }
  // T2-5: selection highlights (bounding boxes) + panel info text
  if (!state.previewMode && state.activeFigure) {
    figBox.visible = true;
    figBox.setFromObject(state.activeFigure.group);
  } else {
    figBox.visible = false;
  }
  if (!state.previewMode && state.selectedProp) {
    propBox.visible = true;
    propBox.setFromObject(state.selectedProp.group);
  } else {
    propBox.visible = false;
  }
  let selText = '';
  if (state.selectedProp) {
    selText = `目前選取：物品 ${props.indexOf(state.selectedProp) + 1}（${PROP_TYPES[state.selectedProp.type].label}）`;
  } else if (state.activeFigure) {
    selText = `目前選取：人物 ${figures.indexOf(state.activeFigure) + 1}・${JOINT_LABELS[state.activeJointName]}`;
  }
  if (selText !== lastSelText) {
    lastSelText = selText;
    selInfo.textContent = selText;
  }
  renderer.render(scene, camera);
}
tick();
