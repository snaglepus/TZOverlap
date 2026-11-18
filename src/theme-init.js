// Runs synchronously in <head> before first paint to avoid a theme flash.
// Classic script (no imports). Mirrors resolve() in src/ui/theme.js.
(() => {
  let theme = null;
  try {
    theme = window.localStorage.getItem('tz-overlap:theme');
  } catch {
    // Storage blocked: fall through to the OS preference.
  }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
})();
