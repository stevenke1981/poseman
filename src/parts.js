import * as THREE from 'three';

// Shared geometry / material caches so repeated parts cost memory only once.
const geoCache = new Map();

export function cached(key, make) {
  let v = geoCache.get(key);
  if (!v) {
    v = make();
    geoCache.set(key, v);
  }
  return v;
}

export const sphereGeo = (r, w = 24, h = 16) =>
  cached(`sph|${r}|${w}|${h}`, () => new THREE.SphereGeometry(r, w, h));

export const capsuleGeo = (r, len, cap = 6, rad = 14) =>
  cached(`cap|${r}|${len}|${cap}|${rad}`, () => new THREE.CapsuleGeometry(r, len, cap, rad));

export const cylinderGeo = (rt, rb, h, seg = 16) =>
  cached(`cyl|${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));

export const boxGeo = (w, h, d) => cached(`box|${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));

const matCache = new Map();
export function mat(color, roughness = 0.85, metalness = 0.02) {
  const key = `${color}|${roughness}|${metalness}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    matCache.set(key, m);
  }
  return m;
}
