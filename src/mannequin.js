import * as THREE from 'three';
import { DEFAULT_POSE } from './poses.js';

export const DEG = Math.PI / 180;

export const JOINT_LABELS = {
  hips: '骨盆 Hips',
  spine: '腰椎 Spine',
  chest: '胸腔 Chest',
  neck: '頸部 Neck',
  head: '頭部 Head',
  shoulderL: '左肩 Shoulder L',
  shoulderR: '右肩 Shoulder R',
  elbowL: '左肘 Elbow L',
  elbowR: '右肘 Elbow R',
  wristL: '左手腕 Wrist L',
  wristR: '右手腕 Wrist R',
  hipL: '左髖 Hip L',
  hipR: '右髖 Hip R',
  kneeL: '左膝 Knee L',
  kneeR: '右膝 Knee R',
  ankleL: '左踝 Ankle L',
  ankleR: '右踝 Ankle R',
};

export const JOINT_NAMES = Object.keys(JOINT_LABELS);

// Materials and geometries are shared across every figure so that adding
// more characters does not multiply GPU memory.
const MATERIALS = {
  skinM: new THREE.MeshStandardMaterial({ color: 0xb7c0d6, roughness: 0.85, metalness: 0.02 }),
  skinF: new THREE.MeshStandardMaterial({ color: 0xc4cbdf, roughness: 0.85, metalness: 0.02 }),
  cloth: new THREE.MeshStandardMaterial({ color: 0x26282d, roughness: 0.92, metalness: 0.0 }),
};

const geoCache = new Map();
function cached(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}
const sphereGeo = (r, w, h) => cached(`sph|${r}|${w}|${h}`, () => new THREE.SphereGeometry(r, w, h));
const capsuleGeo = (r, len, cap, rad) =>
  cached(`cap|${r}|${len}|${cap}|${rad}`, () => new THREE.CapsuleGeometry(r, len, cap, rad));

/**
 * Builds a procedural articulated mannequin (drawing-figure style).
 * Returns { group, joints, pickMeshes, female, setPose, resetPose }.
 */
export function buildMannequin({ female = false } = {}) {
  const skinMat = female ? MATERIALS.skinF : MATERIALS.skinM;
  const clothMat = MATERIALS.cloth;

  const joints = {};
  const pickMeshes = [];
  const root = new THREE.Group();
  root.name = female ? 'figure-f' : 'figure-m';

  const P = female
    ? {
        shX: 0.155,
        hipX: 0.1,
        headR: 0.1,
        pelvisS: [1.25, 0.8, 0.85],
        chestS: [1.12, 1.0, 0.74],
        thighR: 0.068,
        shinR: 0.048,
        armR: 0.041,
        foreR: 0.035,
      }
    : {
        shX: 0.185,
        hipX: 0.095,
        headR: 0.105,
        pelvisS: [1.15, 0.8, 0.8],
        chestS: [1.3, 1.05, 0.8],
        thighR: 0.066,
        shinR: 0.05,
        armR: 0.047,
        foreR: 0.04,
      };

  function joint(name, parent, x, y, z) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    joints[name] = g;
    return g;
  }

  function mesh(parent, geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.userData.joint = parent.name;
    m.userData.figureRoot = root;
    parent.add(m);
    pickMeshes.push(m);
    return m;
  }

  // ---- torso ----
  const hips = joint('hips', root, 0, 0.95, 0);
  mesh(hips, sphereGeo(0.115, 24, 16), skinMat, 0, 0.02, 0, ...P.pelvisS);
  // shorts
  mesh(
    hips,
    sphereGeo(0.122, 24, 16),
    clothMat,
    0,
    0.0,
    0,
    P.pelvisS[0] * 1.03,
    0.72,
    P.pelvisS[2] * 1.03,
  );

  const spine = joint('spine', hips, 0, 0.1, 0);
  const chest = joint('chest', spine, 0, 0.16, 0);
  mesh(chest, sphereGeo(0.125, 24, 16), skinMat, 0, 0.07, 0, ...P.chestS);
  if (female) {
    // sports top
    mesh(
      chest,
      sphereGeo(0.132, 24, 16),
      clothMat,
      0,
      0.055,
      0,
      P.chestS[0] * 1.03,
      0.8,
      P.chestS[2] * 1.18,
    );
    mesh(chest, sphereGeo(0.05, 20, 14), clothMat, 0.055, 0.05, 0.085);
    mesh(chest, sphereGeo(0.05, 20, 14), clothMat, -0.055, 0.05, 0.085);
  }

  const neck = joint('neck', chest, 0, 0.185, 0);
  mesh(neck, capsuleGeo(0.042, 0.07, 6, 12), skinMat, 0, 0.045, 0);
  const head = joint('head', neck, 0, 0.1, 0);
  mesh(head, sphereGeo(P.headR, 24, 16), skinMat, 0, 0.1, 0, 0.88, 1.12, 0.95);

  // ---- arms ----
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    const shoulder = joint('shoulder' + side, chest, s * P.shX, 0.15, 0);
    mesh(shoulder, sphereGeo(P.armR + 0.018, 20, 14), skinMat);
    mesh(shoulder, capsuleGeo(P.armR, 0.2, 6, 14), skinMat, 0, -0.13, 0);
    const elbow = joint('elbow' + side, shoulder, 0, -0.28, 0);
    mesh(elbow, sphereGeo(P.foreR + 0.012, 16, 12), skinMat);
    mesh(elbow, capsuleGeo(P.foreR, 0.18, 6, 14), skinMat, 0, -0.11, 0);
    const wrist = joint('wrist' + side, elbow, 0, -0.24, 0);
    mesh(wrist, sphereGeo(0.045, 16, 12), skinMat, 0, -0.06, 0, 0.75, 1.5, 0.45);
  }

  // ---- legs ----
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    const hip = joint('hip' + side, hips, s * P.hipX, -0.05, 0);
    mesh(hip, capsuleGeo(P.thighR, 0.26, 6, 14), skinMat, 0, -0.16, 0);
    // shorts leg
    mesh(hip, capsuleGeo(P.thighR + 0.012, 0.1, 6, 14), clothMat, 0, -0.08, 0);
    const knee = joint('knee' + side, hip, 0, -0.42, 0);
    mesh(knee, sphereGeo(P.shinR + 0.012, 16, 12), skinMat);
    mesh(knee, capsuleGeo(P.shinR, 0.26, 6, 14), skinMat, 0, -0.15, 0);
    const ankle = joint('ankle' + side, knee, 0, -0.4, 0);
    mesh(ankle, sphereGeo(0.05, 16, 12), skinMat, 0, -0.035, 0.06, 0.9, 0.7, 2.1);
  }

  const api = {
    group: root,
    joints,
    pickMeshes,
    female,
    setPose(pose) {
      for (const j of Object.values(joints)) j.rotation.set(0, 0, 0);
      for (const [name, rot] of Object.entries(pose)) {
        const j = joints[name];
        if (j) j.rotation.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG);
      }
    },
    resetPose() {
      api.setPose(DEFAULT_POSE);
    },
  };
  api.resetPose();
  return api;
}
