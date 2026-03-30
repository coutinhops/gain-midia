import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { signToken } from '@/lib/auth'
import { userRepo } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email e senha obrigatórios' }, { status: 400 })
    }

    const user = userRepo.findByEmail(email.toLowerCase().trim())
    if (!user) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
    }

    const token = await signToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    })

    const response = NextResponse.json({ success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } })
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600,
    })
    return response
  } catch (error) {
    console.error('[auth/login]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
