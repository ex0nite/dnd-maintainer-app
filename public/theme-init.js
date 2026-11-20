// Applies the saved colour mode and theme before the first paint, so the page does not flash (story 7.4).
// It is a static file, not an inline script, so the Content-Security-Policy needs no `unsafe-inline` (AD-21).
// ThemeProvider takes over once React mounts.
(function () {
  try {
    var validThemes = ['sylvan', 'arcane'];
    var validModes = ['light', 'dark', 'system'];
    var mode = localStorage.getItem('dnd-color-mode');
    var theme = localStorage.getItem('dnd-theme');
    if (!mode || validModes.indexOf(mode) === -1) mode = 'system';
    if (mode === 'system') {
      mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    if (mode === 'dark') document.documentElement.classList.add('dark');
    if (theme && validThemes.indexOf(theme) !== -1) {
      document.documentElement.setAttribute('data-theme', theme);
    }
  } catch (e) {
    console.warn('[theme] Bootstrap failed:', e);
  }
})();
