/* global document, location, URLSearchParams */
// The screens' host page takes its scheme from `?scheme=dark|light`. Its policy allows no style, so
// the scheme is written through the CSSOM.
const dark = new URLSearchParams(location.search).get('scheme') === 'dark'
const root = document.documentElement.style
root.setProperty('color-scheme', dark ? 'dark' : 'light')
root.setProperty('background', dark ? '#121212' : '#ffffff')
root.setProperty('color', dark ? '#f0f0f0' : '#1a1a1a')
