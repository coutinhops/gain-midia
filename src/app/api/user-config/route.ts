import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/auth'
import { configRepo, accountRepo } from '@/lib/db'

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const config = configRepo.get(user.userId)

  // Auto-sync: if Meta accounts are configured but missing from the SQLite accounts table
  // (happens on every Vercel cold start since SQLite is ephemeral), fetch from Meta API
  if (config.meta_token && config.meta_account_ids.length > 0) {
    const existingAccounts = accountRepo.list()
    const existingMetaIds = new Set(
      existingAccounts.map(a => a.meta_account_id).filter(Boolean)
    )
    const hasMissing = config.meta_account_ids.some(id => !existingMetaIds.has(id))

    if (hasMissing) {
      try {
        const res = await fetch(
          `https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name&limit=200&access_token=${config.meta_token}`
        )
        const data = await res.json()
        if (data.data && Array.isArray(data.data)) {
          const allowedIds = new Set(config.meta_account_ids)
          const toSync = (data.data as Array<{ id: string; name: string }>)
            .filter(a => allowedIds.has(a.id))
          if (toSync.length > 0) {
            accountRepo.upsertFromMeta(toSync)
          }
        }
      } catch (e) {
        console.error('[user-config] Auto-sync accounts failed:', e)
      }
    }
  }

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

  // Save token + selected account IDs
  configRepo.save(user.userId, {
    meta_token: meta_token || null,
    meta_account_ids: Array.isArray(meta_account_ids) ? meta_account_ids : [],
  })

  // If real Meta account data was passed, sync to the accounts table
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
