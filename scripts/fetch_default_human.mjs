import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const URL = 'https://raw.githubusercontent.com/Mesh2Motion/mesh2motion-app/05fadfd7a513d45e8b7504e84de5c3497d73c9d0/static/models-variation/human-male.glb';
const EXPECTED_BYTES = 534004;
const EXPECTED_SHA256 = 'c7c445f4309d8883667ca9f85ef6ba226c71f492c827af115c46c52bc450a019';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(repoRoot, 'public', 'templates', 'poseman-default-human.glb');

const response = await fetch(URL, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`下載來源失敗：HTTP ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
if (bytes.length !== EXPECTED_BYTES || sha256 !== EXPECTED_SHA256) {
  throw new Error(`來源內容驗證失敗：size=${bytes.length} sha256=${sha256}`);
}
if (!process.argv.includes('--write')) {
  console.log(`verified ${bytes.length} bytes sha256=${sha256}; pass --write to update ${output}`);
  process.exit(0);
}
await fs.mkdir(path.dirname(output), { recursive: true });
const temp = path.join(path.dirname(output), `.${path.basename(output)}.${process.pid}.${crypto.randomUUID()}.tmp`);
try {
  const handle = await fs.open(temp, 'wx');
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(temp, output);
} finally {
  await fs.rm(temp, { force: true });
}
console.log(`wrote ${output} (${bytes.length} bytes sha256=${sha256})`);
