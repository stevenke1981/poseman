import { buildMannequin, JOINT_NAMES, JOINT_LABELS, DEG } from './mannequin.js';
import { PRESETS, PRESET_LABELS } from './poses.js';
import { PROP_TYPES } from './props.js';
import { scene, camera, renderer, controls, grid, HOME_POS, HOME_TARGET } from './scene.js';
import { state } from './state.js';
import {
  figures,
  addFigure,
  removeFigure,
  setActiveFigure,
  extractPose,
  syncSliders,
} from './figures.js';
import { addProp, removeProp } from './propsManager.js';
import { transform } from './interaction.js';
import { applyScene, scheduleSave, serializeScene } from './persistence.js';
import { withHistory, beginGesture, endGesture, undo, redo } from './history.js';
import { applyActions, sceneSnapshot } from './aiActions.js';
import {
  buildSystemPrompt,
  requestAI,
  loadAISettings,
  saveAISettings,
  aiConfigured,
} from './ai.js';
import {
  jointSelect,
  presetSelect,
  propSelect,
  rotX,
  rotY,
  rotZ,
  previewBtn,
  moveBtn,
  gridToggle,
  resetJointBtn,
  resetPoseBtn,
  genderBtn,
  resetViewBtn,
  addBtn,
  removeBtn,
  rotatePropBtn,
  deletePropBtn,
  saveFileBtn,
  loadFileBtn,
  fileInput,
  undoBtn,
  redoBtn,
  exportBtn,
  aiBtn,
  chatLog,
  chatInput,
  chatStatus,
  aiSettingsBox,
  aiBaseUrl,
  aiModel,
  aiKey,
  aiSettingsBtn,
  aiSaveBtn,
  chatSend,
} from './dom.js';

// ---------------------------------------------------------------- populate selects
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
jointSelect.value = state.activeJointName;

// ---------------------------------------------------------------- joint controls
jointSelect.addEventListener('change', () => {
  state.activeJointName = jointSelect.value;
  syncSliders();
});

for (const [input, axis] of [[rotX, 'x'], [rotY, 'y'], [rotZ, 'z']]) {
  input.addEventListener('pointerdown', beginGesture);
  input.addEventListener('keydown', beginGesture);
  input.addEventListener('input', () => {
    if (!state.activeFigure) return;
    state.activeFigure.joints[state.activeJointName].rotation[axis] = Number(input.value) * DEG;
    syncSliders();
    scheduleSave();
  });
  input.addEventListener('change', endGesture);
}

presetSelect.addEventListener('change', () => {
  if (!state.activeFigure || !presetSelect.value) return;
  withHistory(() => {
    state.activeFigure.setPose(PRESETS[presetSelect.value]);
  });
  presetSelect.value = '';
  syncSliders();
  scheduleSave();
});

resetJointBtn.addEventListener('click', () => {
  if (!state.activeFigure) return;
  withHistory(() => state.activeFigure.joints[state.activeJointName].rotation.set(0, 0, 0));
  syncSliders();
  scheduleSave();
});

resetPoseBtn.addEventListener('click', () => {
  if (!state.activeFigure) return;
  withHistory(() => state.activeFigure.resetPose());
  syncSliders();
  scheduleSave();
});

genderBtn.addEventListener('click', () => {
  if (!state.activeFigure) return;
  withHistory(() => {
    const idx = figures.indexOf(state.activeFigure);
    const pose = extractPose(state.activeFigure);
    const pos = state.activeFigure.group.position.clone();
    const oldGroup = state.activeFigure.group;
    scene.remove(oldGroup);
    const m = buildMannequin({ female: !state.activeFigure.female });
    m.setPose(pose);
    m.group.position.copy(pos);
    for (const mesh of m.pickMeshes) mesh.userData.figure = m;
    scene.add(m.group);
    figures[idx] = m;
    if (transform.object === oldGroup) transform.attach(m.group);
    setActiveFigure(m);
  });
  scheduleSave();
});

resetViewBtn.addEventListener('click', () => {
  camera.position.copy(HOME_POS);
  controls.target.copy(HOME_TARGET);
  controls.update();
});

gridToggle.addEventListener('change', () => {
  grid.visible = gridToggle.checked;
  scheduleSave();
});

moveBtn.addEventListener('click', () => {
  state.moveMode = document.body.classList.toggle('move');
  moveBtn.textContent = state.moveMode ? '結束移動' : '移動模式';
  controls.enabled = true;
  if (!state.moveMode) transform.detach();
});

addBtn.addEventListener('click', () => {
  withHistory(() => addFigure(figures.length % 2 === 1));
  scheduleSave();
});
removeBtn.addEventListener('click', () => {
  withHistory(removeFigure);
  scheduleSave();
});

previewBtn.addEventListener('click', () => {
  state.previewMode = document.body.classList.toggle('preview');
  previewBtn.textContent = state.previewMode ? '離開預覽' : '預覽模式';
});

// ---------------------------------------------------------------- props UI
propSelect.addEventListener('change', () => {
  if (!propSelect.value) return;
  withHistory(() => addProp(propSelect.value));
  propSelect.value = '';
  scheduleSave();
});

rotatePropBtn.addEventListener('click', () => {
  if (!state.selectedProp) return;
  withHistory(() => {
    state.selectedProp.group.rotation.y += 45 * DEG;
  });
  scheduleSave();
});

deletePropBtn.addEventListener('click', () => {
  if (!state.selectedProp) return;
  withHistory(() => removeProp(state.selectedProp));
  scheduleSave();
});

// ---------------------------------------------------------------- undo / redo (T1-5)
function doUndo() {
  if (undo()) scheduleSave();
}
function doRedo() {
  if (redo()) scheduleSave();
}
undoBtn.addEventListener('click', doUndo);
redoBtn.addEventListener('click', doRedo);

window.addEventListener('keydown', (e) => {
  const t = e.target;
  if (
    t &&
    (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
  ) {
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey) {
    const k = e.key.toLowerCase();
    if (k === 'z' && e.shiftKey) {
      e.preventDefault();
      doRedo();
      return;
    }
    if (k === 'z') {
      e.preventDefault();
      doUndo();
      return;
    }
    if (k === 'y') {
      e.preventDefault();
      doRedo();
    }
  }
});

// ---------------------------------------------------------------- scene file
const pad = (n) => String(n).padStart(2, '0');
function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

saveFileBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(serializeScene(), null, 2)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `poseman-scene-${stamp()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

loadFileBtn.addEventListener('click', () => fileInput.click());
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

exportBtn.addEventListener('click', () => {
  renderer.render(scene, camera);
  const a = document.createElement('a');
  a.download = `poseman-${stamp()}.png`;
  a.href = renderer.domElement.toDataURL('image/png');
  a.click();
});

// ---------------------------------------------------------------- AI chat
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

aiSettingsBtn.addEventListener('click', () => {
  aiSettingsBox.hidden = !aiSettingsBox.hidden;
});

aiSaveBtn.addEventListener('click', () => {
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
    const { applied, skipped } = applyActions(result.actions);
    pushChat('ai', `${result.reply || '已執行。'}${applied ? `（${applied} 個動作）` : ''}`);
    if (skipped.length) pushChat('sys', `略過 ${skipped.length} 個動作：${skipped.join('；')}`);
  } catch (err) {
    pushChat('sys', `AI 請求失敗：${err.message}`);
  }
  chatStatus.textContent = '';
}

chatSend.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});
