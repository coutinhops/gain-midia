import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/auth'
import { configRepo } from '@/lib/db'
import { META_API_BASE } from '@/lib/meta'

async function handler(req: NextRequest, { params }: { params: { path: string[] } }) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const config = configRepo.get(user.userId)
  if (!config.meta_token) {
    return NextResponse.json({ error: 'Token Meta não configurado em Configurações.' }, { status: 400 })
  }

  const pathStr = params.path.join('/')
  const searchParams = req.nextUrl.searchParams
  const metaUrl = new URL(`${META_API_BASE}/${pathStr}`)
  metaUrl.searchParams.set('access_token', config.meta_token)

  // Forward all query params
  searchParams.forEach((value, key) => {
    metaUrl.searchParams.set(key, value)
  })

  const metaRes = await fetch(metaUrl.toString())
  const data = await metaRes.json()

  return NextResponse.json(data, { status: metaRes.status })
}

export const GET = handler
export const POST = handler
