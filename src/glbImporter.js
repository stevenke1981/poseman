import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { JOINT_NAMES } from './mannequin.js';

// GLB is deliberately handled as a bounded, local-only format.  The parser
// never follows a network URI: a scene must be self-contained apart from
// data URI references that GLTFLoader can resolve from the supplied buffer.
export const GLB_LIMITS = Object.freeze({
  maxBytes: 25 * 1024 * 1024,
  maxNodes: 512,
  maxMeshes: 128,
  maxBones: 256,
  maxVertices: 500_000,
  maxAccessors: 2_048,
  maxAccessorCount: 2_000_000,
  maxAccessorElements: 8_000_000,
  maxDecodedBytes: 64 * 1024 * 1024,
  maxSparseCount: 500_000,
  maxImages: 32,
  maxImageDataUriBytes: 8 * 1024 * 1024,
  maxImageEncodedBytes: 16 * 1024 * 1024,
  maxImageDimension: 8192,
  maxImagePixels: 33_554_432,
  maxImagePixelsTotal: 33_554_432,
  maxImageDecodedBytes: 128 * 1024 * 1024,
});

export const LICENSE_TYPES = Object.freeze({
  own: '自有',
  cc0: 'CC0',
  'cc-by-4.0': 'CC BY 4.0',
  other: '其他',
});

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const LICENSE_KEY = /^[a-z0-9.-]{1,24}$/;
const ASSET_ID = /^[a-f0-9]{64}$/i;

function own(obj, key) {
  return !!obj && typeof obj === 'object' && Object.hasOwn(obj, key);
}

export function safeString(value, maxLength = 160) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength);
}

export function validateLicenseMetadata(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const errors = [];
  const licenseType = own(source, 'licenseType') && typeof source.licenseType === 'string'
    ? source.licenseType
    : '';
  const assetName = safeString(own(source, 'assetName') ? source.assetName : '', 120);
  const author = safeString(own(source, 'author') ? source.author : '', 160);
  const licenseSource = safeString(own(source, 'source') ? source.source : '', 500);
  const notes = safeString(own(source, 'notes') ? source.notes : '', 500);
  const confirmed = own(source, 'confirmed') && source.confirmed === true;
  if (!LICENSE_KEY.test(licenseType) || !Object.hasOwn(LICENSE_TYPES, licenseType)) {
    errors.push('請選擇有效的授權類型。');
  }
  if (!assetName) errors.push('請填寫資產名稱。');
  if (licenseType === 'cc-by-4.0' || licenseType === 'other') {
    if (!author) errors.push('CC BY 4.0／其他授權必須填寫作者。');
    if (!licenseSource && licenseType === 'cc-by-4.0') errors.push('CC BY 4.0 必須填寫 https 來源。');
    if (licenseType === 'other' && !licenseSource && !notes) {
      errors.push('其他授權請填寫 https 來源或授權說明。');
    }
  }
  if (licenseSource) {
    try {
      const parsed = new URL(licenseSource);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) throw new Error('unsafe');
    } catch {
      errors.push('來源網址必須是沒有帳密的 https:// 網址。');
    }
  }
  if (!confirmed) errors.push('請勾選「我有權使用並已核對授權」。');
  return {
    ok: errors.length === 0,
    errors,
    metadata: {
      licenseType: Object.hasOwn(LICENSE_TYPES, licenseType) ? licenseType : 'other',
      assetName,
      author,
      source: licenseSource,
      notes,
      confirmed,
    },
  };
}

function bytesView(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new TypeError('GLB 必須是 ArrayBuffer。');
}

function readU32(view, offset) {
  return view.getUint32(offset, true);
}

