import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { renderer, scene, camera, controls } from './scene.js';
import { state } from './state.js';
import { figures, setActiveFigure, syncSliders } from './figures.js';
import { props, setActiveProp } from './propsManager.js';
import { scheduleSave } from './persistence.js';
import { beginGesture, endGesture } from './history.js';
import { jointSelect } from './dom.js';

// ---------------------------------------------------------------- picking / drag
// NOTE: this module evaluates AFTER OrbitControls exists (scene.js). Joint
// and move drags disable controls on pointerdown; OrbitControls ignores
// pointermove while disabled and cleans up on pointerup unconditionally, so
// the original registration order is preserved in effect.
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let drag = null;
let moveDrag = null;
let pendingDetach = false;
let transformDragging = false;

// Drag on a camera-facing plane through the object so screen movement maps
// 1:1 regardless of camera angle (ground-plane projection explodes at shallow views).
const dragPlane = new THREE.Plane();
const planeNormal = new THREE.Vector3();
const planeHit = new THREE.Vector3();

function beginMoveDrag(obj) {
  camera.getWorldDirection(planeNormal);
  dragPlane.setFromNormalAndCoplanarPoint(planeNormal, obj.position);
  if (!raycaster.ray.intersectPlane(dragPlane, planeHit)) return;
  moveDrag = {
    obj,
    dx: obj.position.x - planeHit.x,
    dy: obj.position.y - planeHit.y,
    dz: obj.position.z - planeHit.z,
  };
  beginGesture();
}

function setNdc(e) {
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
}

function capturePointer(e) {
  try {
    renderer.domElement.setPointerCapture(e.pointerId);
  } catch {
    /* pointer already captured elsewhere */
  }
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  setNdc(e);
  raycaster.setFromCamera(ndc, camera);
  const targets = figures.flatMap((f) => f.pickMeshes).concat(props.flatMap((p) => p.meshes));
  const hit = raycaster.intersectObjects(targets, false)[0];
  if (!hit) {
    // Empty-space press: detach the gizmo on release unless the gizmo itself
    // started dragging (its pointerdown runs after ours and clears the flag).
    if (state.moveMode) pendingDetach = true;
    return;
  }

  const propHit = hit.object.userData.prop;
  if (propHit) {
    setActiveProp(propHit);
    if (state.moveMode) {
      transform.attach(propHit.group);
      controls.enabled = false;
      capturePointer(e);
      beginMoveDrag(propHit.group);
    }
    return;
  }

  state.activeFigure = hit.object.userData.figure;
  state.activeJointName = hit.object.userData.joint;
  jointSelect.value = state.activeJointName;
  setActiveProp(null);
  setActiveFigure(state.activeFigure);
  if (state.moveMode) {
    transform.attach(state.activeFigure.group);
    controls.enabled = false;
    capturePointer(e);
    beginMoveDrag(state.activeFigure.group);
    return;
  }
  controls.enabled = false;
  capturePointer(e);
  drag = { lastX: e.clientX, lastY: e.clientY };
  beginGesture();
});

window.addEventListener('pointermove', (e) => {
  if (moveDrag) {
    setNdc(e);
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.ray.intersectPlane(dragPlane, planeHit)) {
      moveDrag.obj.position.x = THREE.MathUtils.clamp(planeHit.x + moveDrag.dx, -10, 10);
      moveDrag.obj.position.y = THREE.MathUtils.clamp(planeHit.y + moveDrag.dy, 0, 10);
      moveDrag.obj.position.z = THREE.MathUtils.clamp(planeHit.z + moveDrag.dz, -10, 10);
      scheduleSave();
    }
    return;
  }
  if (!drag || !state.activeFigure) return;
  const j = state.activeFigure.joints[state.activeJointName];
  const dx = (e.clientX - drag.lastX) * 0.008;
  const dy = (e.clientY - drag.lastY) * 0.008;
  j.rotation.x = THREE.MathUtils.clamp(j.rotation.x + dy, -3.1, 3.1);
  j.rotation.z = THREE.MathUtils.clamp(j.rotation.z + dx, -3.1, 3.1);
  drag.lastX = e.clientX;
  drag.lastY = e.clientY;
  syncSliders();
  scheduleSave();
});

function endDrag() {
  drag = null;
  moveDrag = null;
  controls.enabled = true;
  endGesture();
  if (pendingDetach && !transformDragging) transform.detach();
  pendingDetach = false;
}
window.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('pointercancel', endDrag);

// ---------------------------------------------------------------- TransformControls
// Translate gizmo for move mode — full 3D placement (pattern from ftsuda/web-poser).
export const transform = new TransformControls(camera, renderer.domElement);
transform.setMode('translate');
transform.setSize(0.8);
scene.add(transform);
transform.addEventListener('dragging-changed', (e) => {
  transformDragging = e.value;
  if (e.value) pendingDetach = false; // gizmo grabbed: keep it attached
  controls.enabled = !e.value;
});
transform.addEventListener('mouseDown', beginGesture);
transform.addEventListener('mouseUp', endGesture);
transform.addEventListener('objectChange', scheduleSave);
