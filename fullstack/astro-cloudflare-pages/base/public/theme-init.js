// Sets data-theme on <html> to the resolved theme before first paint. It is a file, not an
// inline script, because the deployed pages carry script-src 'self'.
;(function () {
  try {
    var stored = localStorage.getItem('theme')
    var theme = stored === 'light' || stored === 'dark' ? stored : '__THEME_DEFAULT__'
    var dark =
      theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  } catch {
    // Blocked storage: the page keeps the light tokens.
  }
})()
