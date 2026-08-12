export const DEFAULT_HUMAN = Object.freeze({
  publicPath: '/templates/poseman-default-human.glb',
  commit: '05fadfd7a513d45e8b7504e84de5c3497d73c9d0',
  upstreamPath: 'static/models-variation/human-female.glb',
  bytes: 1_358_928,
  sha256: '2b1c47e5eeebffd5097eb8a52add4ba6556dab85e50fc1c5240d744099bebae1',
  assetName: 'Mesh2Motion human-female',
  source: 'https://github.com/Mesh2Motion/mesh2motion-app/blob/05fadfd7a513d45e8b7504e84de5c3497d73c9d0/static/models-variation/human-female.glb',
  licenseUrl: 'https://github.com/Mesh2Motion/mesh2motion-app/blob/05fadfd7a513d45e8b7504e84de5c3497d73c9d0/LICENSE-CC0.MD',
  license: Object.freeze({
    licenseType: 'cc0',
    assetName: 'Mesh2Motion human-female',
    author: 'Mesh2Motion',
    source: 'https://github.com/Mesh2Motion/mesh2motion-app/blob/05fadfd7a513d45e8b7504e84de5c3497d73c9d0/static/models-variation/human-female.glb',
    notes: 'Pinned Mesh2Motion CC0 human-female.glb',
    confirmed: true,
  }),
});

export function isDefaultHumanAssetId(value) {
  return typeof value === 'string' && value.toLowerCase() === DEFAULT_HUMAN.sha256;
}

export async function sha256Hex(buffer) {
  if (!globalThis.crypto?.subtle) throw new Error('目前環境不支援 SHA-256。');
  const bytes = buffer instanceof ArrayBuffer
    ? buffer
    : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function verifyDefaultHumanBytes(buffer) {
  const bytes = buffer instanceof Uint8Array
    ? buffer
    : new Uint8Array(buffer instanceof ArrayBuffer ? buffer : buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (bytes.byteLength !== DEFAULT_HUMAN.bytes) {
    throw new Error(`預設人體大小不符：size=${bytes.byteLength}`);
  }
  const sha256 = await sha256Hex(bytes);
  if (sha256 !== DEFAULT_HUMAN.sha256) {
    throw new Error(`預設人體雜湊不符：sha256=${sha256}`);
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export async function loadBundledDefaultHumanBuffer() {
  if (typeof fetch !== 'function') throw new Error('目前環境無法載入預設人體。');
  const response = await fetch(DEFAULT_HUMAN.publicPath, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`下載預設人體失敗：HTTP ${response.status}`);
  return verifyDefaultHumanBytes(await response.arrayBuffer());
}
