import { useSyncExternalStore } from "react";

// Minimal external store so unrelated components (e.g. the global Quick Add
// button) can react to candidate multi-select state without prop drilling.
let count = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function setCandidateSelectionCount(n: number) {
  if (n === count) return;
  count = n;
  emit();
}

export function getCandidateSelectionCount() {
  return count;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useCandidateSelectionCount() {
  return useSyncExternalStore(subscribe, getCandidateSelectionCount, getCandidateSelectionCount);
}

export function useHasCandidateSelection() {
  return useCandidateSelectionCount() > 0;
}
