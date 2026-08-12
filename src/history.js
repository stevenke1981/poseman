// Undo / redo via serialized scene snapshots (T1-5).
import { serializeScene, applyScene } from './persistence.js';
import { sceneSnapshotsDiffer } from './sceneSchema.js';

const LIMIT = 50;
const undoStack = [];
const redoStack = [];
let current = '';
let gestureOpen = false;

export function syncHistory() {
  current = JSON.stringify(serializeScene());
  gestureOpen = false;
}

// Call before a mutating operation (or at gesture start).
export function beginGesture() {
  if (gestureOpen) return;
  gestureOpen = true;
  undoStack.push(current);
  if (undoStack.length > LIMIT) undoStack.shift();
  redoStack.length = 0;
}

// Call after the mutation (or at gesture end). Drops the checkpoint when
// nothing actually changed so undo never shows no-op steps.
export function endGesture() {
  if (!gestureOpen) return;
  gestureOpen = false;
  const now = JSON.stringify(serializeScene());
  if (undoStack.length && !sceneSnapshotsDiffer(now, undoStack[undoStack.length - 1])) undoStack.pop();
  current = now;
}

export function withHistory(fn) {
  beginGesture();
  fn();
  endGesture();
}

export function undo() {
  if (!undoStack.length) return false;
  redoStack.push(current);
  const s = undoStack.pop();
  applyScene(JSON.parse(s));
  current = s;
  return true;
}

export function redo() {
  if (!redoStack.length) return false;
  undoStack.push(current);
  const s = redoStack.pop();
  applyScene(JSON.parse(s));
  current = s;
  return true;
}

export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;
