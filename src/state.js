// Shared mutable session state. A single exported object lets every module
// mutate session values without import cycles on primitives.
export const state = {
  activeFigure: null,
  activeJointName: 'chest',
  moveMode: false,
  previewMode: false,
  selectedProp: null,
};
