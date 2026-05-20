import { useEffect, type EffectCallback } from 'react';

export function useMountEffect(effect: EffectCallback) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally mount-only
  useEffect(effect, []);
}