export function validateGlbHeader(input, limits = GLB_LIMITS) {
  const bytes = bytesView(input);
  const errors = [];
  if (bytes.byteLength > limits.maxBytes) errors.push(`GLB 超過大小上限 ${Math.round(limits.maxBytes / 1024 / 1024)} MiB。`);
  if (bytes.byteLength < 20) errors.push('GLB 標頭或 JSON chunk 不完整。');
  if (errors.length) return { ok: false, errors, bytes };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = readU32(view, 0);
  const version = readU32(view, 4);
  const declaredLength = readU32(view, 8);
  if (magic !== 0x46546c67) errors.push('不是有效的 glTF/GLB 檔案（magic 不符）。');
  if (version !== 2) errors.push('僅支援 glTF 2.0 GLB。');
  if (declaredLength < 20 || declaredLength > bytes.byteLength) errors.push('GLB 宣告長度不合法。');
  if (declaredLength !== bytes.byteLength) errors.push('GLB 宣告長度與實際檔案長度不一致。');
  if (declaredLength > bytes.byteLength) {
    return { ok: false, errors, bytes, magic, version, declaredLength, chunks: [], json: null, jsonText: '', bin: null };
  }
  let offset = 12;
  let json = null;
  let bin = null;
  const chunks = [];
  while (offset + 8 <= declaredLength) {
    const chunkLength = readU32(view, offset);
    const chunkType = readU32(view, offset + 4);
    offset += 8;
    if (chunkLength > declaredLength - offset) {
      errors.push('GLB chunk 長度超出宣告範圍。');
      break;
    }
    const chunk = bytes.slice(offset, offset + chunkLength);
    chunks.push({ type: chunkType, length: chunkLength });
    if (chunkType === 0x4e4f534a && !json) json = chunk;
    if (chunkType === 0x004e4942 && !bin) bin = chunk;
    offset += chunkLength;
  }
  if (offset !== declaredLength) errors.push('GLB chunk 尾端不完整。');
  if (!json) errors.push('GLB 缺少 JSON chunk。');
  let jsonText = '';
  let jsonData = null;
  if (json) {
    try {
      jsonText = new TextDecoder('utf-8', { fatal: true }).decode(json).replace(/\u0000+$/g, '').trim();
      jsonData = JSON.parse(jsonText);
    } catch {
      errors.push('GLB JSON chunk 格式不正確。');
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    bytes,
    magic,
    version,
    declaredLength,
    chunks,
    json: jsonData,
    jsonText,
    bin,
  };
}

function countVertices(gltf) {
  const accessors = Array.isArray(gltf.accessors) ? gltf.accessors : [];
  const meshes = Array.isArray(gltf.meshes) ? gltf.meshes : [];
  let vertices = 0;
  for (const mesh of meshes) {
    if (!mesh || typeof mesh !== 'object' || !Array.isArray(mesh.primitives)) continue;
    for (const primitive of mesh.primitives) {
      const index = primitive?.attributes?.POSITION;
      const accessor = Number.isInteger(index) ? accessors[index] : null;
      if (accessor && Number.isFinite(accessor.count)) vertices += accessor.count;
    }
  }
  return vertices;
}

function checkExternalUris(gltf, limits = GLB_LIMITS) {
  const errors = [];
  for (const [kind, entries] of [['buffer', gltf.buffers], ['image', gltf.images]]) {
    if (!Array.isArray(entries)) continue;
    entries.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object' || typeof entry.uri !== 'string') return;
      if (!/^data:/i.test(entry.uri)) errors.push(`${kind}[${index}] 不得引用外部 URI；請將資料內嵌為 data: 或 bufferView。`);
      const maxUriBytes = kind === 'image' ? limits.maxImageDataUriBytes : limits.maxDecodedBytes;
      if (entry.uri.length > maxUriBytes) errors.push(`${kind}[${index}] data URI 過長。`);
    });
  }
  return errors;
}

const COMPONENT_BYTES = Object.freeze({ 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5124: 4, 5125: 4, 5126: 4 });
const TYPE_ARITY = Object.freeze({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 });

function finiteNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateAccessorPayload(source, limits) {
  const errors = [];
  const accessors = Array.isArray(source.accessors) ? source.accessors : [];
  const bufferViews = Array.isArray(source.bufferViews) ? source.bufferViews : [];
  let decodedBytes = 0;
  let decodedElements = 0;
  if (accessors.length > limits.maxAccessors) errors.push(`GLB accessor 過多（上限 ${limits.maxAccessors}）。`);
  for (const [index, accessor] of accessors.entries()) {
    if (!accessor || typeof accessor !== 'object' || Array.isArray(accessor)) {
      errors.push(`accessor[${index}] 格式不正確。`);
      continue;
    }
    const count = accessor.count;
    const componentBytes = COMPONENT_BYTES[accessor.componentType];
    const arity = TYPE_ARITY[accessor.type];
    if (!finiteNonNegativeInteger(count) || count > limits.maxAccessorCount) {
      errors.push(`accessor[${index}] count 超過安全上限。`);
      continue;
    }
    if (!componentBytes || !arity) {
      errors.push(`accessor[${index}] componentType/type 不支援。`);
      continue;
    }
    const elementBytes = componentBytes * arity;
    const byteLength = count * elementBytes;
    if (!Number.isSafeInteger(byteLength) || byteLength > limits.maxDecodedBytes || decodedBytes > limits.maxDecodedBytes - byteLength) {
      errors.push(`accessor[${index}] 解碼大小超過安全上限。`);
    } else {
      decodedBytes += byteLength;
    }
    if (decodedElements > limits.maxAccessorElements - count) errors.push(`accessor 元素總量超過安全上限。`);
    else decodedElements += count;
    if (accessor.bufferView !== undefined) {
      const view = finiteNonNegativeInteger(accessor.bufferView) ? bufferViews[accessor.bufferView] : null;
      if (!view || !finiteNonNegativeInteger(view.byteLength)) errors.push(`accessor[${index}] bufferView 不正確。`);
      else {
        const stride = view.byteStride === undefined ? elementBytes : view.byteStride;
        if (!finiteNonNegativeInteger(stride) || stride < elementBytes || stride > limits.maxDecodedBytes) errors.push(`accessor[${index}] byteStride 不安全。`);
        const offset = accessor.byteOffset === undefined ? 0 : accessor.byteOffset;
        if (!finiteNonNegativeInteger(offset) || offset > view.byteLength || (count > 0 && offset + (count - 1) * stride + elementBytes > view.byteLength)) {
          errors.push(`accessor[${index}] 範圍超出 bufferView。`);
        }
      }
    }
    const sparse = accessor.sparse;
    if (sparse !== undefined) {
      if (!sparse || typeof sparse !== 'object' || !finiteNonNegativeInteger(sparse.count) || sparse.count > limits.maxSparseCount || sparse.count > count) {
        errors.push(`accessor[${index}] sparse.count 不安全。`);
      } else {
        const indices = sparse.indices;
        const values = sparse.values;
        if (!indices || !values || !finiteNonNegativeInteger(indices.bufferView) || !finiteNonNegativeInteger(values.bufferView)) {
          errors.push(`accessor[${index}] sparse indices/values 不完整。`);
        }
        const sparseIndexBytes = COMPONENT_BYTES[indices?.componentType];
        if (!sparseIndexBytes || ![5121, 5123, 5125].includes(indices?.componentType)) errors.push(`accessor[${index}] sparse index type 不支援。`);
        const sparseBytes = sparse.count * (sparseIndexBytes || 0) + sparse.count * elementBytes;
        if (!Number.isSafeInteger(sparseBytes) || sparseBytes > limits.maxDecodedBytes || decodedBytes > limits.maxDecodedBytes - sparseBytes) errors.push(`accessor[${index}] sparse 解碼大小超過上限。`);
        else decodedBytes += sparseBytes;
      }
    }
  }
  return { errors, decodedBytes, decodedElements };
}

