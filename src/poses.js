// Pose presets. Values are Euler angles in degrees [x, y, z] per joint.
// Convention: figure faces +Z.
//  - rotation.x < 0 moves a limb forward (+Z), > 0 backward.
//  - rotation.z > 0 abducts the LEFT arm/leg outward (+X), < 0 for RIGHT side.

export const DEFAULT_POSE = {
  shoulderL: [0, 0, 7],
  shoulderR: [0, 0, -7],
  elbowL: [-6, 0, 0],
  elbowR: [-6, 0, 0],
};

export const PRESETS = {
  stand: { ...DEFAULT_POSE },

  walk: {
    hips: [0, 4, 0],
    spine: [-4, 0, 0],
    head: [4, -4, 0],
    hipL: [-26, 0, 2],
    kneeL: [16, 0, 0],
    ankleL: [10, 0, 0],
    hipR: [22, 0, -2],
    kneeR: [38, 0, 0],
    ankleR: [22, 0, 0],
    shoulderL: [22, 0, 5],
    elbowL: [-18, 0, 0],
    shoulderR: [-22, 0, -5],
    elbowR: [-18, 0, 0],
  },

  run: {
    spine: [-14, 0, 0],
    head: [12, 0, 0],
    hipL: [-58, 0, 3],
    kneeL: [72, 0, 0],
    ankleL: [16, 0, 0],
    hipR: [36, 0, -3],
    kneeR: [95, 0, 0],
    ankleR: [34, 0, 0],
    shoulderL: [38, 0, 6],
    elbowL: [-100, 0, 0],
    shoulderR: [-48, 0, -6],
    elbowR: [-100, 0, 0],
  },

  sit: {
    spine: [-6, 0, 0],
    head: [6, 0, 0],
    hipL: [-92, 0, 4],
    kneeL: [96, 0, 0],
    ankleL: [-6, 0, 0],
    hipR: [-92, 0, -4],
    kneeR: [96, 0, 0],
    ankleR: [-6, 0, 0],
    shoulderL: [0, 0, 10],
    shoulderR: [0, 0, -10],
    elbowL: [-32, 0, 0],
    elbowR: [-32, 0, 0],
  },

  wave: {
    head: [0, 0, 6],
    shoulderR: [0, 0, -155],
    elbowR: [0, 0, -45],
    wristR: [0, 0, -15],
    shoulderL: [0, 0, 6],
    hipL: [0, 0, 3],
    hipR: [0, 0, -3],
  },

  think: {
    head: [12, 0, -4],
    spine: [-8, 0, 0],
    shoulderL: [-26, 0, 8],
    elbowL: [-96, 0, 0],
    shoulderR: [-18, 24, -10],
    elbowR: [-118, 0, -14],
    hipL: [0, 0, 3],
    hipR: [0, 0, -3],
  },
};

export const PRESET_LABELS = {
  stand: '站立 Stand',
  walk: '行走 Walk',
  run: '跑步 Run',
  sit: '坐下 Sit',
  wave: '揮手 Wave',
  think: '思考 Think',
};

// ---------------------------------------------------------------- custom pose library (T2-2)
const CUSTOM_KEY = 'poseman-custom-poses-v1';

export function loadCustomPoses() {
  try {
    const d = JSON.parse(localStorage.getItem(CUSTOM_KEY));
    return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  } catch {
    return {};
  }
}

export function saveCustomPoses(map) {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable */
  }
}
