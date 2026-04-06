import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/auth'
import { configRepo, accountRepo } from '@/lib/db'

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const config = configRepo.get(user.userId)
  const accounts = accountRepo.list()

  return NextResponse.json({
    ...config,
    accounts: accounts.map(a => ({ id: a.id, slug: a.slug, name: a.name, color: a.color })),
  })
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { meta_token, meta_account_ids, accounts } = body

  configRepo.save(user.userId, {
    meta_token: meta_token || null,
    meta_account_ids: Array.isArray(meta_account_ids) ? meta_account_ids : [],
  })

  if (Array.isArray(accounts) && accounts.length > 0) {
    const validAccounts = accounts
      .filter((a: any) => a.id && a.name)
      .map((a: any) => ({ id: String(a.id), name: String(a.name) }))
    if (validAccounts.length > 0) {
      accountRepo.upsertFromMeta(validAccounts)
    }
  }

  return NextResponse.json({ success: true })
}
