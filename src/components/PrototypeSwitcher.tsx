// PROTOTYPE — throwaway. Floating variant switcher; never rendered in production builds.
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

type Variant = { key: string; name: string }

export default function PrototypeSwitcher({ variants }: { variants: Variant[] }) {
  const [params, setParams] = useSearchParams()
  const current = params.get('variant') ?? variants[0].key
  const index = Math.max(0, variants.findIndex((v) => v.key === current))

  const go = (delta: number) => {
    const next = variants[(index + delta + variants.length) % variants.length]
    const updated = new URLSearchParams(params)
    updated.set('variant', next.key)
    setParams(updated, { replace: true })
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (event.key === 'ArrowLeft') go(-1)
      if (event.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ?shot hides the bar for reference screenshots.
  if (import.meta.env.PROD || params.has('shot')) return null

  return (
    <div className="fixed bottom-20 md:bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full border-2 border-fuchsia-400 bg-black px-1.5 py-1 font-mono text-xs text-white shadow-2xl">
      <button type="button" onClick={() => go(-1)} className="rounded-full px-2.5 py-1 hover:bg-white/15" aria-label="Previous variant">
        ←
      </button>
      <span className="px-2 whitespace-nowrap">
        <span className="text-fuchsia-300">{variants[index].key}</span> · {variants[index].name}
      </span>
      <button type="button" onClick={() => go(1)} className="rounded-full px-2.5 py-1 hover:bg-white/15" aria-label="Next variant">
        →
      </button>
    </div>
  )
}
