import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildMannequin, JOINT_NAMES, JOINT_LABELS, DEG } from './mannequin.js';
import { PRESETS, PRESET_LABELS } from './poses.js';
import { buildProp, PROP_TYPES } from './props.js';
import {
  buildSystemPrompt,
  requestAI,
  loadAISettings,
  saveAISettings,
  aiConfigured,
} from './ai.js';
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

function addFigure(female) {
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

function removeFigureAt(i) {
  if (figures.length <= 1 || !figures[i]) return;
  const m = figures[i];
  scene.remove(m.group);
  figures.splice(i, 1);
  setActiveFigure(figures.includes(activeFigure) ? activeFigure : figures[figures.length - 1]);
}

function removeFigure() {
  removeFigureAt(figures.length - 1);
}

// ---------------------------------------------------------------- props
const props = [];
let selectedProp = null;

function addProp(type, saved = null) {
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
  group.position.z = Number.isFinite(saved?.z) ? saved.z : 1.1;
  group.rotation.y = Number.isFinite(saved?.rotY) ? saved.rotY : 0;
  scene.add(group);
  props.push(entry);
  selectedProp = entry;
  return entry;
}

function removeProp(entry) {
  const i = props.indexOf(entry);
  if (i < 0) return;
  scene.remove(entry.group);
  props.splice(i, 1);
  if (selectedProp === entry) selectedProp = null;
}

// ---------------------------------------------------------------- UI refs
const jointSelect = document.getElementById('jointSelect');
const presetSelect = document.getElementById('presetSelect');
const propSelect = document.getElementById('propSelect');
const rotX = document.getElementById('rotX');
const rotY = document.getElementById('rotY');
const rotZ = document.getElementById('rotZ');
const rotXVal = document.getElementById('rotXVal');
const rotYVal = document.getElementById('rotYVal');
const rotZVal = document.getElementById('rotZVal');
const figInfo = document.getElementById('figInfo');
const previewBtn = document.getElementById('previewBtn');
const moveBtn = document.getElementById('moveBtn');
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
for (const [key, def] of Object.entries(PROP_TYPES)) {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = def.label;
  propSelect.appendChild(opt);
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

// selection indicator (wireframe sphere following the active joint / prop)
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
let moveMode = false;
let moveDrag = null;
// Drag on a camera-facing plane through the object so screen movement maps
// 1:1 regardless of camera angle (ground-plane projection explodes at shallow views).
const dragPlane = new THREE.Plane();
const planeNormal = new THREE.Vector3();
const grabCenter = new THREE.Vector3();
const planeHit = new THREE.Vector3();

function beginMoveDrag(obj, centerY) {
  camera.getWorldDirection(planeNormal);
  dragPlane.setFromNormalAndCoplanarPoint(
    planeNormal,
    grabCenter.set(obj.position.x, centerY, obj.position.z),
  );
  if (!raycaster.ray.intersectPlane(dragPlane, planeHit)) return;
  moveDrag = {
    obj,
    dx: obj.position.x - planeHit.x,
    dz: obj.position.z - planeHit.z,
  };
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
  if (!hit) return;

  const propHit = hit.object.userData.prop;
  if (propHit) {
    selectedProp = propHit;
    if (!moveMode) return; // outside move mode a prop click just selects; orbit stays on
    controls.enabled = false;
    capturePointer(e);
    beginMoveDrag(propHit.group, 0.3);
    return;
  }

  activeFigure = hit.object.userData.figure;
  activeJointName = hit.object.userData.joint;
  jointSelect.value = activeJointName;
  selectedProp = null;
  setActiveFigure(activeFigure);
  controls.enabled = false;
  capturePointer(e);
  if (moveMode) {
    beginMoveDrag(activeFigure.group, 1.0);
  } else {
    drag = { lastX: e.clientX, lastY: e.clientY };
  }
});

window.addEventListener('pointermove', (e) => {
  if (moveDrag) {
    setNdc(e);
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.ray.intersectPlane(dragPlane, planeHit)) {
      moveDrag.obj.position.x = THREE.MathUtils.clamp(planeHit.x + moveDrag.dx, -10, 10);
      moveDrag.obj.position.z = THREE.MathUtils.clamp(planeHit.z + moveDrag.dz, -10, 10);
      scheduleSave();
    }
    return;
  }
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
  moveDrag = null;
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
  const pos = activeFigure.group.position.clone();
  scene.remove(activeFigure.group);
  const m = buildMannequin({ female: !activeFigure.female });
  m.setPose(pose);
  m.group.position.copy(pos);
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

moveBtn.addEventListener('click', () => {
  moveMode = document.body.classList.toggle('move');
  moveBtn.textContent = moveMode ? '結束移動' : '移動模式';
  drag = null;
  moveDrag = null;
  controls.enabled = true;
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

// ---------------------------------------------------------------- props UI
propSelect.addEventListener('change', () => {
  if (!propSelect.value) return;
  addProp(propSelect.value);
  propSelect.value = '';
  scheduleSave();
});

document.getElementById('rotatePropBtn').addEventListener('click', () => {
  if (!selectedProp) return;
  selectedProp.group.rotation.y += 45 * DEG;
  scheduleSave();
});

document.getElementById('deletePropBtn').addEventListener('click', () => {
  if (!selectedProp) return;
  removeProp(selectedProp);
  scheduleSave();
});

// ---------------------------------------------------------------- scene file
const pad = (n) => String(n).padStart(2, '0');
function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

document.getElementById('saveFileBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(serializeScene(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `poseman-scene-${stamp()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

const fileInput = document.getElementById('fileInput');
document.getElementById('loadFileBtn').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  try {
    applyScene(JSON.parse(await file.text()));
    scheduleSave();
  } catch {
    alert('讀檔失敗：JSON 格式不正確');
  }
});

document.getElementById('exportBtn').addEventListener('click', () => {
  renderer.render(scene, camera);
  const a = document.createElement('a');
  a.download = `poseman-${stamp()}.png`;
  a.href = renderer.domElement.toDataURL('image/png');
  a.click();
});

// ---------------------------------------------------------------- AI chat
const aiBtn = document.getElementById('aiBtn');
const chatLog = document.getElementById('chatLog');
const chatInput = document.getElementById('chatInput');
const chatStatus = document.getElementById('chatStatus');
const aiSettingsBox = document.getElementById('aiSettings');
const aiBaseUrl = document.getElementById('aiBaseUrl');
const aiModel = document.getElementById('aiModel');
const aiKey = document.getElementById('aiKey');
let chatHistory = [];

aiBtn.addEventListener('click', () => {
  const open = document.body.classList.toggle('ai-open');
  aiBtn.textContent = open ? '關閉 AI' : 'AI';
  if (open) {
    const s = loadAISettings();
    aiBaseUrl.value = s.baseUrl || '';
    aiModel.value = s.model || '';
    aiKey.value = s.apiKey || '';
  }
});

document.getElementById('aiSettingsBtn').addEventListener('click', () => {
  aiSettingsBox.hidden = !aiSettingsBox.hidden;
});

document.getElementById('aiSaveBtn').addEventListener('click', () => {
  saveAISettings({
    baseUrl: aiBaseUrl.value.trim(),
    model: aiModel.value.trim(),
    apiKey: aiKey.value.trim(),
  });
  aiSettingsBox.hidden = true;
  pushChat('sys', 'AI 設定已儲存（僅存於本機瀏覽器）。');
});

function pushChat(kind, text) {
  const div = document.createElement('div');
  div.className = `msg ${kind}`;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function sceneSnapshot() {
  return {
    figures: figures.map((f) => ({
      female: f.female,
      x: +f.group.position.x.toFixed(2),
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
      z: +p.group.position.z.toFixed(2),
      rotY: Math.round(p.group.rotation.y / DEG),
    })),
  };
}

function applyActions(actions) {
  if (!Array.isArray(actions)) return 0;
  let n = 0;
  for (const a of actions) {
    if (!a || typeof a !== 'object') continue;
    try {
      switch (a.op) {
        case 'setJoint': {
          const f = figures[a.figure];
          const j = f && f.joints[a.joint];
          if (!j || !Array.isArray(a.rot)) break;
          j.rotation.set(
            (Number(a.rot[0]) || 0) * DEG,
            (Number(a.rot[1]) || 0) * DEG,
            (Number(a.rot[2]) || 0) * DEG,
          );
          n++;
          break;
        }
        case 'addJoint': {
          const f = figures[a.figure];
          const j = f && f.joints[a.joint];
          if (!j || !Array.isArray(a.delta)) break;
          j.rotation.x += (Number(a.delta[0]) || 0) * DEG;
          j.rotation.y += (Number(a.delta[1]) || 0) * DEG;
          j.rotation.z += (Number(a.delta[2]) || 0) * DEG;
          n++;
          break;
        }
        case 'preset': {
          const f = figures[a.figure];
          if (!f || !PRESETS[a.preset]) break;
          f.setPose(PRESETS[a.preset]);
          n++;
          break;
        }
        case 'resetPose': {
          const f = figures[a.figure];
          if (!f) break;
          f.resetPose();
          n++;
          break;
        }
        case 'moveFigure': {
          const f = figures[a.figure];
          if (!f) break;
          if (Number.isFinite(a.x)) f.group.position.x = THREE.MathUtils.clamp(a.x, -10, 10);
          if (Number.isFinite(a.z)) f.group.position.z = THREE.MathUtils.clamp(a.z, -10, 10);
          n++;
          break;
        }
        case 'addFigure':
          addFigure(Boolean(a.female));
          n++;
          break;
        case 'removeFigure':
          if (figures[a.figure]) {
            removeFigureAt(Number(a.figure));
            n++;
          }
          break;
        case 'addProp':
          if (PROP_TYPES[a.type]) {
            addProp(a.type, a);
            n++;
          }
          break;
        case 'moveProp': {
          const p = props[a.prop];
          if (!p) break;
          if (Number.isFinite(a.x)) p.group.position.x = THREE.MathUtils.clamp(a.x, -10, 10);
          if (Number.isFinite(a.z)) p.group.position.z = THREE.MathUtils.clamp(a.z, -10, 10);
          n++;
          break;
        }
        case 'rotateProp': {
          const p = props[a.prop];
          if (!p) break;
          p.group.rotation.y += (Number(a.deg) || 45) * DEG;
          n++;
          break;
        }
        case 'removeProp':
          if (props[a.prop]) {
            removeProp(props[a.prop]);
            n++;
          }
          break;
      }
    } catch {
      /* skip malformed action */
    }
  }
  if (n) {
    syncSliders();
    scheduleSave();
  }
  return n;
}

async function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';
  pushChat('user', text);
  const settings = loadAISettings();
  if (!aiConfigured(settings)) {
    pushChat('sys', '尚未設定 AI API：點「⚙」填入 Base URL、模型與金鑰後再試。');
    return;
  }
  chatStatus.textContent = 'AI 思考中…';
  try {
    const result = await requestAI(
      settings,
      buildSystemPrompt(sceneSnapshot()),
      chatHistory,
      text,
    );
    chatHistory.push({ role: 'user', content: text }, { role: 'assistant', content: result.raw });
    if (chatHistory.length > 8) chatHistory = chatHistory.slice(-8);
    const n = applyActions(result.actions);
    pushChat('ai', `${result.reply || '已執行。'}${n ? `（${n} 個動作）` : ''}`);
  } catch (err) {
    pushChat('sys', `AI 請求失敗：${err.message}`);
  }
  chatStatus.textContent = '';
}

document.getElementById('chatSend').addEventListener('click', sendChat);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});

// ---------------------------------------------------------------- resize
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

function serializeScene() {
  return {
    version: 1,
    grid: grid.visible,
    figures: figures.map((f) => ({
      female: f.female,
      x: f.group.position.x,
      z: f.group.position.z,
      pose: extractPose(f),
    })),
    props: props.map((p) => ({
      type: p.type,
      x: p.group.position.x,
      z: p.group.position.z,
      rotY: p.group.rotation.y,
    })),
  };
}

function applyScene(data) {
  for (const f of figures) scene.remove(f.group);
  figures.length = 0;
  for (const p of props) scene.remove(p.group);
  props.length = 0;
  selectedProp = null;

  const figs = Array.isArray(data?.figures) && data.figures.length ? data.figures : null;
  if (figs) {
    for (const fd of figs) {
      const m = addFigure(Boolean(fd.female));
      if (Number.isFinite(fd.x)) m.group.position.x = fd.x;
      if (Number.isFinite(fd.z)) m.group.position.z = fd.z;
      if (fd.pose) m.setPose(fd.pose);
    }
  } else {
    addFigure(false).group.position.x = -0.4;
    addFigure(true).group.position.x = 0.4;
  }
  for (const pd of Array.isArray(data?.props) ? data.props : []) addProp(pd.type, pd);

  gridToggle.checked = data?.grid !== false;
  grid.visible = gridToggle.checked;
  setActiveFigure(figures[0]);
}

function saveScene() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeScene()));
  } catch {
    /* storage unavailable (private mode / quota) */
  }
}

let saveTimer = 0;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveScene, 250);
}

window.addEventListener('pagehide', saveScene);

// ---------------------------------------------------------------- boot
let stored = null;
try {
  stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
} catch {
  /* corrupt storage: fall back to defaults */
}
applyScene(stored);

const tmpV = new THREE.Vector3();
function tick() {
  requestAnimationFrame(tick);
  controls.update();
  if (previewMode) {
    indicator.visible = false;
  } else if (selectedProp) {
    indicator.position.set(selectedProp.group.position.x, 0.12, selectedProp.group.position.z);
    indicator.visible = true;
  } else if (activeFigure && activeFigure.joints[activeJointName]) {
    activeFigure.joints[activeJointName].getWorldPosition(tmpV);
    indicator.position.copy(tmpV);
    indicator.visible = true;
  } else {
    indicator.visible = false;
  }
  renderer.render(scene, camera);
}
tick();
