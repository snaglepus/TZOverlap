// Which install guidance fits this browser. Pure: the caller passes in the
// user agent and display-mode flags, so every branch is unit-testable.

/**
 * @typedef {'none' | 'ios' | 'android' | 'desktop' | 'mac-safari' | 'other'} InstallKind
 * `none` means the app already runs installed (standalone).
 */

/**
 * @param {{
 *   userAgent: string,
 *   maxTouchPoints: number,
 *   displayModeStandalone: boolean,
 *   navigatorStandalone: boolean,
 * }} env
 * @returns {InstallKind}
 */
export function installGuidance({
  userAgent: ua,
  maxTouchPoints,
  displayModeStandalone,
  navigatorStandalone,
}) {
  if (displayModeStandalone || navigatorStandalone) return 'none';
  const has = (/** @type {string[]} */ ...tokens) => tokens.some((t) => ua.includes(t));
  const mac = ua.includes('Macintosh');
  // iPadOS sends a desktop-class Mac UA; touch points give it away.
  if (has('iPhone', 'iPad', 'iPod') || (mac && maxTouchPoints > 1)) return 'ios';
  if (ua.includes('Android')) return 'android';
  if (mac && ua.includes('Safari/') && !has('Chrome/', 'Chromium/', 'Edg/', 'Firefox/')) {
    return 'mac-safari';
  }
  if (has('Chrome/', 'Chromium/', 'Edg/')) return 'desktop';
  return 'other';
}
