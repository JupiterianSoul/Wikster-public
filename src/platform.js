export const ANDROID_MARK = 'WiksterAndroid';

export function androidApp() {
  if (typeof window === 'undefined') return false;
  if (window.WiksterBack || window.WiksterHaptics || window.WiksterShare) return true;
  return typeof navigator !== 'undefined' && String(navigator.userAgent ?? '').includes(ANDROID_MARK);
}

export const androidRequest = (userAgent = '', client = '') =>
  String(userAgent ?? '').includes(ANDROID_MARK) || client === 'android';
