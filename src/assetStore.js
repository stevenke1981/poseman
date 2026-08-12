import { isAssetId, safeString } from './glbImporter.js';

const DB_NAME = 'poseman-assets-v1';
const STORE_NAME = 'glb';
const memoryAssets = new Map();

function cloneBuffer(buffer) {
  if (buffer instanceof ArrayBuffer) return buffer.slice(0);
  if (ArrayBuffer.isView(buffer)) return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  throw new TypeError('資產資料必須是 ArrayBuffer。');
}

async function digestSha256(buffer) {
  if (!globalThis.crypto?.subtle) throw new Error('目前瀏覽器不支援 SHA-256。');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', cloneBuffer(buffer));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function idbAvailable() {
  return typeof indexedDB !== 'undefined';
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!idbAvailable()) return resolve(null);
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'assetId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB 開啟失敗。'));
  });
}

function safeMetadata(metadata) {
  const source = metadata && typeof metadata === 'object' ? metadata : {};
  const value = (key) => Object.hasOwn(source, key) ? source[key] : undefined;
  return {
    assetName: safeString(value('assetName'), 120),
    licenseType: safeString(value('licenseType'), 24),
    author: safeString(value('author'), 160),
    source: safeString(value('source'), 500),
    notes: safeString(value('notes'), 500),
    confirmed: value('confirmed') === true,
  };
}

export async function assetIdFor(buffer) {
  return digestSha256(buffer);
}

export async function putAsset(buffer, metadata = {}) {
  const data = cloneBuffer(buffer);
  const assetId = await digestSha256(data);
  const record = { assetId, data, metadata: safeMetadata(metadata), savedAt: Date.now() };
  memoryAssets.set(assetId, record);
  const db = await openDb();
  if (!db) return assetId;
  await new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('資產寫入 IndexedDB 失敗。'));
  });
  return assetId;
}

export async function getAsset(assetId) {
  if (!isAssetId(assetId)) return null;
  const memory = memoryAssets.get(assetId.toLowerCase());
  if (memory) return { ...memory, data: cloneBuffer(memory.data) };
  const db = await openDb();
  if (!db) return null;
  const record = await new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(assetId.toLowerCase());
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('資產讀取 IndexedDB 失敗。'));
  });
  return record ? { ...record, data: cloneBuffer(record.data) } : null;
}

export async function hasAsset(assetId) {
  return !!(await getAsset(assetId));
}

export async function deleteAsset(assetId) {
  if (!isAssetId(assetId)) return;
  memoryAssets.delete(assetId.toLowerCase());
  const db = await openDb();
  if (!db) return;
  await new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(assetId.toLowerCase());
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('資產刪除 IndexedDB 失敗。'));
  });
}

export function clearMemoryAssetsForTests() {
  memoryAssets.clear();
}
