import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildMannequin, JOINT_NAMES, JOINT_LABELS, DEG } from './mannequin.js';
import { PRESETS, PRESET_LABELS } from './poses.js';
import './style.css';

// ---------------------------------------------------------------- renderer
const app = document.getElementById('app');
// Export re-renders right before capture, so preserveDrawingBuffer is not needed.
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcdd3ea);
scene.fog = new THREE.Fog(0xcdd3ea, 14, 34);

const HOME_POS = new THREE.Vector3(1.7, 2.3, 3.6);
const HOME_TARGET = new THREE.Vector3(0, 1, 0);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.copy(HOME_POS);

// ---------------------------------------------------------------- lights
scene.add(new THREE.HemisphereLight(0xffffff, 0x7782a8, 1.15));
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(4.5, 8, 3.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -5;
sun.shadow.camera.right = 5;
sun.shadow.camera.top = 6;
sun.shadow.camera.bottom = -3;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 25;
sun.shadow.bias = -0.0004;
scene.add(sun);

// ---------------------------------------------------------------- ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({ color: 0xc9cfe6, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(40, 80, 0x8d96bd, 0xaab1d2);
grid.position.y = 0.002;
scene.add(grid);

// ---------------------------------------------------------------- figures
const figures = [];

function reposition() {
  figures.forEach((f, i) => {
    f.group.position.x = (i - (figures.length - 1) / 2) * 0.8;
  });
}

function addFigure(female) {
  const m = buildMannequin({ female });
  for (const mesh of m.pickMeshes) mesh.userData.figure = m;
  scene.add(m.group);
  figures.push(m);
  reposition();
  setActiveFigure(m);
  return m;
}

function removeFigure() {
  if (figures.length <= 1) return;
  const m = figures.pop();
  scene.remove(m.group);
  reposition();
  setActiveFigure(figures[figures.length - 1]);
}

// ---------------------------------------------------------------- UI refs
const jointSelect = document.getElementById('jointSelect');
const presetSelect = document.getElementById('presetSelect');
const rotX = document.getElementById('rotX');
const rotY = document.getElementById('rotY');
const rotZ = document.getElementById('rotZ');
const rotXVal = document.getElementById('rotXVal');
const rotYVal = document.getElementById('rotYVal');
const rotZVal = document.getElementById('rotZVal');
const figInfo = document.getElementById('figInfo');
const previewBtn = document.getElementById('previewBtn');
const gridToggle = document.getElementById('gridToggle');

for (const name of JOINT_NAMES) {
  const opt = document.createElement('option');
  opt.value = name;
  opt.textContent = JOINT_LABELS[name];
  jointSelect.appendChild(opt);
}
for (const [key, label] of Object.entries(PRESET_LABELS)) {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = label;
  presetSelect.appendChild(opt);
}

let activeFigure = null;
let activeJointName = 'chest';
jointSelect.value = activeJointName;

function syncSliders() {
  if (!activeFigure) return;
  const j = activeFigure.joints[activeJointName];
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

function setActiveFigure(f) {
  activeFigure = f;
  const idx = figures.indexOf(f);
  figInfo.textContent = `人物 ${idx + 1} / ${figures.length} ・ ${f.female ? '女' : '男'}`;
  syncSliders();
}

// selection indicator (wireframe sphere following the active joint)
const indicator = new THREE.Mesh(
  new THREE.SphereGeometry(0.085, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0xff9a2e, wireframe: true, transparent: true, opacity: 0.9 }),
);
indicator.visible = false;
scene.add(indicator);

// ---------------------------------------------------------------- picking / drag
// NOTE: registered BEFORE OrbitControls so we can disable it on joint drag.
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let drag = null;

renderer.domElement.addEventListener('pointerdown', (e) => {
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(figures.flatMap((f) => f.pickMeshes), false)[0];
  if (hit) {
    activeFigure = hit.object.userData.figure;
    activeJointName = hit.object.userData.joint;
    jointSelect.value = activeJointName;
    setActiveFigure(activeFigure);
    drag = { lastX: e.clientX, lastY: e.clientY };
    controls.enabled = false;
    try {
      renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already captured elsewhere */
    }
  }
});

window.addEventListener('pointermove', (e) => {
  if (!drag || !activeFigure) return;
  const j = activeFigure.joints[activeJointName];
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
  controls.enabled = true;
}
window.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('pointercancel', endDrag);

// ---------------------------------------------------------------- camera controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME_TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.8;
controls.maxDistance = 12;
controls.maxPolarAngle = Math.PI * 0.52;

// ---------------------------------------------------------------- UI events
jointSelect.addEventListener('change', () => {
  activeJointName = jointSelect.value;
  syncSliders();
});

for (const [input, axis] of [[rotX, 'x'], [rotY, 'y'], [rotZ, 'z']]) {
  input.addEventListener('input', () => {
    if (!activeFigure) return;
    activeFigure.joints[activeJointName].rotation[axis] = Number(input.value) * DEG;
    syncSliders();
    scheduleSave();
  });
}

presetSelect.addEventListener('change', () => {
  if (!activeFigure || !presetSelect.value) return;
  activeFigure.setPose(PRESETS[presetSelect.value]);
  presetSelect.value = '';
  syncSliders();
  scheduleSave();
});

document.getElementById('resetJointBtn').addEventListener('click', () => {
  if (!activeFigure) return;
  activeFigure.joints[activeJointName].rotation.set(0, 0, 0);
  syncSliders();
  scheduleSave();
});

document.getElementById('resetPoseBtn').addEventListener('click', () => {
  if (!activeFigure) return;
  activeFigure.resetPose();
  syncSliders();
  scheduleSave();
});

document.getElementById('genderBtn').addEventListener('click', () => {
  if (!activeFigure) return;
  const idx = figures.indexOf(activeFigure);
  const pose = extractPose(activeFigure);
  scene.remove(activeFigure.group);
  const m = buildMannequin({ female: !activeFigure.female });
  m.setPose(pose);
  for (const mesh of m.pickMeshes) mesh.userData.figure = m;
  scene.add(m.group);
  figures[idx] = m;
  setActiveFigure(m);
  scheduleSave();
});

document.getElementById('resetViewBtn').addEventListener('click', () => {
  camera.position.copy(HOME_POS);
  controls.target.copy(HOME_TARGET);
  controls.update();
});

gridToggle.addEventListener('change', () => {
  grid.visible = gridToggle.checked;
  scheduleSave();
});

document.getElementById('addBtn').addEventListener('click', () => {
  addFigure(figures.length % 2 === 1);
  scheduleSave();
});
document.getElementById('removeBtn').addEventListener('click', () => {
  removeFigure();
  scheduleSave();
});

let previewMode = false;
previewBtn.addEventListener('click', () => {
  previewMode = document.body.classList.toggle('preview');
  previewBtn.textContent = previewMode ? '離開預覽' : '預覽模式';
  if (previewMode) indicator.visible = false;
});

document.getElementById('exportBtn').addEventListener('click', () => {
  renderer.render(scene, camera);
  const a = document.createElement('a');
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  a.download = `poseman-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
  a.href = renderer.domElement.toDataURL('image/png');
  a.click();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- persistence
const STORAGE_KEY = 'poseman-scene-v1';

function extractPose(f) {
  const pose = {};
  for (const [name, j] of Object.entries(f.joints)) {
    pose[name] = [j.rotation.x / DEG, j.rotation.y / DEG, j.rotation.z / DEG];
  }
  return pose;
}

function saveScene() {
  try {
    const data = {
      grid: grid.visible,
      figures: figures.map((f) => ({ female: f.female, pose: extractPose(f) })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable (private mode / quota) */
  }
}

let saveTimer = 0;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveScene, 250);
}

function loadScene() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!data || !Array.isArray(data.figures) || data.figures.length === 0) return false;
    for (const fd of data.figures) {
      const m = addFigure(Boolean(fd.female));
      if (fd.pose) m.setPose(fd.pose);
    }
    gridToggle.checked = data.grid !== false;
    grid.visible = gridToggle.checked;
    return true;
  } catch {
    return false;
  }
}

window.addEventListener('pagehide', saveScene);

// ---------------------------------------------------------------- boot
if (!loadScene()) {
  addFigure(false);
  addFigure(true);
}
setActiveFigure(figures[0]);

const tmpV = new THREE.Vector3();
function tick() {
  requestAnimationFrame(tick);
  controls.update();
  if (!previewMode && activeFigure && activeFigure.joints[activeJointName]) {
    activeFigure.joints[activeJointName].getWorldPosition(tmpV);
    indicator.position.copy(tmpV);
    indicator.visible = true;
  } else {
    indicator.visible = false;
  }
  renderer.render(scene, camera);
}
tick();
