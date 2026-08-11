import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { app } from './dom.js';

// ---------------------------------------------------------------- renderer
// Export re-renders right before capture, so preserveDrawingBuffer is not needed.
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcdd3ea);
scene.fog = new THREE.Fog(0xcdd3ea, 14, 34);

export const HOME_POS = new THREE.Vector3(1.7, 2.3, 3.6);
export const HOME_TARGET = new THREE.Vector3(0, 1, 0);

export const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
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
export const grid = new THREE.GridHelper(40, 80, 0x8d96bd, 0xaab1d2);
grid.position.y = 0.002;
scene.add(grid);

// ---------------------------------------------------------------- camera controls
// NOTE: OrbitControls is created at module load, i.e. BEFORE interaction.js
// registers its picking listeners. This is safe: joint/move drags disable
// controls on pointerdown, and OrbitControls ignores pointermove while
// disabled, so the old single-file registration order is preserved in effect.
export const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME_TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.8;
controls.maxDistance = 12;
controls.maxPolarAngle = Math.PI * 0.52;

// selection indicator (wireframe sphere following the active joint / prop)
export const indicator = new THREE.Mesh(
  new THREE.SphereGeometry(0.085, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0xff9a2e, wireframe: true, transparent: true, opacity: 0.9 }),
);
indicator.visible = false;
scene.add(indicator);

// Ground reference marker for move mode: axis-aligned cross in gizmo colours
// (X=red, Z=blue, Y=green) plus a coordinate label — readable by humans and
// by vision/AI agents alike.
export const groundMark = new THREE.Group();
function markLine(mat, a, b) {
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), mat);
  groundMark.add(l);
  return l;
}
markLine(
  new THREE.LineBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.9 }),
  new THREE.Vector3(-0.5, 0.005, 0),
  new THREE.Vector3(0.5, 0.005, 0),
);
markLine(
  new THREE.LineBasicMaterial({ color: 0x4d7dff, transparent: true, opacity: 0.9 }),
  new THREE.Vector3(0, 0.005, -0.5),
  new THREE.Vector3(0, 0.005, 0.5),
);
const markY = markLine(
  new THREE.LineBasicMaterial({ color: 0x35c46f, transparent: true, opacity: 0.9 }),
  new THREE.Vector3(),
  new THREE.Vector3(0, 1, 0),
);
export const markYPos = markY.geometry.attributes.position;

const labelCanvas = document.createElement('canvas');
labelCanvas.width = 280;
labelCanvas.height = 72;
const labelCtx = labelCanvas.getContext('2d');
const labelTex = new THREE.CanvasTexture(labelCanvas);
export const labelSprite = new THREE.Sprite(
  new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthTest: false }),
);
labelSprite.scale.set(0.85, 0.22, 1);
groundMark.add(labelSprite);

let lastLabelText = '';
export function updateMarkLabel(text) {
  if (text === lastLabelText) return;
  lastLabelText = text;
  labelCtx.clearRect(0, 0, 280, 72);
  labelCtx.fillStyle = 'rgba(20, 22, 28, 0.78)';
  labelCtx.fillRect(4, 6, 272, 60);
  labelCtx.font = 'bold 30px monospace';
  labelCtx.textAlign = 'center';
  labelCtx.textBaseline = 'middle';
  labelCtx.fillStyle = '#ffd28a';
  labelCtx.fillText(text, 140, 38);
  labelTex.needsUpdate = true;
}

groundMark.visible = false;
scene.add(groundMark);
