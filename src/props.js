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

export const PROP_TYPES = {
  chair: { label: '椅子 Chair', build: buildChair },
  table: { label: '桌子 Table', build: buildTable },
  bench: { label: '長凳 Bench', build: buildBench },
  crate: { label: '木箱 Crate', build: buildCrate },
  ball: { label: '球 Ball', build: buildBall },
  pedestal: { label: '台座 Pedestal', build: buildPedestal },
};

export function buildProp(type) {
  const def = PROP_TYPES[type];
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
