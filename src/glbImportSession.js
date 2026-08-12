// Small deterministic epoch guard for parse/inspect/finalize async work.
// It deliberately carries no GLB data or UI references, so race behaviour is
// testable in Node and stale results can never become current again.
export function createGlbImportSession() {
  let epoch = 0;
  let active = 0;
  return Object.freeze({
    begin() {
      epoch += 1;
      active = epoch;
      return active;
    },
    invalidate() {
      epoch += 1;
      active = 0;
      return epoch;
    },
    isCurrent(token) {
      return Number.isSafeInteger(token) && token > 0 && token === epoch && token === active;
    },
    complete(token) {
      if (!this.isCurrent(token)) return false;
      active = 0;
      return true;
    },
  });
}
