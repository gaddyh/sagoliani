import { useEffect, useRef } from 'react'

// Keeps list pages current without realtime infrastructure: polls while the
// tab is visible and refreshes when the artist returns to the tab.
export function useAutoRefresh(refresh: () => void | Promise<void>, intervalMs = 15000) {
  const latest = useRef(refresh)
  latest.current = refresh

  useEffect(() => {
    const tick = () => { void latest.current() }
    const interval = setInterval(tick, intervalMs)
    const onFocus = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [intervalMs])
}
