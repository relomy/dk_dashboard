import { useCallback, useSyncExternalStore } from 'react'

/** Whether a CSS media query matches now, re-rendering when it changes. False without matchMedia. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
      const list = window.matchMedia(query)
      list.addEventListener?.('change', onChange)
      return () => list.removeEventListener?.('change', onChange)
    },
    [query],
  )
  const getSnapshot = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

/** Phones get the bottom tab bar and condensed rows; tablets and up get the rail and full table (Tailwind `md`). */
export function useIsPhone(): boolean {
  return useMediaQuery('(max-width: 767.98px)')
}
