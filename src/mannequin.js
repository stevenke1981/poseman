import * as THREE from 'three';
import { DEFAULT_POSE } from './poses.js';
import { sphereGeo, capsuleGeo, cylinderGeo, mat } from './parts.js';

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

/**
 * Builds a procedural articulated mannequin (stylized human).
 * Returns { group, joints, pickMeshes, female, setPose, resetPose }.
 */
export function buildMannequin({ female = false } = {}) {
  const skinMat = female ? mat(0xd8a98b, 0.7) : mat(0xc98f6f, 0.7);
  const clothMat = mat(0x30343c, 0.92, 0);
  const hairMat = female ? mat(0x5d3a24, 0.85) : mat(0x2b2119, 0.85);
  const eyeMat = mat(0x23262c, 0.35);

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

  function mesh(parent, geo, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Mesh(geo, material);
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
  // waist: tapered connector between pelvis and ribcage
  mesh(
    spine,
    cylinderGeo(0.085, 0.105, 0.2, 20),
    skinMat,
    0,
    0.08,
    0,
    P.chestS[0] * 0.82,
    1,
    P.chestS[2] * 0.82,
  );
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

  // ---- head with face & hair ----
  const neck = joint('neck', chest, 0, 0.185, 0);
  mesh(neck, capsuleGeo(0.042, 0.07, 6, 12), skinMat, 0, 0.045, 0);
  const head = joint('head', neck, 0, 0.1, 0);
  const hr = P.headR;
  mesh(head, sphereGeo(hr, 24, 16), skinMat, 0, 0.1, 0, 0.88, 1.12, 0.95); // skull
  mesh(head, sphereGeo(hr * 0.72, 20, 14), skinMat, 0, 0.05, 0.018, 0.8, 0.62, 0.78); // jaw
  mesh(head, sphereGeo(hr * 0.14, 12, 10), skinMat, 0, 0.095, hr * 0.9, 0.8, 1.2, 1); // nose
  mesh(head, sphereGeo(hr * 0.16, 12, 10), skinMat, hr * 0.86, 0.1, 0.005, 0.5, 0.9, 0.8); // ear L
  mesh(head, sphereGeo(hr * 0.16, 12, 10), skinMat, -hr * 0.86, 0.1, 0.005, 0.5, 0.9, 0.8); // ear R
  mesh(head, sphereGeo(hr * 0.09, 12, 10), eyeMat, hr * 0.36, 0.125, hr * 0.84); // eye L
  mesh(head, sphereGeo(hr * 0.09, 12, 10), eyeMat, -hr * 0.36, 0.125, hr * 0.84); // eye R
  mesh(head, sphereGeo(hr * 1.05, 24, 16), hairMat, 0, 0.135, -0.02, 0.9, 0.98, 0.98); // hair cap
  if (female) {
    mesh(head, sphereGeo(hr * 0.9, 20, 14), hairMat, 0, 0.0, -0.075, 0.85, 1.7, 0.7); // long back hair
  }

  // ---- arms (tapered, with hands) ----
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    const shoulder = joint('shoulder' + side, chest, s * P.shX, 0.15, 0);
    mesh(shoulder, sphereGeo(P.armR + 0.018, 20, 14), skinMat); // deltoid
    mesh(shoulder, cylinderGeo(P.armR * 0.95, P.foreR + 0.008, 0.2, 14), skinMat, 0, -0.13, 0);
    const elbow = joint('elbow' + side, shoulder, 0, -0.28, 0);
    mesh(elbow, sphereGeo(P.foreR + 0.012, 16, 12), skinMat);
    mesh(elbow, cylinderGeo(P.foreR * 1.1, P.foreR * 0.65, 0.24, 14), skinMat, 0, -0.13, 0);
    const wrist = joint('wrist' + side, elbow, 0, -0.24, 0);
    mesh(wrist, sphereGeo(0.045, 16, 12), skinMat, 0, -0.06, 0, 0.75, 1.5, 0.45); // hand
    mesh(wrist, sphereGeo(0.016, 10, 8), skinMat, s * 0.032, -0.045, 0.015, 1, 1.6, 0.8); // thumb
  }

  // ---- legs (tapered, with calf & heel) ----
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    const hip = joint('hip' + side, hips, s * P.hipX, -0.05, 0);
    mesh(hip, cylinderGeo(P.thighR * 1.05, P.thighR * 0.78, 0.38, 14), skinMat, 0, -0.19, 0);
    // shorts leg
    mesh(hip, capsuleGeo(P.thighR + 0.012, 0.1, 6, 14), clothMat, 0, -0.08, 0);
    const knee = joint('knee' + side, hip, 0, -0.42, 0);
    mesh(knee, sphereGeo(P.shinR + 0.012, 16, 12), skinMat);
    mesh(knee, sphereGeo(P.shinR * 1.2, 16, 12), skinMat, 0, -0.08, 0.008, 1, 1.5, 1.1); // calf
    mesh(knee, cylinderGeo(P.shinR * 0.95, P.shinR * 0.68, 0.38, 14), skinMat, 0, -0.19, 0);
    const ankle = joint('ankle' + side, knee, 0, -0.4, 0);
    mesh(ankle, sphereGeo(P.shinR + 0.008, 16, 12), skinMat, 0, -0.01, 0); // ankle connector
    mesh(ankle, sphereGeo(0.05, 16, 12), skinMat, 0, -0.035, 0.06, 0.9, 0.7, 2.1); // foot
    mesh(ankle, sphereGeo(0.045, 14, 10), skinMat, 0, -0.045, -0.02, 0.8, 0.8, 1); // heel
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