function bytesFromDataUri(uri) {
  const comma = uri.indexOf(',');
  if (comma < 0) return null;
  const header = uri.slice(0, comma);
  const payload = uri.slice(comma + 1);
  try {
    if (/;base64/i.test(header)) {
      if (!/^[a-z0-9+/\s=_-]*$/i.test(payload)) return null;
      const binary = atob(payload.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/'));
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return bytes;
    }
    return new TextEncoder().encode(decodeURIComponent(payload));
  } catch {
    return null;
  }
}

function imageMime(uri, declared) {
  const fromUri = typeof uri === 'string' ? /^data:([^;,]+)/i.exec(uri)?.[1]?.toLowerCase() : '';
  const mime = String(declared || fromUri || '').toLowerCase();
  return mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/webp' ? mime : '';
}

function imageDimensions(bytes, mime) {
  if (!bytes || bytes.length < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === 'image/png') {
    if (bytes.length < 24 || view.getUint32(0, false) !== 0x89504e47 || view.getUint32(4, false) !== 0x0d0a1a0a || view.getUint32(12, false) !== 0x49484452) return null;
    return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
  }
  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) return null;
      const length = view.getUint16(offset, false);
      if (length < 2 || offset + length > bytes.length) return null;
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        if (length < 7) return null;
        return { width: view.getUint16(offset + 5, false), height: view.getUint16(offset + 3, false) };
      }
      offset += length;
    }
    return null;
  }
  if (mime === 'image/webp') {
    if (bytes.length < 30 || view.getUint32(0, false) !== 0x52494646 || view.getUint32(8, false) !== 0x57454250) return null;
    const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (chunk === 'VP8X' && bytes.length >= 30) {
      return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) };
    }
    if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
    if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      const width = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8);
      const height = 1 + ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10));
      return { width, height };
    }
  }
  return null;
}

function resolveBufferViewBytes(source, view, bin, limits) {
  if (!view || typeof view !== 'object' || !finiteNonNegativeInteger(view.buffer)) return null;
  const buffers = Array.isArray(source.buffers) ? source.buffers : [];
  const bufferIndex = view.buffer;
  const buffer = buffers[bufferIndex];
  if (!buffer || typeof buffer !== 'object' || Array.isArray(buffer)) return null;
  let bytes = null;
  if (typeof buffer.uri === 'string') {
    if (!/^data:/i.test(buffer.uri) || buffer.uri.length > limits.maxDecodedBytes) return null;
    bytes = bytesFromDataUri(buffer.uri);
  } else if (bufferIndex === 0) {
    bytes = bin;
  }
  if (!bytes) return null;
  if (!finiteNonNegativeInteger(buffer.byteLength) || buffer.byteLength > limits.maxDecodedBytes || bytes.byteLength < buffer.byteLength) return null;
  const offset = view.byteOffset === undefined ? 0 : view.byteOffset;
  const length = view.byteLength;
  if (!finiteNonNegativeInteger(offset) || !finiteNonNegativeInteger(length) || offset > buffer.byteLength || length > buffer.byteLength - offset) return null;
  return bytes.slice(offset, offset + length);
}

