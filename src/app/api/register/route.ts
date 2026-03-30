import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { signToken } from '@/lib/auth'
import { userRepo } from '@/lib/db'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json()

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Nome, email e senha são obrigatórios' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Senha deve ter pelo menos 8 caracteres' }, { status: 400 })
    }

    const existing = userRepo.findByEmail(email.toLowerCase().trim())
    if (existing) {
      return NextResponse.json({ error: 'E-mail já cadastrado' }, { status: 409 })
    }

    const hash = await bcrypt.hash(password, 10)
    const id = crypto.randomUUID()
    const user = userRepo.create(id, email.toLowerCase().trim(), name.trim(), hash, 'viewer')

    const token = await signToken({ userId: user.id, email: user.email, name: user.name, role: user.role })

    const response = NextResponse.json({ success: true, user })
    response.cookies.set('auth_token', token, { httpOnly: true, path: '/', sameSite: 'lax', maxAge: 7 * 24 * 3600 })
    return response
  } catch (error) {
    console.error('[register]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
