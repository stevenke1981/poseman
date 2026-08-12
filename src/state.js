// Shared mutable session state. A single exported object lets every module
// mutate session values without import cycles on primitives.
export const state = {
  activeFigure: null,
  activeJointName: 'chest',
  moveMode: false,
  previewMode: false,
  selectedProp: null,
};

// Centralized selection write keeps non-UI scene operations from mutating the
// selected prop field through ad-hoc assignments.
export function setSelectedProp(entry) {
  state.selectedProp = entry || null;
  return state.selectedProp;
}

export function chooseTransformTarget({ moveMode = false, selectedProp = null, activeFigure = null } = {}) {
  if (!moveMode) return null;
  return selectedProp?.group || activeFigure?.group || null;
}