export function validateImagePayloads(source, bin, limits = GLB_LIMITS) {
  const errors = [];
  const images = Array.isArray(source.images) ? source.images : [];
  const views = Array.isArray(source.bufferViews) ? source.bufferViews : [];
  let totalBytes = 0;
  let totalPixels = 0;
  let totalDecodedBytes = 0;
  for (const [index, image] of images.entries()) {
    let bytes = null;
    let mime = imageMime(image?.uri, image?.mimeType);
    if (typeof image?.uri === 'string') bytes = bytesFromDataUri(image.uri);
    else if (image?.bufferView !== undefined) {
      const viewIndex = image.bufferView;
      const view = finiteNonNegativeInteger(viewIndex) ? views[viewIndex] : null;
      bytes = resolveBufferViewBytes(source, view, bin, limits);
    }
    if (!bytes || bytes.byteLength > limits.maxImageEncodedBytes) {
      errors.push(`image[${index}] 圖片資料無法安全辨識或超過編碼大小上限。`);
      continue;
    }
    totalBytes += bytes.byteLength;
    if (totalBytes > limits.maxImageEncodedBytes) {
      errors.push(`GLB 圖片編碼資料總量超過上限。`);
      break;
    }
    if (!mime) {
      if (bytes[0] === 0x89 && bytes[1] === 0x50) mime = 'image/png';
      else if (bytes[0] === 0xff && bytes[1] === 0xd8) mime = 'image/jpeg';
      else if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) mime = 'image/webp';
    }
    const dimensions = imageDimensions(bytes, mime);
    if (!dimensions || !Number.isSafeInteger(dimensions.width) || !Number.isSafeInteger(dimensions.height) || dimensions.width < 1 || dimensions.height < 1 || dimensions.width > limits.maxImageDimension || dimensions.height > limits.maxImageDimension || dimensions.width * dimensions.height > limits.maxImagePixels) {
      errors.push(`image[${index}] 格式未支援、損壞或像素尺寸超過安全上限。`);
      continue;
    }
    const pixels = dimensions.width * dimensions.height;
    const decodedBytes = pixels * 4;
    if (!Number.isSafeInteger(pixels) || !Number.isSafeInteger(decodedBytes)
      || totalPixels > limits.maxImagePixelsTotal - pixels
      || totalDecodedBytes > limits.maxImageDecodedBytes - decodedBytes) {
      errors.push(`GLB 圖片解碼後總像素或記憶體超過安全上限。`);
      continue;
    }
    totalPixels += pixels;
    totalDecodedBytes += decodedBytes;
  }
  return errors;
}

export function validateGltfJson(gltf, limits = GLB_LIMITS) {
  const source = gltf && typeof gltf === 'object' && !Array.isArray(gltf) ? gltf : null;
  const errors = [];
  if (!source) return { ok: false, errors: ['GLB JSON 必須是物件。'] };
  if (source.asset?.version !== '2.0') errors.push('GLB asset.version 必須是 2.0。');
  const nodes = Array.isArray(source.nodes) ? source.nodes : [];
  const meshes = Array.isArray(source.meshes) ? source.meshes : [];
  const skins = Array.isArray(source.skins) ? source.skins : [];
  const images = Array.isArray(source.images) ? source.images : [];
  const bones = skins.reduce((sum, skin) => sum + (Array.isArray(skin?.joints) ? skin.joints.length : 0), 0);
  const vertices = countVertices(source);
  if (nodes.length > limits.maxNodes) errors.push(`GLB 節點過多（上限 ${limits.maxNodes}）。`);
  if (meshes.length > limits.maxMeshes) errors.push(`GLB 網格過多（上限 ${limits.maxMeshes}）。`);
  if (bones > limits.maxBones) errors.push(`GLB 骨骼過多（上限 ${limits.maxBones}）。`);
  if (vertices > limits.maxVertices) errors.push(`GLB 頂點過多（上限 ${limits.maxVertices}）。`);
  if (images.length > limits.maxImages) errors.push(`GLB 圖片過多（上限 ${limits.maxImages}）。`);
  for (const [index, image] of images.entries()) {
    if (!image || typeof image !== 'object') {
      errors.push(`image[${index}] 格式不正確。`);
      continue;
    }
    if (image.uri === undefined && image.bufferView === undefined) errors.push(`image[${index}] 缺少 uri 或 bufferView。`);
    if (image.bufferView !== undefined) {
      const views = Array.isArray(source.bufferViews) ? source.bufferViews : [];
      const view = finiteNonNegativeInteger(image.bufferView) ? views[image.bufferView] : null;
      if (!view || !finiteNonNegativeInteger(view.byteLength) || view.byteLength > limits.maxImageDataUriBytes) errors.push(`image[${index}] bufferView 超過大小上限。`);
    }
  }
  const hasSkinnedMesh = nodes.some((node) => {
    const mesh = Number.isInteger(node?.mesh) ? meshes[node.mesh] : null;
    return Number.isInteger(node?.skin) && mesh?.primitives?.some((p) => p?.attributes?.JOINTS_0 !== undefined && p?.attributes?.WEIGHTS_0 !== undefined);
  });
  if (!hasSkinnedMesh) errors.push('GLB 必須包含 SkinnedMesh 與骨架。');
  if (!skins.length || bones < JOINT_NAMES.length) errors.push('GLB 骨架不足，至少需要 17 個人體關節。');
  errors.push(...checkExternalUris(source, limits));
  const accessorStats = validateAccessorPayload(source, limits);
  errors.push(...accessorStats.errors);
  return { ok: errors.length === 0, errors, counts: { nodes: nodes.length, meshes: meshes.length, bones, vertices, ...accessorStats } };
}

