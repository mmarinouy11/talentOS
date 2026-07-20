import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { google } from 'googleapis'
import type { Role } from '@prisma/client'

async function clearGmailTokensIfExpired(userId: string, refreshToken: string) {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_OAUTH_CLIENT_ID,
      process.env.GMAIL_OAUTH_CLIENT_SECRET,
      `${process.env.NEXTAUTH_URL}/api/auth/gmail/callback`,
    )
    oauth2Client.setCredentials({ refresh_token: refreshToken })
    await oauth2Client.getAccessToken()
  } catch (err: unknown) {
    const msg = String((err as Record<string, unknown>)?.message ?? '')
    const code = String((err as Record<string, unknown>)?.code ?? '')
    if (code === 'invalid_grant' || msg.includes('invalid_grant') || msg.includes('Token has been expired or revoked')) {
      await db.user.update({
        where: { id: userId },
        data: { gmailAccessToken: null, gmailRefreshToken: null, gmailTokenExpiry: null, gmailConnectedEmail: null },
      })
    }
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter: PrismaAdapter(db),
  session: { strategy: 'jwt' },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await db.user.findUnique({
          where: { email: credentials.email as string },
        })

        if (!user || !user.passwordHash) return null
        if (!user.active) return null

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash,
        )
        if (!valid) return null

        if (user.gmailRefreshToken) {
          clearGmailTokensIfExpired(user.id, user.gmailRefreshToken).catch(() => {})
        }

        return { id: user.id, email: user.email, name: user.name, role: user.role }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: Role }).role
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!
        ;(session.user as { role?: Role }).role = token.role as Role
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
})
