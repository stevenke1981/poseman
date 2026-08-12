import * as THREE from 'three';
import { DEFAULT_POSE } from './poses.js';
import { sphereGeo, capsuleGeo, cylinderGeo } from './parts.js';

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

// Appearance is deliberately a small, data-only vocabulary.  Keeping the
// choices finite makes scene files portable and prevents arbitrary values
// from leaking into materials when an old/corrupt JSON file is opened.
export const SKIN_TONES = Object.freeze({
  fair: Object.freeze({ label: '象牙 Ivory', color: 0xe6b49a }),
  warm: Object.freeze({ label: '蜜糖 Honey', color: 0xc98f6f }),
  tan: Object.freeze({ label: '琥珀 Amber', color: 0xa96f50 }),
  deep: Object.freeze({ label: '深棕 Umber', color: 0x784b3d }),
});

export const OUTFIT_STYLES = Object.freeze({
  indigo: Object.freeze({ label: '靛藍 Indigo', base: 0x3f4a68, panel: 0x6576ad, trim: 0xd7ad67 }),
  terracotta: Object.freeze({ label: '陶土 Terracotta', base: 0x6f403d, panel: 0xc8765c, trim: 0xf1c38f }),
  sage: Object.freeze({ label: '鼠尾草 Sage', base: 0x3d625b, panel: 0x71978a, trim: 0xe2c67e }),
  graphite: Object.freeze({ label: '石墨 Graphite', base: 0x313741, panel: 0x596575, trim: 0xb7c0ce }),
});

export const BODY_PROFILES = Object.freeze({
  balanced: Object.freeze({ label: '均衡 Balanced', shoulder: 1, hip: 1, torso: 1, limb: 1 }),
  slender: Object.freeze({ label: '修長 Slender', shoulder: 0.9, hip: 0.92, torso: 0.91, limb: 0.96 }),
  athletic: Object.freeze({ label: '健壯 Athletic', shoulder: 1.12, hip: 1.06, torso: 1.06, limb: 1.04 }),
});

export const HAIR_STYLES = Object.freeze({
  short: Object.freeze({ label: '短髮 Short' }),
  bob: Object.freeze({ label: '鮑伯 Bob' }),
  long: Object.freeze({ label: '長髮 Long' }),
});

export const HAIR_COLORS = Object.freeze({
  espresso: Object.freeze({ label: '濃咖 Espresso', base: 0x2b2119, lite: 0x46352a }),
  chestnut: Object.freeze({ label: '栗棕 Chestnut', base: 0x5d3a24, lite: 0x785033 }),
  raven: Object.freeze({ label: '烏黑 Raven', base: 0x202329, lite: 0x3d424b }),
  auburn: Object.freeze({ label: '赤褐 Auburn', base: 0x743d2c, lite: 0xa55a3c }),
});

export const DEFAULT_APPEARANCE = Object.freeze({
  skinTone: 'warm',
  outfit: 'indigo',
  bodyProfile: 'balanced',
  hairStyle: 'short',
  hairColor: 'espresso',
});

export function sanitizeAppearance(raw) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const ownValue = (key) => (Object.hasOwn(input, key) ? input[key] : undefined);
  const ownKey = (value, table, fallback) =>
    typeof value === 'string' && Object.hasOwn(table, value) ? value : fallback;
  const skinTone = ownKey(
    ownValue('skinTone'),
    SKIN_TONES,
    ownKey(ownValue('skin'), SKIN_TONES, DEFAULT_APPEARANCE.skinTone),
  );
  const outfit = ownKey(
    ownValue('outfit'),
    OUTFIT_STYLES,
    ownKey(ownValue('style'), OUTFIT_STYLES, DEFAULT_APPEARANCE.outfit),
  );
  const bodyProfile = ownKey(ownValue('bodyProfile'), BODY_PROFILES, DEFAULT_APPEARANCE.bodyProfile);
  const hairStyle = ownKey(ownValue('hairStyle'), HAIR_STYLES, DEFAULT_APPEARANCE.hairStyle);
  const hairColor = ownKey(ownValue('hairColor'), HAIR_COLORS, DEFAULT_APPEARANCE.hairColor);
  return { skinTone, outfit, bodyProfile, hairStyle, hairColor };
}