const ALIASES = Object.freeze({
  hips: ['hips', 'pelvis', 'root', 'mixamorighips'],
  spine: ['spine', 'spine1', 'spine001', 'lowerback', 'lumbar'],
  chest: ['spine2', 'spine3', 'spine002', 'spine003', 'chest', 'upperchest', 'torso'],
  neck: ['neck', 'cervical'],
  head: ['head', 'skull'],
  // PoseMan's shoulder is the upper-arm pivot (not a clavicle); elbow is the
  // forearm pivot.  This matches Mixamo LeftArm/LeftForeArm and Blender
  // upper_arm.L/forearm.L semantics while retaining common VRM aliases.
  shoulderL: ['leftarm', 'leftupperarm', 'upperarml', 'lupperarm', 'leftshoulderarm', 'shoulderl'],
  shoulderR: ['rightarm', 'rightupperarm', 'upperarmr', 'rupperarm', 'rightshoulderarm', 'shoulderr'],
  elbowL: ['leftforearm', 'forearml', 'lowerarml', 'lforearm', 'leftelbow', 'elbowl'],
  elbowR: ['rightforearm', 'forearmr', 'lowerarmr', 'rforearm', 'rightelbow', 'elbowr'],
  wristL: ['lefthand', 'leftwrist', 'handl', 'wristl', 'lefthandwrist'],
  wristR: ['righthand', 'rightwrist', 'handr', 'wristr', 'righthandwrist'],
  hipL: ['leftupleg', 'leftthigh', 'leftupperleg', 'thighl', 'upperlegl', 'hipl'],
  hipR: ['rightupleg', 'rightthigh', 'rightupperleg', 'thighr', 'upperlegr', 'hipr'],
  kneeL: ['leftshin', 'leftknee', 'leftleg', 'leftlowerleg', 'shinl', 'calfl', 'lowerlegl', 'kneel'],
  kneeR: ['rightshin', 'rightknee', 'rightleg', 'rightlowerleg', 'shinr', 'calfr', 'lowerlegr', 'kneer'],
  ankleL: ['leftfoot', 'leftankle', 'footl', 'anklel', 'lefttoe'],
  ankleR: ['rightfoot', 'rightankle', 'footr', 'ankler', 'righttoe'],
});

function normalizeBoneName(name) {
  return safeString(name, 160).toLowerCase().replace(/mixamorig[:_\-.]?/g, '').replace(/[^a-z0-9]/g, '');
}

export function mapSkeletonBones(bones) {
  const list = Array.isArray(bones) ? bones.filter((bone) => bone && typeof bone.name === 'string') : [];
  const used = new Set();
  const mapping = Object.create(null);
  for (const joint of JOINT_NAMES) {
    const aliases = ALIASES[joint] || [];
    let best = null;
    for (const bone of list) {
      if (used.has(bone)) continue;
      const normalized = normalizeBoneName(bone.name);
      const score = aliases.reduce((max, alias, index) => {
        const a = normalizeBoneName(alias);
        if (normalized === a) return Math.max(max, 100 - index);
        if (normalized.endsWith(a) || normalized.startsWith(a)) return Math.max(max, 60 - index);
        return max;
      }, 0);
      if (score > (best?.score || 0)) best = { bone, score };
    }
    if (best?.score > 0) {
      mapping[joint] = best.bone.name;
      used.add(best.bone);
    }
  }
  const missing = JOINT_NAMES.filter((joint) => !Object.hasOwn(mapping, joint));
  return { mapping, missing, complete: missing.length === 0 };
}

