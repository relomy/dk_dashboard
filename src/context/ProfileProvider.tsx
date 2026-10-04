import { useCallback, useMemo, useState, type ReactNode } from 'react'
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
import { ProfileContext, type ProfileContextValue } from './ProfileContext'

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>(() => loadProfiles())
  const [activeProfileId, setActiveProfileState] = useState<string>(() => {
    const loadedProfiles = loadProfiles()
    const loadedActiveId = loadActiveProfileId()
    const activeExists = loadedActiveId && loadedProfiles.some((profile) => profile.id === loadedActiveId)

    return activeExists ? loadedActiveId : loadedProfiles[0].id
  })

  const setActiveProfileId = useCallback((id: string) => {
    setActiveProfileState(id)
    saveActiveProfileId(id)
  }, [])

  const addProfile = useCallback((input: { name: string; rules: ProfileMatchRules }) => {
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
  }, [])

  const updateProfile = useCallback((id: string, input: { name: string; rules: ProfileMatchRules }) => {
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
  }, [])

  const deleteProfile = useCallback((id: string) => {
    setProfiles((prev) => {
      const nextWithoutDeleted = prev.filter((profile) => profile.id !== id)
      const next = nextWithoutDeleted.length > 0 ? nextWithoutDeleted : [createDefaultProfile()]
      const nextActive = next.some((profile) => profile.id === activeProfileId) ? activeProfileId : next[0].id
      setActiveProfileState(nextActive)
      saveActiveProfileId(nextActive)
      saveProfiles(next)
      return next
    })
  }, [activeProfileId])

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
    [profiles, activeProfile, setActiveProfileId, addProfile, updateProfile, deleteProfile],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