function figureMaterial(color, roughness = 0.82, metalness = 0.01) {
  // Do not use the shared material cache here: changing one figure's
  // appearance must never recolour another figure in a multi-character scene.
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

/**
 * Builds a procedural articulated mannequin (stylized human).
 * Returns { group, joints, pickMeshes, female, setPose, resetPose }.
 */
export function buildMannequin({ female = false, appearance } = {}) {
  let currentAppearance = sanitizeAppearance(appearance);
  const skinTone = SKIN_TONES[currentAppearance.skinTone];
  const outfit = OUTFIT_STYLES[currentAppearance.outfit];
  const profile = BODY_PROFILES[currentAppearance.bodyProfile];
  const hair = HAIR_COLORS[currentAppearance.hairColor];
  const skinMat = figureMaterial(skinTone.color, 0.76);
  const skinLiteMat = figureMaterial(skinTone.color, 0.68);
  const clothMat = figureMaterial(outfit.base, 0.9, 0);
  const panelMat = figureMaterial(outfit.panel, 0.84, 0);
  const trimMat = figureMaterial(outfit.trim, 0.72, 0.01);
  const shoeMat = figureMaterial(outfit.base, 0.76, 0.01);
  const hairMat = figureMaterial(hair.base, 0.86);
  const hairLiteMat = figureMaterial(hair.lite, 0.9);
  const eyeWhiteMat = figureMaterial(0xf5f1e8, 0.45);
  const eyeMat = figureMaterial(0x23262c, 0.35);
  const mouthMat = figureMaterial(0x7c4350, 0.72);
  const ownMaterials = new Set([
    skinMat,
    skinLiteMat,
    clothMat,
    panelMat,
    trimMat,
    shoeMat,
    hairMat,
    hairLiteMat,
    eyeWhiteMat,
    eyeMat,
    mouthMat,
  ]);

  const joints = {};
  const pickMeshes = [];
  const root = new THREE.Group();
  root.name = female ? 'figure-f' : 'figure-m';

  const baseP = female
    ? {
        shX: 0.17,
        hipX: 0.11,
        headR: 0.105,
        pelvisS: [1.18, 0.8, 0.82],
        chestS: [1.12, 1.04, 0.76],
        thighR: 0.073,
        shinR: 0.054,
        armR: 0.043,
        foreR: 0.036,
      }
    : {
        shX: 0.2,
        hipX: 0.11,
        headR: 0.11,
        pelvisS: [1.14, 0.82, 0.82],
        chestS: [1.34, 1.1, 0.84],
        thighR: 0.075,
        shinR: 0.056,
        armR: 0.049,
        foreR: 0.041,
      };
  const P = {
    shX: baseP.shX * profile.shoulder,
    hipX: baseP.hipX * profile.hip,
    headR: baseP.headR * (0.98 + profile.torso * 0.02),
    pelvisS: [baseP.pelvisS[0] * profile.hip, baseP.pelvisS[1] * profile.torso, baseP.pelvisS[2] * profile.hip],
    chestS: [baseP.chestS[0] * profile.shoulder, baseP.chestS[1] * profile.torso, baseP.chestS[2] * profile.shoulder],
    thighR: baseP.thighR * profile.limb,
    shinR: baseP.shinR * profile.limb,
    armR: baseP.armR * profile.limb,
    foreR: baseP.foreR * profile.limb,
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

  function meshRot(
    parent,
    geo,
    material,
    x = 0,
    y = 0,
    z = 0,
    sx = 1,
    sy = 1,
    sz = 1,
    rotation = [0, 0, 0],
  ) {
    const m = mesh(parent, geo, material, x, y, z, sx, sy, sz);
    m.rotation.set(rotation[0], rotation[1], rotation[2]);
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
  mesh(hips, sphereGeo(0.126, 24, 16), panelMat, 0, 0.01, 0.008, P.pelvisS[0] * 1.035, 0.52, P.pelvisS[2] * 1.04);
  mesh(hips, capsuleGeo(0.014, 0.13, 5, 10), trimMat, 0, 0.105, 0.085, 1.9, 1, 0.72);

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
  // Layered top: a soft shell, front panel, and collar/hem make the
  // silhouette read clearly in both front and three-quarter views.
  mesh(chest, sphereGeo(0.132, 24, 16), clothMat, 0, 0.055, 0, P.chestS[0] * 1.03, 0.81, P.chestS[2] * 1.18);
  mesh(chest, sphereGeo(0.095, 20, 14), panelMat, 0, 0.075, 0.102, P.chestS[0] * 0.58, 0.64, 0.5);
  meshRot(chest, capsuleGeo(0.014, 0.14, 5, 10), trimMat, 0, 0.15, 0.105, 1.5, 1, 0.75, [0, 0, Math.PI / 2]);
  mesh(chest, sphereGeo(0.026, 14, 10), trimMat, 0, -0.035, 0.108, 2.25, 0.7, 0.6);
  if (female) {
    mesh(chest, sphereGeo(0.052, 20, 14), panelMat, 0.055, 0.05, 0.112);
    mesh(chest, sphereGeo(0.052, 20, 14), panelMat, -0.055, 0.05, 0.112);
  }

  // ---- head with face & hair ----
  const neck = joint('neck', chest, 0, 0.185, 0);
  mesh(neck, capsuleGeo(0.042, 0.07, 6, 12), skinMat, 0, 0.045, 0);
  const head = joint('head', neck, 0, 0.1, 0);
  const hr = P.headR;
  mesh(head, sphereGeo(hr, 24, 16), skinMat, 0, 0.1, 0, 0.88, 1.12, 0.95); // skull
  mesh(head, sphereGeo(hr * 0.72, 20, 14), skinLiteMat, 0, 0.05, 0.018, 0.8, 0.62, 0.78); // jaw
  mesh(head, sphereGeo(hr * 0.18, 16, 12), skinLiteMat, hr * 0.36, 0.065, 0.055, 0.82, 0.76, 0.72); // cheek L
  mesh(head, sphereGeo(hr * 0.18, 16, 12), skinLiteMat, -hr * 0.36, 0.065, 0.055, 0.82, 0.76, 0.72); // cheek R
  mesh(head, sphereGeo(hr * 0.14, 12, 10), skinLiteMat, 0, 0.095, hr * 0.9, 0.8, 1.2, 1); // nose
  mesh(head, sphereGeo(hr * 0.16, 12, 10), skinLiteMat, hr * 0.86, 0.1, 0.005, 0.5, 0.9, 0.8); // ear L
  mesh(head, sphereGeo(hr * 0.16, 12, 10), skinLiteMat, -hr * 0.86, 0.1, 0.005, 0.5, 0.9, 0.8); // ear R
  mesh(head, sphereGeo(hr * 0.1, 12, 10), eyeWhiteMat, hr * 0.36, 0.125, hr * 0.84, 1, 0.82, 0.58); // eye L
  mesh(head, sphereGeo(hr * 0.1, 12, 10), eyeWhiteMat, -hr * 0.36, 0.125, hr * 0.84, 1, 0.82, 0.58); // eye R
  mesh(head, sphereGeo(hr * 0.052, 12, 10), eyeMat, hr * 0.36, 0.125, hr * 0.905); // iris L
  mesh(head, sphereGeo(hr * 0.052, 12, 10), eyeMat, -hr * 0.36, 0.125, hr * 0.905); // iris R
  meshRot(head, capsuleGeo(0.011, hr * 0.24, 5, 10), hairMat, hr * 0.36, 0.17, hr * 0.79, 1, 1, 1, [0, 0, Math.PI / 2]); // brow L
  meshRot(head, capsuleGeo(0.011, hr * 0.24, 5, 10), hairMat, -hr * 0.36, 0.17, hr * 0.79, 1, 1, 1, [0, 0, Math.PI / 2]); // brow R
  mesh(head, sphereGeo(hr * 0.1, 12, 10), mouthMat, 0, 0.055, hr * 0.87, 1.45, 0.34, 0.34); // mouth
  mesh(head, sphereGeo(hr * 0.06, 12, 10), skinLiteMat, 0, 0.035, hr * 0.875, 1.15, 0.35, 0.3); // lower lip highlight
  mesh(head, sphereGeo(hr * 1.05, 24, 16), hairMat, 0, 0.135, -0.02, 0.9, 0.98, 0.98); // hair cap
  mesh(head, sphereGeo(hr * 0.42, 18, 12), hairLiteMat, 0, 0.115, hr * 0.62, 1.18, 0.46, 0.46); // fringe
  const lockScale = currentAppearance.hairStyle === 'short' ? 1.28 : currentAppearance.hairStyle === 'bob' ? 1.85 : 2.35;
  mesh(head, sphereGeo(hr * 0.3, 16, 12), hairMat, hr * 0.82, 0.09, -0.035, 0.62, lockScale, 0.72); // side lock L
  mesh(head, sphereGeo(hr * 0.3, 16, 12), hairMat, -hr * 0.82, 0.09, -0.035, 0.62, lockScale, 0.72); // side lock R
  if (currentAppearance.hairStyle === 'long') {
    mesh(head, sphereGeo(hr * 0.9, 20, 14), hairMat, 0, 0.0, -0.075, 0.85, 1.7, 0.7); // long back hair
    mesh(head, sphereGeo(hr * 0.46, 18, 12), hairLiteMat, 0, -0.08, -0.13, 0.8, 1.1, 0.65); // nape volume
  } else if (currentAppearance.hairStyle === 'bob') {
    mesh(head, sphereGeo(hr * 0.6, 18, 12), hairMat, 0, 0.0, -0.1, 0.9, 1.3, 0.7); // bob back
  } else {
    mesh(head, sphereGeo(hr * 0.38, 16, 12), hairMat, 0, -0.015, -0.105, 0.92, 0.85, 0.62); // short nape
  }

  // ---- arms (tapered, with hands) ----
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    const shoulder = joint('shoulder' + side, chest, s * P.shX, 0.15, 0);
    mesh(shoulder, sphereGeo(P.armR + 0.018, 20, 14), skinMat); // deltoid
    mesh(shoulder, sphereGeo(P.armR + 0.027, 20, 14), clothMat, 0, 0.015, 0, 1.06, 0.78, 1.06); // sleeve cap
    mesh(shoulder, cylinderGeo(P.armR * 0.95, P.foreR + 0.008, 0.2, 14), skinMat, 0, -0.13, 0);
    const elbow = joint('elbow' + side, shoulder, 0, -0.28, 0);
    mesh(elbow, sphereGeo(P.foreR + 0.012, 16, 12), skinMat);
    mesh(elbow, cylinderGeo(P.foreR * 1.1, P.foreR * 0.65, 0.24, 14), skinMat, 0, -0.13, 0);
    const wrist = joint('wrist' + side, elbow, 0, -0.24, 0);
    mesh(wrist, sphereGeo(0.045, 16, 12), skinMat, 0, -0.06, 0, 0.75, 1.5, 0.45); // hand
    mesh(wrist, sphereGeo(0.016, 10, 8), skinMat, s * 0.032, -0.045, 0.015, 1, 1.6, 0.8); // thumb
    mesh(wrist, cylinderGeo(0.018, 0.015, 0.02, 12), trimMat, 0, -0.025, 0, 1.15, 1, 0.8); // cuff
    for (const i of [-1, 0, 1]) {
      mesh(wrist, sphereGeo(0.012, 10, 8), skinLiteMat, s * i * 0.014, -0.11, 0.035, 0.82, 1.4, 0.8);
    }
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
    mesh(ankle, sphereGeo(0.045, 14, 10), skinMat, 0, -0.035, -0.02, 0.8, 0.8, 1); // heel
    // Keep the shoe just above the y=0 ground plane; the ankle/foot skin
    // remains underneath as a soft transition, while the sole reads as
    // grounded instead of clipping into the floor.
    mesh(ankle, sphereGeo(0.054, 18, 12), shoeMat, 0, -0.03, 0.07, 0.98, 0.72, 2.25); // shoe upper
    mesh(ankle, sphereGeo(0.047, 16, 10), trimMat, 0, -0.055, 0.075, 1.02, 0.28, 2.28); // sole
  }

  const api = {
    group: root,
    joints,
    pickMeshes,
    female,
    appearance: { ...currentAppearance },
    setAppearance(next) {
      currentAppearance = sanitizeAppearance(next);
      const tone = SKIN_TONES[currentAppearance.skinTone];
      const style = OUTFIT_STYLES[currentAppearance.outfit];
      const hairStyle = HAIR_COLORS[currentAppearance.hairColor];
      skinMat.color.setHex(tone.color);
      skinLiteMat.color.setHex(tone.color);
      clothMat.color.setHex(style.base);
      shoeMat.color.setHex(style.base);
      panelMat.color.setHex(style.panel);
      trimMat.color.setHex(style.trim);
      hairMat.color.setHex(hairStyle.base);
      hairLiteMat.color.setHex(hairStyle.lite);
      api.appearance = { ...currentAppearance };
      return api.appearance;
    },
    dispose() {
      // Geometries come from the shared cache in parts.js and must remain
      // alive for every other figure.  Only this mannequin's materials are
      // owned here and may be released when it leaves the scene.
      for (const material of ownMaterials) material.dispose();
      ownMaterials.clear();
    },
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