function makeJointController(bone, restQuaternion) {
  const delta = new THREE.Euler(0, 0, 0, 'XYZ');
  let updating = false;
  const sync = () => {
    if (updating) return;
    updating = true;
    bone.quaternion.copy(restQuaternion);
    bone.quaternion.multiply(new THREE.Quaternion().setFromEuler(delta));
    bone.updateMatrixWorld(true);
    updating = false;
  };
  const rotation = {};
  for (const axis of ['x', 'y', 'z']) {
    Object.defineProperty(rotation, axis, {
      enumerable: true,
      get: () => delta[axis],
      set: (value) => {
        if (Number.isFinite(Number(value))) {
          delta[axis] = THREE.MathUtils.clamp(Number(value), -Math.PI, Math.PI);
          sync();
        }
      },
    });
  }
  rotation.set = (x = 0, y = 0, z = 0) => {
    delta.set(
      Number.isFinite(Number(x)) ? THREE.MathUtils.clamp(Number(x), -Math.PI, Math.PI) : 0,
      Number.isFinite(Number(y)) ? THREE.MathUtils.clamp(Number(y), -Math.PI, Math.PI) : 0,
      Number.isFinite(Number(z)) ? THREE.MathUtils.clamp(Number(z), -Math.PI, Math.PI) : 0,
    );
    sync();
    return rotation;
  };
  rotation.toArray = () => [delta.x, delta.y, delta.z];
  return { rotation, sync };
}

function disposeMaterial(material, seenMaterials, seenTextures) {
  if (!material || seenMaterials.has(material)) return;
  seenMaterials.add(material);
  for (const value of Object.values(material)) {
    if (value?.isTexture && !seenTextures.has(value)) {
      seenTextures.add(value);
      value.dispose();
    }
  }
  material.dispose?.();
}

