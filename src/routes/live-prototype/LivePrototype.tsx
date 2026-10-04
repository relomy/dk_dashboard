// PROTOTYPE — throwaway. Three Live (sweat view) variants on /live/:sport, picked via ?variant=.
// Rendered outside AppShell because the shell/nav is part of what's being redesigned.
import { useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import PrototypeSwitcher from '@/components/PrototypeSwitcher'
import { useSportSnapshot } from '@/hooks/useSportSnapshot'
import { buildLiveModel } from './liveModel'
import VariantA, { name as nameA } from './VariantA'
import VariantB, { name as nameB } from './VariantB'
import VariantC, { name as nameC } from './VariantC'

const VARIANTS = [
  { key: 'A', name: nameA, Component: VariantA, dark: true },
  { key: 'B', name: nameB, Component: VariantB, dark: false },
  { key: 'C', name: nameC, Component: VariantC, dark: true },
]

export default function LivePrototype() {
  const { sport = '' } = useParams()
  const [params] = useSearchParams()
  const variant = VARIANTS.find((v) => v.key === params.get('variant')) ?? VARIANTS[0]
  const { snapshot, loading, error } = useSportSnapshot()

  // shadcn's dark tokens hang off <html class="dark">, so portals (sheets) follow too.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', variant.dark)
    return () => document.documentElement.classList.remove('dark')
  }, [variant.dark])

  const model = snapshot ? buildLiveModel(snapshot, sport.toLowerCase()) : null
  const { Component } = variant

  return (
    <div className="proto-root">
      {loading ? (
        <p className="p-6">Loading…</p>
      ) : error instanceof Error ? (
        <p className="p-6 text-red-500">{error.message}</p>
      ) : !model ? (
        <p className="p-6">No primary contest for {sport}.</p>
      ) : (
        <Component model={model} />
      )}
      <PrototypeSwitcher variants={VARIANTS} />
    </div>
  )
}
