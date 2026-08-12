import {
  JOINT_NAMES,
  JOINT_LABELS,
  DEG,
  SKIN_TONES,
  OUTFIT_STYLES,
  BODY_PROFILES,
  HAIR_STYLES,
  HAIR_COLORS,
  EYE_COLORS,
  SKIN_QUALITIES,
  DEFAULT_APPEARANCE,
  sanitizeAppearance,
} from './mannequin.js';
import { PRESETS, PRESET_LABELS, loadCustomPoses, saveCustomPoses } from './poses.js';
import { PROP_TYPES, getPropDefinition } from './props.js';
import { scene, camera, renderer, controls, grid, HOME_POS, HOME_TARGET } from './scene.js';
import { state, chooseTransformTarget } from './state.js';
import {
  figures,
  addFigure,
  addImportedFigure,
  removeFigure,
  rebuildFigure,
  setActiveFigure,
  setFiguresChangeHandler,
  extractPose,
  syncSliders,
  mirroredPose,
  copiedSidePose,
} from './figures.js';
import { props, addProp, removeProp, setActiveProp, setPropsChangeHandler } from './propsManager.js';
import { clampPropScale, normalizePropRotation, canRemoveFigure } from './sceneSchema.js';
import { transform } from './interaction.js';
import { applyScene, getSceneGeneration, scheduleSave, serializeScene, sanitizePose } from './persistence.js';
import { withHistory, beginGesture, endGesture, undo, redo } from './history.js';
import { applyActions, sceneSnapshot } from './aiActions.js';
import { captureView, captureSheet } from './exporter.js';
import { importGlbArrayBuffer, validateLicenseMetadata, GLB_LIMITS, LICENSE_TYPES } from './glbImporter.js';
import { putAsset } from './assetStore.js';
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
  skinToneSelect,
  outfitSelect,
  bodyProfileSelect,
  hairStyleSelect,
  hairColorSelect,
  eyeColorSelect,
  skinQualitySelect,
  appearanceResetBtn,
  resetViewBtn,
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
  poseNameInput,
  savePoseBtn,
  exportPoseBtn,
  customPoseSelect,
  applyPoseBtn,
  deletePoseBtn,
  importPoseBtn,
  poseFileInput,
  mirrorAllBtn,
  mirrorArmsBtn,
  mirrorLegsBtn,
  copyLRBtn,
  copyRLBtn,
  viewSelect,
  scaleSelect,
  transparentCheck,
  export2Btn,
  sheetBtn,
  figureSelect,
  addMaleFigureBtn,
  addFemaleFigureBtn,
  removeFigureBtn,
  figureManageHint,
  glbFileInput,
  glbAssetName,
  glbLicenseType,
  glbAuthor,
  glbSource,
  glbLicenseNotes,
  glbLicenseConfirm,
  importGlbBtn,
  assetImportStatus,
  assetSummary,
  currentPropSelect,
  addPropBtn,
  propRotY,
  propRotYVal,
  propScale,
  propScaleVal,
} from './dom.js';

// ---------------------------------------------------------------- populate selects
function setPanelSectionOpen(id, open) {
  const section = document.getElementById(id);
  if (!section) {
    console.warn(`PoseMan: 找不到控制面板區塊 ${id}`);
    return;
  }
  section.open = open;
}

function openPanelSection(id) {
  setPanelSectionOpen(id, true);
}

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
for (const [key, def] of Object.entries(SKIN_TONES)) {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = def.label;
  skinToneSelect.appendChild(opt);
}
for (const [key, def] of Object.entries(OUTFIT_STYLES)) {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = def.label;
  outfitSelect.appendChild(opt);
}
for (const [key, def] of Object.entries(BODY_PROFILES)) {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = def.label;
  bodyProfileSelect.appendChild(opt);
}
for (const [key, def] of Object.entries(HAIR_STYLES)) {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = def.label;
  hairStyleSelect.appendChild(opt);
}
for (const [key, def] of Object.entries(HAIR_COLORS)) {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = def.label;
  hairColorSelect.appendChild(opt);
}
for (const [key, def] of Object.entries(EYE_COLORS)) {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = def.label;
  eyeColorSelect.appendChild(opt);
}
for (const [key, def] of Object.entries(SKIN_QUALITIES)) {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = def.label;
  skinQualitySelect.appendChild(opt);
}
skinToneSelect.value = DEFAULT_APPEARANCE.skinTone;
outfitSelect.value = DEFAULT_APPEARANCE.outfit;
bodyProfileSelect.value = DEFAULT_APPEARANCE.bodyProfile;
hairStyleSelect.value = DEFAULT_APPEARANCE.hairStyle;
hairColorSelect.value = DEFAULT_APPEARANCE.hairColor;
eyeColorSelect.value = DEFAULT_APPEARANCE.eyeColor;
skinQualitySelect.value = DEFAULT_APPEARANCE.skinQuality;
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

