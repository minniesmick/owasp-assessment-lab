export type Theme = 'dark' | 'light'

const KEY = 'owasp-lab-theme'

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'dark' || v === 'light' ? v : null
  } catch {
    return null
  }
}

/** Called before the first render so the page never flashes the wrong theme. */
export function initTheme() {
  const preferred: Theme = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  document.documentElement.dataset.theme = stored() ?? preferred
}

export function setTheme(theme: Theme, { animate = false } = {}) {
  const root = document.documentElement
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (animate && !reduced) {
    root.classList.add('theme-anim')
    window.setTimeout(() => root.classList.remove('theme-anim'), 260)
  }
  root.dataset.theme = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* private mode: theme still applies for this visit */
  }
}
