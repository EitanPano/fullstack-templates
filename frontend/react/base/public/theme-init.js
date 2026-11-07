// Sets data-theme on <html> to the resolved theme before first paint, so a dark theme never
// flashes light. It is a file, not an inline script, because the deployed pages carry
// script-src 'self'. Keep it in step with core/theme/theme.ts: the same storage key (theme), the
// same default, and the OS preference followed while the choice is system.
;(function () {
  try {
    var valid = { light: 1, dark: 1, system: 1 }
    var stored = localStorage.getItem('theme')
    var theme = valid[stored] ? stored : valid['__THEME_DEFAULT__'] ? '__THEME_DEFAULT__' : 'system'
    var dark =
      theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  } catch (error) {
    // Blocked storage: the page keeps the light tokens until the app mounts and applies the theme.
  }
})()
