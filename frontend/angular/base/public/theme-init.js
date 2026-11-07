// Sets <html data-theme="light|dark"> before first paint, so a dark theme never flashes light. It is
// a file, not an inline script, because the deployed pages carry `script-src 'self'`. Keep it in
// step with ThemeService: same storage key (`theme`), the value stored as JSON, the same default.
;(function () {
  try {
    var theme = '__THEME_DEFAULT__'
    var raw = localStorage.getItem('theme')
    if (raw !== null) theme = JSON.parse(raw)
    if (theme !== 'light' && theme !== 'dark') theme = 'system'
    var dark =
      theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  } catch (error) {
    // Blocked or unreadable storage: the page keeps the light theme until ThemeService starts.
  }
})()
