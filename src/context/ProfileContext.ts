import { createContext, useContext } from 'react'
import type { Profile, ProfileMatchRules } from '../lib/profiles'

export interface ProfileContextValue {
  profiles: Profile[]
  activeProfileId: string
  activeProfile: Profile
  setActiveProfileId: (id: string) => void
  addProfile: (input: { name: string; rules: ProfileMatchRules }) => void
  updateProfile: (id: string, input: { name: string; rules: ProfileMatchRules }) => void
  deleteProfile: (id: string) => void
}

export const ProfileContext = createContext<ProfileContextValue | null>(null)

export function useProfiles(): ProfileContextValue {
  const context = useContext(ProfileContext)
  if (!context) {
    throw new Error('useProfiles must be used within ProfileProvider')
  }

  return context
}
