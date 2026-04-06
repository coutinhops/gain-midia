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

  // Forward all query params from the caller
  searchParams.forEach((value, key) => {
    metaUrl.searchParams.set(key, value)
  })

  // ── Gerenciador parity params (applied to all /insights calls) ──────────────
  // These make the API return numbers identical to Meta Ads Manager:
  //   use_account_attribution_setting → honours the account's own attribution window
  //   action_report_time=mixed        → event-time for pixel, impression-time for clicks
  //     (same hybrid mode used by the Gerenciador's default columns)
  if (pathStr.includes('/insights')) {
    if (!metaUrl.searchParams.has('use_account_attribution_setting')) {
      metaUrl.searchParams.set('use_account_attribution_setting', 'true')
    }
    if (!metaUrl.searchParams.has('action_report_time')) {
      metaUrl.searchParams.set('action_report_time', 'mixed')
    }

    // Auto-include action_values in fields when actions is already requested.
    // action_values is needed to compute revenue-based metrics correctly.
    const fields = metaUrl.searchParams.get('fields') || ''
    if (fields.includes('actions') && !fields.includes('action_values')) {
      metaUrl.searchParams.set('fields', fields + ',action_values')
    }

    // For sub-account levels (campaign/adset/ad) add effective_status filter
    // so only ACTIVE and PAUSED objects are included — matching the Gerenciador
    // default view which excludes DELETED and ARCHIVED objects.
    const level = metaUrl.searchParams.get('level') || ''
    if (['campaign', 'adset', 'ad'].includes(level) && !metaUrl.searchParams.has('filtering')) {
      metaUrl.searchParams.set(
        'filtering',
        JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] }])
      )
    }
  }

  const metaRes = await fetch(metaUrl.toString())
  const data = await metaRes.json()

  return NextResponse.json(data, { status: metaRes.status })
}

export const GET = handler
export const POST = handler