function updateAppearance(patch) {
  if (!state.activeFigure || state.activeFigure.imported || state.activeFigure.externalPending) return;
  const next = sanitizeAppearance({ ...state.activeFigure.appearance, ...patch });
  withHistory(() => {
    // Rebuild rather than mutating shared geometry so body profile and hair
    // changes are visible while pose, position and selection remain intact.
    rebuildFigure(state.activeFigure, { appearance: next });
  });
  syncAppearanceControls(next);
  scheduleSave();
}

skinToneSelect.addEventListener('change', () => updateAppearance({ skinTone: skinToneSelect.value }));
outfitSelect.addEventListener('change', () => updateAppearance({ outfit: outfitSelect.value }));
bodyProfileSelect.addEventListener('change', () => updateAppearance({ bodyProfile: bodyProfileSelect.value }));
hairStyleSelect.addEventListener('change', () => updateAppearance({ hairStyle: hairStyleSelect.value }));
hairColorSelect.addEventListener('change', () => updateAppearance({ hairColor: hairColorSelect.value }));
eyeColorSelect.addEventListener('change', () => updateAppearance({ eyeColor: eyeColorSelect.value }));
skinQualitySelect.addEventListener('change', () => updateAppearance({ skinQuality: skinQualitySelect.value }));
appearanceResetBtn.addEventListener('click', () => updateAppearance(DEFAULT_APPEARANCE));

