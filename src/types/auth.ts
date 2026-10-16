export type SessionState = {
  id: string
  name: string
  isAuthenticated: boolean
  mode: 'account' | 'signed-anonymous-session'
}

export type ProfileResponse = {
  account: {
    id: string
    name: string
    email: string
    createdAt: string
  }
  stats: {
    total: number
    published: number
    private: number
    anonymous: number
    dominantEmotion: 'calm' | 'gentle' | 'longing' | 'courage' | 'tension' | 'sadness' | 'unspecified' | null
  }
}
