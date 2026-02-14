import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import {
  createDefaultProfile,
  createProfileId,
  loadActiveProfileId,
  loadProfiles,
  saveActiveProfileId,
  saveProfiles,
  type Profile,
  type ProfileMatchRules,
} from '../lib/profiles'

interface ProfileContextValue {
  profiles: Profile[]
  activeProfileId: string
  activeProfile: Profile
  setActiveProfileId: (id: string) => void
  addProfile: (input: { name: string; rules: ProfileMatchRules }) => void
  updateProfile: (id: string, input: { name: string; rules: ProfileMatchRules }) => void
  deleteProfile: (id: string) => void
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>(() => loadProfiles())
  const [activeProfileId, setActiveProfileState] = useState<string>(() => {
    const loadedProfiles = loadProfiles()
    const loadedActiveId = loadActiveProfileId()
    const activeExists = loadedActiveId && loadedProfiles.some((profile) => profile.id === loadedActiveId)

    return activeExists ? loadedActiveId : loadedProfiles[0].id
  })

  const setActiveProfileId = (id: string) => {
    setActiveProfileState(id)
    saveActiveProfileId(id)
  }

  const addProfile = (input: { name: string; rules: ProfileMatchRules }) => {
    const profile: Profile = {
      id: createProfileId(),
      name: input.name,
      rules: input.rules,
    }

    setProfiles((prev) => {
      const next = [...prev, profile]
      saveProfiles(next)
      return next
    })
  }

  const updateProfile = (id: string, input: { name: string; rules: ProfileMatchRules }) => {
    setProfiles((prev) => {
      const next = prev.map((profile) =>
        profile.id === id
          ? {
              ...profile,
              name: input.name,
              rules: input.rules,
            }
          : profile,
      )
      saveProfiles(next)
      return next
    })
  }

  const deleteProfile = (id: string) => {
    setProfiles((prev) => {
      const nextWithoutDeleted = prev.filter((profile) => profile.id !== id)
      const next = nextWithoutDeleted.length > 0 ? nextWithoutDeleted : [createDefaultProfile()]
      const nextActive = next.some((profile) => profile.id === activeProfileId) ? activeProfileId : next[0].id
      setActiveProfileState(nextActive)
      saveActiveProfileId(nextActive)
      saveProfiles(next)
      return next
    })
  }

  const activeProfile =
    profiles.find((profile) => profile.id === activeProfileId) ??
    profiles[0] ??
    createDefaultProfile()

  const value = useMemo<ProfileContextValue>(
    () => ({
      profiles,
      activeProfileId: activeProfile.id,
      activeProfile,
      setActiveProfileId,
      addProfile,
      updateProfile,
      deleteProfile,
    }),
    [profiles, activeProfile],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfiles(): ProfileContextValue {
  const context = useContext(ProfileContext)
  if (!context) {
    throw new Error('useProfiles must be used within ProfileProvider')
  }

  return context
}