genderBtn.addEventListener('click', () => {
  if (!state.activeFigure || state.activeFigure.imported || state.activeFigure.externalPending) return;
  withHistory(() => {
    rebuildFigure(state.activeFigure, {
      female: !state.activeFigure.female,
      appearance: state.activeFigure.appearance,
    });
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
  syncTransformTarget();
});

function syncAppearanceControls(appearance) {
  const safe = sanitizeAppearance(appearance);
  skinToneSelect.value = safe.skinTone;
  outfitSelect.value = safe.outfit;
  bodyProfileSelect.value = safe.bodyProfile;
  hairStyleSelect.value = safe.hairStyle;
  hairColorSelect.value = safe.hairColor;
  eyeColorSelect.value = safe.eyeColor;
  skinQualitySelect.value = safe.skinQuality;
}

function refreshFigureSelect() {
  const keep = state.activeFigure ? String(figures.indexOf(state.activeFigure)) : '';
  figureSelect.innerHTML = '';
  figures.forEach((f, i) => {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = f.imported || f.externalPending
      ? `人物 ${i + 1} ・ 外部：${f.assetName || 'GLB'}`
      : `人物 ${i + 1} ・ ${f.female ? '女性' : '男性'}`;
    figureSelect.appendChild(option);
  });
  figureSelect.value = keep;
  removeFigureBtn.disabled = !canRemoveFigure(figures.length);
  figureManageHint.textContent = !canRemoveFigure(figures.length) ? '目前只剩 1 位人物，無法再移除。' : '可切換目前人物或移除選取的人物。';
  if (state.activeFigure) {
    openPanelSection('figureSection');
    openPanelSection('appearanceSection');
  }
  syncImportedFigureControls();
  // Selecting a figure clears the prop selection in figures.js; mirror that
  // state immediately in the prop controls so no stale slider remains active.
  if (typeof syncPropControls === 'function') syncPropControls();
  syncTransformTarget();
}
setFiguresChangeHandler(refreshFigureSelect);

figureSelect.addEventListener('change', () => {
  const f = figures[Number(figureSelect.value)];
  if (!f) return;
  transform.detach();
  setActiveFigure(f);
  syncAppearanceControls(f.appearance);
  syncImportedFigureControls(f);
  scheduleSave();
});

function addManagedFigure(female) {
  withHistory(() => addFigure(female));
  scheduleSave();
}
addMaleFigureBtn.addEventListener('click', () => addManagedFigure(false));
addFemaleFigureBtn.addEventListener('click', () => addManagedFigure(true));

function setAssetStatus(message, tone = '') {
  assetImportStatus.textContent = message || '';
  if (tone) assetImportStatus.dataset.tone = tone;
  else delete assetImportStatus.dataset.tone;
}

function syncImportedFigureControls(figure = state.activeFigure) {
  const imported = Boolean(figure?.imported || figure?.externalPending);
  for (const control of [skinToneSelect, outfitSelect, bodyProfileSelect, hairStyleSelect, hairColorSelect, eyeColorSelect, skinQualitySelect, appearanceResetBtn, genderBtn]) {
    control.disabled = imported;
  }
  if (imported) {
    const licenseKey = figure.license?.licenseType;
    const licenseLabel = typeof licenseKey === 'string' && Object.hasOwn(LICENSE_TYPES, licenseKey)
      ? LICENSE_TYPES[licenseKey]
      : '授權未標示';
    assetSummary.textContent = `${figure.externalPending ? '等待外部資產：' : '目前外部人物：'}${figure.assetName || '未命名'} ・ ${licenseLabel}${figure.license?.author ? ` ・ 作者 ${figure.license.author}` : ''}${figure.license?.source ? ` ・ ${figure.license.source}` : ''}`;
  } else {
    assetSummary.textContent = '目前人物：程序化人偶';
  }
}

async function importSelectedGlb() {
  const file = glbFileInput.files?.[0];
  if (!file) {
    setAssetStatus('請先選擇 .glb 檔案。', 'error');
    return;
  }
  if (!/\.glb$/i.test(file.name)) {
    setAssetStatus('僅接受副檔名為 .glb 的檔案。', 'error');
    return;
  }
  if (file.size > GLB_LIMITS.maxBytes) {
    setAssetStatus(`GLB 超過 ${Math.round(GLB_LIMITS.maxBytes / 1024 / 1024)} MiB 上限。`, 'error');
    return;
  }
  const license = validateLicenseMetadata({
    assetName: glbAssetName.value,
    licenseType: glbLicenseType.value,
    author: glbAuthor.value,
    source: glbSource.value,
    notes: glbLicenseNotes.value,
    confirmed: glbLicenseConfirm.checked,
  });
  if (!license.ok) {
    setAssetStatus(license.errors.join(' '), 'error');
    return;
  }
  importGlbBtn.disabled = true;
  setAssetStatus('正在驗證 GLB 與骨架…');
  const generation = getSceneGeneration();
  const isCurrent = () => generation === getSceneGeneration();
  let importedFigure = null;
  let attached = false;
  try {
    const data = await file.arrayBuffer();
    if (!isCurrent()) {
      setAssetStatus('場景已變更，已取消過期 GLB 匯入。', 'error');
      return;
    }
    importedFigure = await importGlbArrayBuffer(data, license.metadata);
    if (!isCurrent()) {
      importedFigure.dispose?.();
      importedFigure = null;
      setAssetStatus('場景已變更，已取消過期 GLB 匯入。', 'error');
      return;
    }
    const assetId = await putAsset(data, license.metadata);
    if (!isCurrent()) {
      // Content-addressed records may already be shared by another figure or
      // scene. Cancellation never deletes IndexedDB data; an eventual GC can
      // reclaim unreferenced assets safely.
      importedFigure.dispose?.();
      importedFigure = null;
      setAssetStatus('場景已變更，已取消過期 GLB 匯入。', 'error');
      return;
    }
    importedFigure.assetRef.assetId = assetId;
    withHistory(() => {
      addImportedFigure(importedFigure, { assetId, assetName: license.metadata.assetName, license: license.metadata });
    });
    attached = true;
    scheduleSave();
    glbFileInput.value = '';
    setAssetStatus(`匯入成功：${license.metadata.assetName}（${assetId.slice(0, 12)}…）`, 'success');
  } catch (error) {
    if (!attached) importedFigure?.dispose?.();
    setAssetStatus(`匯入失敗：${error?.message || 'GLB 格式不正確。'}`, 'error');
  } finally {
    importGlbBtn.disabled = false;
  }
}
importGlbBtn.addEventListener('click', importSelectedGlb);
window.addEventListener('poseman-asset-warning', (event) => {
  setAssetStatus(String(event.detail || '外部資產無法載入。'), 'error');
});
removeFigureBtn.addEventListener('click', () => {
  if (!canRemoveFigure(figures.length)) return;
  withHistory(removeFigure);
  scheduleSave();
});

previewBtn.addEventListener('click', () => {
  state.previewMode = document.body.classList.toggle('preview');
  previewBtn.textContent = state.previewMode ? '離開預覽' : '預覽模式';
});

// ---------------------------------------------------------------- props UI
function syncTransformTarget() {
  if (!state.moveMode) {
    transform.detach();
    return;
  }
  const target = chooseTransformTarget({
    moveMode: state.moveMode,
    selectedProp: state.selectedProp,
    activeFigure: state.activeFigure,
  });
  if (target) transform.attach(target);
  else transform.detach();
}

function syncPropControls() {
  const p = state.selectedProp;
  const disabled = !p;
  currentPropSelect.value = p ? String(props.indexOf(p)) : '';
  propRotY.disabled = disabled;
  propScale.disabled = disabled;
  rotatePropBtn.disabled = disabled;
  deletePropBtn.disabled = disabled;
  if (!p) {
    propRotY.value = '0';
    propRotYVal.textContent = '0°';
    propScale.value = '1';
    propScaleVal.textContent = '1.00×';
    return;
  }
  const deg = Math.round(p.group.rotation.y / DEG);
  propRotY.value = String(Math.max(-180, Math.min(180, deg)));
  propRotYVal.textContent = `${deg}°`;
  const scale = clampPropScale(p.group.scale.x);
  propScale.value = String(scale);
  propScaleVal.textContent = `${scale.toFixed(2)}×`;
}

function refreshPropSelects(meta = undefined) {
  const keep = state.selectedProp ? String(props.indexOf(state.selectedProp)) : '';
  currentPropSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = props.length ? '選擇目前物品…' : '尚無物品';
  currentPropSelect.appendChild(placeholder);
  props.forEach((p, i) => {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = `物品 ${i + 1} ・ ${getPropDefinition(p.type)?.label || '未知物品'}`;
    currentPropSelect.appendChild(option);
  });
  currentPropSelect.value = keep;
  syncPropControls();
  if (meta?.bulk) setPanelSectionOpen('propsSection', false);
  if (state.selectedProp) openPanelSection('propsSection');
  syncTransformTarget();
}
setPropsChangeHandler(refreshPropSelects);

currentPropSelect.addEventListener('change', () => {
  const p = currentPropSelect.value === '' ? null : props[Number(currentPropSelect.value)];
  setActiveProp(p || null);
  // setActiveProp notifies the manager/UI; use one target-sync path so
  // clearing the prop selection in move mode reattaches the active figure.
  syncTransformTarget();
  scheduleSave();
});

addPropBtn.addEventListener('click', () => {
  if (!propSelect.value) return;
  withHistory(() => addProp(propSelect.value));
  propSelect.value = '';
  scheduleSave();
});

for (const [input, value, format] of [
  [propRotY, 'rotation', (v) => `${Math.round(v)}°`],
  [propScale, 'scale', (v) => `${Number(v).toFixed(2)}×`],
]) {
  input.addEventListener('pointerdown', beginGesture);
  input.addEventListener('keydown', beginGesture);
  input.addEventListener('input', () => {
    const p = state.selectedProp;
    if (!p) return;
    if (value === 'rotation') p.group.rotation.y = Number(input.value) * DEG;
    else p.group.scale.setScalar(clampPropScale(input.value));
    const display = value === 'rotation' ? Number(input.value) : clampPropScale(input.value);
    if (value === 'rotation') propRotYVal.textContent = format(display);
    else propScaleVal.textContent = format(display);
    scheduleSave();
  });
  input.addEventListener('change', endGesture);
}

rotatePropBtn.addEventListener('click', () => {
  if (!state.selectedProp) return;
  withHistory(() => {
    state.selectedProp.group.rotation.y = normalizePropRotation(state.selectedProp.group.rotation.y + 45 * DEG);
  });
  syncPropControls();
  scheduleSave();
});

deletePropBtn.addEventListener('click', () => {
  if (!state.selectedProp) return;
  withHistory(() => removeProp(state.selectedProp));
  syncPropControls();
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

// ---------------------------------------------------------------- keyboard shortcuts (T2-1)
function selectJoint(name) {
  state.activeJointName = name;
  jointSelect.value = name;
  syncSliders();
}

window.addEventListener('keydown', (e) => {
  const t = e.target;
  if (
    t &&
    (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
  ) {
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return; // ctrl/meta combos handled by undo/redo listener
  switch (e.key.toLowerCase()) {
    case 'm':
      moveBtn.click();
      break;
    case 'p':
      previewBtn.click();
      break;
    case 'g':
      gridToggle.click();
      break;
    case 'delete':
    case 'backspace':
      if (state.selectedProp) {
        withHistory(() => removeProp(state.selectedProp));
        scheduleSave();
      }
      break;
      case 'escape':
      if (state.moveMode) moveBtn.click();
      else {
        transform.detach();
        setActiveProp(null);
      }
      break;
    case '1':
      selectJoint('hips');
      break;
    case '2':
      selectJoint('chest');
      break;
    case '3':
      selectJoint('head');
      break;
  }
});

// ---------------------------------------------------------------- custom pose library (T2-2)
function refreshCustomPoseSelect(keep = '') {
  const map = loadCustomPoses();
  customPoseSelect.innerHTML = '';
  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = '自訂姿勢…';
  customPoseSelect.appendChild(ph);
  for (const name of Object.keys(map)) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    customPoseSelect.appendChild(opt);
  }
  customPoseSelect.value = Object.hasOwn(map, keep) ? keep : '';
}
refreshCustomPoseSelect();

savePoseBtn.addEventListener('click', () => {
  if (!state.activeFigure) return;
  const name = poseNameInput.value.trim() || `姿勢 ${new Date().toLocaleString()}`;
  const map = loadCustomPoses();
  map[name] = extractPose(state.activeFigure);
  saveCustomPoses(map);
  refreshCustomPoseSelect(name);
});

function applyCustomPose() {
  const map = loadCustomPoses();
  const pose = map[customPoseSelect.value];
  if (!state.activeFigure || !pose) return;
  withHistory(() => state.activeFigure.setPose(pose));
  syncSliders();
  scheduleSave();
}
applyPoseBtn.addEventListener('click', applyCustomPose);
customPoseSelect.addEventListener('change', applyCustomPose);

deletePoseBtn.addEventListener('click', () => {
  const name = customPoseSelect.value;
  if (!name) return;
  const map = loadCustomPoses();
  delete map[name];
  saveCustomPoses(map);
  refreshCustomPoseSelect();
});

exportPoseBtn.addEventListener('click', () => {
  if (!state.activeFigure) return;
  const blob = new Blob([JSON.stringify(extractPose(state.activeFigure), null, 2)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `poseman-pose-${stamp()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

importPoseBtn.addEventListener('click', () => poseFileInput.click());
poseFileInput.addEventListener('change', async () => {
  const file = poseFileInput.files[0];
  poseFileInput.value = '';
  if (!file) return;
  try {
    const pose = sanitizePose(JSON.parse(await file.text()));
    if (!Object.keys(pose).length) throw new Error('empty');
    const name = poseNameInput.value.trim() || file.name.replace(/\.json$/i, '');
    const map = loadCustomPoses();
    map[name] = pose;
    saveCustomPoses(map);
    refreshCustomPoseSelect(name);
  } catch {
    alert('匯入失敗：姿勢 JSON 格式不正確');
  }
});

// ---------------------------------------------------------------- mirror (T2-3)
function applyPoseTransform(fn) {
  if (!state.activeFigure) return;
  withHistory(() => state.activeFigure.setPose(fn(extractPose(state.activeFigure))));
  syncSliders();
  scheduleSave();
}
mirrorAllBtn.addEventListener('click', () => applyPoseTransform((p) => mirroredPose(p, 'all')));
mirrorArmsBtn.addEventListener('click', () => applyPoseTransform((p) => mirroredPose(p, 'arms')));
mirrorLegsBtn.addEventListener('click', () => applyPoseTransform((p) => mirroredPose(p, 'legs')));
copyLRBtn.addEventListener('click', () => applyPoseTransform((p) => copiedSidePose(p, 'LR')));
copyRLBtn.addEventListener('click', () => applyPoseTransform((p) => copiedSidePose(p, 'RL')));

// ---------------------------------------------------------------- export options (T2-4)
function download(url, name) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}

export2Btn.addEventListener('click', () => {
  const scale = Number(scaleSelect.value) || 1;
  const url = captureView({
    view: viewSelect.value,
    scale,
    transparent: transparentCheck.checked,
  });
  download(url, `poseman-${viewSelect.value}-${scale}x-${stamp()}.png`);
});

sheetBtn.addEventListener('click', async () => {
  const scale = Number(scaleSelect.value) || 1;
  const url = await captureSheet({ scale, transparent: transparentCheck.checked });
  download(url, `poseman-sheet-${scale}x-${stamp()}.png`);
});
