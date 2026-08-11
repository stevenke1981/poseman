import * as THREE from 'three';
import { renderer, scene, camera, controls } from './scene.js';
import { figures } from './figures.js';
import { props } from './propsManager.js';

function sceneCenter() {
  const box = new THREE.Box3();
  for (const f of figures) box.expandByObject(f.group);
  for (const p of props) box.expandByObject(p.group);
  if (box.isEmpty()) return new THREE.Vector3(0, 1, 0);
  return box.getCenter(new THREE.Vector3());
}

// NOTE: always renderer.render() then toDataURL() in the same task.
export function captureView({ view = 'current', scale = 1, transparent = false } = {}) {
  const size = renderer.getSize(new THREE.Vector2());
  const prevPos = camera.position.clone();
  const prevTarget = controls.target.clone();
  const prevBg = scene.background;
  const prevFog = scene.fog;

  const center = sceneCenter();
  const dist = Math.max(camera.position.distanceTo(controls.target), 2);
  if (view === 'front') camera.position.set(center.x, center.y + 0.2, center.z + dist);
  else if (view === 'back') camera.position.set(center.x, center.y + 0.2, center.z - dist);
  else if (view === 'side') camera.position.set(center.x + dist, center.y + 0.2, center.z);
  else if (view === 'top') camera.position.set(center.x, center.y + dist, center.z + 0.001);
  if (view !== 'current') controls.target.copy(center);
  camera.lookAt(controls.target);

  if (transparent) {
    scene.background = null;
    scene.fog = null;
    renderer.setClearAlpha(0);
  }
  renderer.setSize(size.x * scale, size.y * scale, false);
  camera.aspect = size.x / size.y;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');

  renderer.setSize(size.x, size.y, false);
  camera.aspect = size.x / size.y;
  camera.position.copy(prevPos);
  controls.target.copy(prevTarget);
  scene.background = prevBg;
  scene.fog = prevFog;
  renderer.setClearAlpha(1);
  camera.updateProjectionMatrix();
  controls.update();
  return url;
}

export async function captureSheet({ scale = 1, transparent = false } = {}) {
  const urls = ['front', 'side', 'back', 'current'].map((v) =>
    captureView({ view: v, scale, transparent }),
  );
  const imgs = urls.map((u) => {
    const im = new Image();
    im.src = u;
    return im;
  });
  await Promise.all(imgs.map((im) => im.decode()));
  const w = imgs[0].width;
  const h = imgs[0].height;
  const canvas = document.createElement('canvas');
  canvas.width = w * 2;
  canvas.height = h * 2;
  const ctx = canvas.getContext('2d');
  if (!transparent) {
    ctx.fillStyle = '#cdd3ea';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(imgs[0], 0, 0);
  ctx.drawImage(imgs[1], w, 0);
  ctx.drawImage(imgs[2], 0, h);
  ctx.drawImage(imgs[3], w, h);
  return canvas.toDataURL('image/png');
}
