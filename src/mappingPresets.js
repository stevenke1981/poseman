import { JOINT_NAMES } from './mannequin.js';
import { safeString } from './glbImporter.js';

export const MAPPING_PRESET_STORAGE_KEY = 'poseman-glb-mapping-presets-v1';
export const MAPPING_PRESET_LIMITS = Object.freeze({
  maxPresets: 24,
  maxNameLength: 80,
  maxBoneNameLength: 160,
});

function storage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function sanitizeMapping(raw, limits = MAPPING_PRESET_LIMITS) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const mapping = Object.create(null);
  for (const joint of JOINT_NAMES) {
    if (!Object.hasOwn(source, joint)) continue;
    const bone = safeString(source[joint], limits.maxBoneNameLength);
    if (bone) mapping[joint] = bone;
  }
  return mapping;
}

export function sanitizeMappingPreset(raw, limits = MAPPING_PRESET_LIMITS) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const name = safeString(source.name, limits.maxNameLength);
  const mapping = sanitizeMapping(source.mapping, limits);
  return name ? { name, mapping } : null;
}

export function loadMappingPresets(limits = MAPPING_PRESET_LIMITS) {
  const store = storage();
  if (!store) return [];
  try {
    const raw = JSON.parse(store.getItem(MAPPING_PRESET_STORAGE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => sanitizeMappingPreset(item, limits)).filter(Boolean).slice(0, limits.maxPresets);
  } catch {
    return [];
  }
}

function persist(presets) {
  const store = storage();
  if (!store) return { ok: false, errors: ['目前瀏覽器不允許儲存映射預設。'] };
  try {
    store.setItem(MAPPING_PRESET_STORAGE_KEY, JSON.stringify(presets));
    return { ok: true, errors: [] };
  } catch {
    return { ok: false, errors: ['映射預設儲存空間不足或不可用。'] };
  }
}

export function saveMappingPreset(name, mapping, limits = MAPPING_PRESET_LIMITS) {
  const preset = sanitizeMappingPreset({ name, mapping }, limits);
  if (!preset) return { ok: false, errors: ['請輸入有效的映射預設名稱。'] };
  const presets = loadMappingPresets(limits).filter((item) => item.name !== preset.name);
  presets.unshift(preset);
  const result = persist(presets.slice(0, limits.maxPresets));
  return result.ok ? { ...result, preset, presets: loadMappingPresets(limits) } : result;
}

export function deleteMappingPreset(name, limits = MAPPING_PRESET_LIMITS) {
  const safeName = safeString(name, limits.maxNameLength);
  const presets = loadMappingPresets(limits).filter((item) => item.name !== safeName);
  const result = persist(presets);
  return result.ok ? { ...result, presets } : result;
}

export function getMappingPreset(name, limits = MAPPING_PRESET_LIMITS) {
  const safeName = safeString(name, limits.maxNameLength);
  return loadMappingPresets(limits).find((item) => item.name === safeName) || null;
}