export function createImportedFigure(gltf, metadata = {}) {
  const sourceRoot = gltf?.scene;
  if (!sourceRoot || typeof sourceRoot.traverse !== 'function') throw new Error('GLB 缺少可顯示的 scene。');
  const model = SkeletonUtils.clone(sourceRoot);
  const root = new THREE.Group();
  root.name = 'poseman-imported-figure';
  root.add(model);
  // SkeletonUtils preserves the rig while geometry/material ownership remains
  // explicit per imported figure; disposal can never touch another figure.
  model.traverse((object) => {
    if (!object.isMesh) return;
    if (object.geometry?.clone) object.geometry = object.geometry.clone();
    if (Array.isArray(object.material)) object.material = object.material.map((material) => material?.clone?.() || material);
    else if (object.material?.clone) object.material = object.material.clone();
  });
  const skinnedMeshes = [];
  model.traverse((object) => {
    if (object.isSkinnedMesh) skinnedMeshes.push(object);
  });
  if (!skinnedMeshes.length) throw new Error('GLB 沒有 SkinnedMesh。');
  const skeletons = [];
  const seenSkeletons = new Set();
  for (const mesh of skinnedMeshes) {
    const skeleton = mesh.skeleton;
    if (!skeleton || seenSkeletons.has(skeleton)) continue;
    seenSkeletons.add(skeleton);
    const bones = Array.isArray(skeleton.bones) ? skeleton.bones : [];
    skeletons.push({ bones, mapping: mapSkeletonBones(bones) });
  }
  const rig = skeletons.find((candidate) => candidate.mapping.complete);
  if (!rig) {
    const missing = skeletons[0]?.mapping?.missing || JOINT_NAMES;
    throw new Error(`同一 SkinnedMesh 骨架缺少必要關節：${missing.join('、')}`);
  }
  const { bones, mapping: result } = rig;
  const joints = Object.create(null);
  const restRotations = Object.create(null);
  for (const joint of JOINT_NAMES) {
    const bone = bones.find((item) => item.name === result.mapping[joint]);
    restRotations[joint] = bone.quaternion.clone();
    joints[joint] = makeJointController(bone, restRotations[joint]);
  }
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const height = box.max.y - box.min.y;
  if (Number.isFinite(height) && height > 1e-5) model.scale.multiplyScalar(1.72 / height);
  model.updateMatrixWorld(true);
  const normalizedBox = new THREE.Box3().setFromObject(model);
  const center = normalizedBox.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= normalizedBox.min.y;
  model.updateMatrixWorld(true);
  const pickMeshes = [];
  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.userData.joint = 'hips';
    object.userData.figureRoot = root;
    pickMeshes.push(object);
  });
  // Skinned vertices may be influenced by several bones, so a ray hit alone
  // cannot reliably identify the intended PoseMan joint.  Small invisible
  // raycastable spheres on each mapped bone provide deterministic joint picks
  // without changing the imported model's appearance.
  for (const joint of JOINT_NAMES) {
    const bone = bones.find((item) => item.name === result.mapping[joint]);
    const proxy = new THREE.Object3D();
    proxy.name = `poseman-pick-${joint}`;
    proxy.userData.joint = joint;
    proxy.userData.figureRoot = root;
    // Custom raycast keeps proxies invisible and absent from visual bounds.
    proxy.raycast = (raycaster, intersections) => {
      const center = new THREE.Vector3();
      proxy.getWorldPosition(center);
      const hit = raycaster.ray.intersectSphere(new THREE.Sphere(center, 0.095), new THREE.Vector3());
      if (!hit) return;
      intersections.push({ distance: raycaster.ray.origin.distanceTo(hit), point: hit, object: proxy });
    };
    bone.add(proxy);
    pickMeshes.push(proxy);
  }
  const ownedGeometry = new Set();
  const ownedMaterials = new Set();
  model.traverse((object) => {
    if (!object.isMesh) return;
    if (object.geometry) ownedGeometry.add(object.geometry);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material && ownedMaterials.add(material));
  });
  let disposed = false;
  const figure = {
    group: root,
    joints,
    pickMeshes,
    female: false,
    appearance: {},
    imported: true,
    assetName: safeString(metadata.assetName, 120),
    license: metadata.license,
    assetRef: {
      assetId: ASSET_ID.test(metadata.assetId || '') ? metadata.assetId.toLowerCase() : '',
      mapping: { ...result.mapping },
    },
    mapping: { ...result.mapping },
    restRotations,
    setPose(pose) {
      if (!pose || typeof pose !== 'object' || Array.isArray(pose)) return;
      for (const joint of JOINT_NAMES) {
        const rotation = pose[joint];
        if (Array.isArray(rotation) && rotation.length >= 3) joints[joint].rotation.set(
          Number(rotation[0]) * Math.PI / 180,
          Number(rotation[1]) * Math.PI / 180,
          Number(rotation[2]) * Math.PI / 180,
        );
      }
    },
    resetPose() {
      for (const joint of JOINT_NAMES) joints[joint].rotation.set(0, 0, 0);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of ownedGeometry) geometry.dispose?.();
      const textures = new Set();
      for (const material of ownedMaterials) disposeMaterial(material, new Set(), textures);
      root.removeFromParent();
    },
  };
  for (const mesh of pickMeshes) mesh.userData.figure = figure;
  return figure;
}

export async function importGlbArrayBuffer(arrayBuffer, metadata = {}, limits = GLB_LIMITS) {
  const header = validateGlbHeader(arrayBuffer, limits);
  if (!header.ok) throw new Error(header.errors.join(' '));
  const json = validateGltfJson(header.json, limits);
  if (!json.ok) throw new Error(json.errors.join(' '));
  const imageErrors = validateImagePayloads(header.json, header.bin, limits);
  if (imageErrors.length) throw new Error(imageErrors.join(' '));
  const loader = new GLTFLoader();
  const gltf = await new Promise((resolve, reject) => {
    loader.parse(header.bytes.buffer.slice(header.bytes.byteOffset, header.bytes.byteOffset + header.bytes.byteLength), '', resolve, reject);
  });
  return createImportedFigure(gltf, metadata);
}

export function isAssetId(value) {
  return typeof value === 'string' && ASSET_ID.test(value);
}
