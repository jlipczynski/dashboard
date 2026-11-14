import 'next-auth'

declare module 'next-auth' {
  interface Session {
    // Only a flag — Google tokens are never sent to the client.
    googleConnected?: boolean
    error?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    // Server-only (encrypted JWT in an httpOnly cookie). Read via lib/google-token.ts.
    accessToken?: string
    refreshToken?: string
    accessTokenExpires?: number
    error?: string
  }
}
