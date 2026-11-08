// Sets data-theme on <html> to the resolved theme before first paint, so a dark theme never
// flashes light. It is a file, not an inline script, because the deployed pages carry
// script-src 'self'. Keep it in step with core/providers/theme.ts: the same storage key (theme), the
// same default, and the OS preference followed while the choice is system.
;(function () {
  try {
    var isTheme = function (value) {
      return value === 'light' || value === 'dark' || value === 'system'
    }
    // The storage provider writes JSON, so a choice is the string "dark" with its quotes; a value
    // that is not JSON counts as unset.
    var stored = null
    try {
      stored = JSON.parse(localStorage.getItem('theme'))
    } catch (parseError) {
      stored = null
    }
    var theme = isTheme(stored)
      ? stored
      : isTheme('__THEME_DEFAULT__')
        ? '__THEME_DEFAULT__'
        : 'system'
    var dark =
      theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  } catch (error) {
    // Blocked storage: the page keeps the light tokens until the app mounts and applies the theme.
  }
})()
