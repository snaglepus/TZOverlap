// Runs synchronously in <head> before first paint to avoid a theme flash.
// Classic script (no imports). Mirrors resolve() in src/ui/theme.js and the
// keys in src/lib/store.js: settings.theme in STATE_KEY ('tzoverlap.state'),
// or LEGACY_THEME_KEY ('tz-overlap:theme') before the first migration.
(() => {
  let theme = null;
  try {
    const text = window.localStorage.getItem('tzoverlap.state');
    if (text === null) {
      theme = window.localStorage.getItem('tz-overlap:theme');
    } else {
      theme = JSON.parse(text)?.settings?.theme ?? null;
    }
  } catch {
    // Storage blocked or state unparseable: fall through to the OS preference.
  }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
})();
