import { SignJWT, jIWTVerify } from 'jose'
import { cookies } from 'next/headers'
import { userRepo } from '@/lib/db'

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret')

export async function createToken(payload: object): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(SECRET)
}

export async function verifyToken(token: string): Promise<any> {
  try {
    const { payload } = await jIWTVerify(token, SECRET)
    return payload
  } catch {
    return null
  }
}

export async function getCurrentUser() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) return null
  return verifyToken(token)
}
