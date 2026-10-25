export type NavEntry = { to: string; label: string }

// The primary navigation: a feature adds its entry here and nowhere else in the shell.
export const NAV: NavEntry[] = [{ to: '/', label: 'Home' }]
