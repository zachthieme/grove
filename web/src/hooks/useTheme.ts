import { useState, useEffect, useCallback } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'

export function useTheme() {
  const [themePref, setThemePref] = useState<ThemePref>(
    () => (localStorage.getItem('grove-theme') as ThemePref) || 'system',
  )

  useEffect(() => {
    const apply = (pref: ThemePref) => {
      if (pref === 'system') {
        const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
      } else {
        document.documentElement.setAttribute('data-theme', pref)
      }
    }
    apply(themePref)
    if (themePref === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => apply('system')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [themePref])

  const changeTheme = useCallback((pref: ThemePref) => {
    setThemePref(pref)
    localStorage.setItem('grove-theme', pref)
  }, [])

  return { themePref, changeTheme }
}
