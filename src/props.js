import * as THREE from 'three';
import { boxGeo, cylinderGeo, sphereGeo, mat } from './parts.js';

const wood = () => mat(0x9a7248, 0.8);
const woodDark = () => mat(0x6e4f30, 0.85);
const stone = () => mat(0x9aa0b4, 0.9, 0);

function buildChair() {
  const g = new THREE.Group();
  const m = wood();
  const seat = new THREE.Mesh(boxGeo(0.44, 0.05, 0.44), m);
  seat.position.y = 0.45;
  g.add(seat);
  const back = new THREE.Mesh(boxGeo(0.44, 0.5, 0.05), m);
  back.position.set(0, 0.72, -0.195);
  g.add(back);
  for (const sx of [1, -1])
    for (const sz of [1, -1]) {
      const leg = new THREE.Mesh(cylinderGeo(0.02, 0.02, 0.45, 10), m);
      leg.position.set(sx * 0.19, 0.225, sz * 0.19);
      g.add(leg);
    }
  return g;
}

function buildTable() {
  const g = new THREE.Group();
  const m = wood();
  const top = new THREE.Mesh(boxGeo(1.1, 0.06, 0.6), m);
  top.position.y = 0.72;
  g.add(top);
  for (const sx of [1, -1])
    for (const sz of [1, -1]) {
      const leg = new THREE.Mesh(cylinderGeo(0.03, 0.03, 0.72, 12), m);
      leg.position.set(sx * 0.5, 0.36, sz * 0.25);
      g.add(leg);
    }
  return g;
}

function buildBench() {
  const g = new THREE.Group();
  const m = wood();
  const seat = new THREE.Mesh(boxGeo(1.2, 0.06, 0.35), m);
  seat.position.y = 0.45;
  g.add(seat);
  for (const sx of [1, -1]) {
    const leg = new THREE.Mesh(boxGeo(0.06, 0.45, 0.3), m);
    leg.position.set(sx * 0.52, 0.225, 0);
    g.add(leg);
  }
  return g;
}

function buildCrate() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(boxGeo(0.5, 0.5, 0.5), woodDark());
  m.position.y = 0.25;
  g.add(m);
  return g;
}

function buildBall() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(sphereGeo(0.25, 24, 16), mat(0xb34a4a, 0.6));
  m.position.y = 0.25;
  g.add(m);
  return g;
}

function buildPedestal() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(cylinderGeo(0.26, 0.34, 0.55, 20), stone());
  m.position.y = 0.275;
  g.add(m);
  return g;
}

function buildFloorLamp() {
  const g = new THREE.Group();
  const metal = mat(0x5d6573, 0.72, 0.15);
  const shade = mat(0xe0b86a, 0.9);
  const stem = new THREE.Mesh(cylinderGeo(0.028, 0.035, 1.55, 12), metal);
  stem.position.y = 0.775;
  g.add(stem);
  const base = new THREE.Mesh(cylinderGeo(0.24, 0.28, 0.07, 18), metal);
  base.position.y = 0.035;
  g.add(base);
  const shadeMesh = new THREE.Mesh(cylinderGeo(0.25, 0.15, 0.32, 18), shade);
  shadeMesh.position.y = 1.52;
  g.add(shadeMesh);
  return g;
}

function buildSofa() {
  const g = new THREE.Group();
  const upholstery = mat(0x61758d, 0.95);
  const dark = mat(0x394552, 0.82);
  const base = new THREE.Mesh(boxGeo(1.65, 0.42, 0.66), upholstery);
  base.position.y = 0.34;
  g.add(base);
  const back = new THREE.Mesh(boxGeo(1.7, 0.72, 0.22), upholstery);
  back.position.set(0, 0.82, -0.23);
  g.add(back);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(boxGeo(0.2, 0.56, 0.72), upholstery);
    arm.position.set(sx * 0.75, 0.58, 0);
    g.add(arm);
    const foot = new THREE.Mesh(cylinderGeo(0.035, 0.035, 0.2, 10), dark);
    foot.position.set(sx * 0.62, 0.1, 0.22);
    g.add(foot);
    const rearFoot = foot.clone();
    rearFoot.position.z = -0.22;
    g.add(rearFoot);
  }
  const cushion = new THREE.Mesh(boxGeo(0.62, 0.12, 0.5), mat(0x7890aa, 0.95));
  cushion.position.set(-0.37, 0.59, 0.03);
  g.add(cushion);
  const cushion2 = cushion.clone();
  cushion2.position.x = 0.37;
  g.add(cushion2);
  return g;
}

export const PROP_TYPES = Object.freeze({
  chair: { label: '椅子 Chair', build: buildChair },
  table: { label: '桌子 Table', build: buildTable },
  bench: { label: '長凳 Bench', build: buildBench },
  crate: { label: '木箱 Crate', build: buildCrate },
  ball: { label: '球 Ball', build: buildBall },
  pedestal: { label: '台座 Pedestal', build: buildPedestal },
  floorLamp: { label: '落地燈 Floor lamp', build: buildFloorLamp },
  sofa: { label: '沙發 Sofa', build: buildSofa },
});

export function getPropDefinition(type) {
  return typeof type === 'string' && Object.hasOwn(PROP_TYPES, type) ? PROP_TYPES[type] : null;
}

export function hasPropType(type) {
  return getPropDefinition(type) !== null;
}

export function buildProp(type) {
  const def = getPropDefinition(type);
  if (!def) return null;
  const group = def.build();
  group.name = type;
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return group;
}
