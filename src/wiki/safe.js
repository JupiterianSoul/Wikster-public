let safeDefault = () => false;

export function useSafeDraws(fn) {
  safeDefault = typeof fn === 'function' ? fn : () => false;
}

export const safeDraws = () => Boolean(safeDefault());
