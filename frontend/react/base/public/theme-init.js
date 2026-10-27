// Sets the `dark` class on <html> before first paint, so a dark theme never flashes light. It is
// a file, not an inline script, because the deployed pages carry `script-src 'self'`. Keep it in
// step with ThemeProvider: same storage key (`theme`) and the same default.
;(function () {
  try {
    var theme = localStorage.getItem('theme') || '__THEME_DEFAULT__'
    var dark =
      theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
  } catch (error) {
    // Blocked storage: the page keeps the light theme until ThemeProvider mounts.
  }
})()
