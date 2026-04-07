'use client'
import { useState, useEffect, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import PeriodFilter from '@/components/PeriodFilter'
import ErrorCard from '@/components/ErrorCard'
import {
  countLeads, calcMetrics, BENCHMARKS,
  STATE_REGION, MACRO_REGIONS,
  formatCurrency, formatNumber, formatPercent,
} from '@/lib/meta'

// Network-level benchmarks (slightly relaxed vs per-account)
const NET_BENCHMARKS = { ctr: 1.5, cpm: 35, cpc: 4, freq: 3.5, cpl: 60 }

export default function RedePage() {
  const [period, setPeriod] = useState('last_7d')
  const [accounts, setAccounts] = useState<any[]>([])
  const [rows, setRows] = useState<any[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [period])

  async function loadData() {
    setLoading(true); setError('')
    const cfg = await fetch('/api/user-config').then(r => r.json())
    if (!cfg.meta_token) {
      setError('Token Meta não configurado. Acesse Configurações.')
      setLoading(false); return
    }

    const fields = 'spend,impressions,clicks,reach,frequency,actions,cost_per_action_type'
    const geoFields = 'spend,impressions,clicks,reach,actions'

    try {
      // Get all accounts — prefer cfg.accounts (seeded from env var),
      // fall back to auto-discovery via Meta API if table is empty.
      let cfgAccounts: Array<{id: string; name: string}> = cfg.accounts || []
      if (cfgAccounts.length === 0) {
        try {
          const adData = await fetch('/api/meta/me/adaccounts?fields=id,name&limit=500').then(r => r.json())
          if (adData?.data?.length > 0) {
            cfgAccounts = adData.data.map((a: any) => ({ id: a.id, name: a.name }))
          } else {
            cfgAccounts = (cfg.meta_account_ids || []).map((id: string) => ({ id, name: id }))
          }
        } catch {
          cfgAccounts = (cfg.meta_account_ids || []).map((id: string) => ({ id, name: id }))
        }
      }

      // Parallel fetch all accounts
      const fetches = cfgAccounts.map(async (acct: {id: string; name: string}) => {
        const id = acct.id
        const [insRes] = await Promise.all([
          fetch(`/api/meta/${id}/insights?fields=${fields}&level=account&date_preset=${period}`).then(r => r.json()),
        ])
        const row = insRes.data?.[0] || {}
        const spend       = parseFloat(row.spend || '0')
        const impressions = parseInt(row.impressions || '0')
        const clicks      = parseInt(row.clicks || '0')
        const reach       = parseInt(row.reach || '0')
        const frequency   = parseFloat(row.frequency || '0')
        const leads       = countLeads(row.actions || [])
        const m           = calcMetrics({ spend, impressions, clicks, reach, frequency, leads })
        return { id, name: acct.name || id, ...m }
      })

      const results = await Promise.all(fetches)
      // Sort by spend descending, top 8
      const sorted = results.sort((a, b) => b.spend - a.spend).slice(0, 8)
      setAccounts(cfgAccounts)
      setRows(sorted)
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar dados da rede.')
    }
    setLoading(false)
  }

  // ── Aggregated network totals
  const totals = useMemo(() => {
    if (!rows.length) return null
    const sum = (key: keyof typeof rows[0]) => rows.reduce((s, r) => s + (r[key] as number || 0), 0)
    const totalSpend = sum('spend')
    const totalImpr  = sum('impressions')
    const totalClicks = sum('clicks')
    const totalLeads = sum('leads')
    const totalReach = sum('reach')
    return {
      spend: totalSpend,
      impressions: totalImpr,
      clicks: totalClicks,
      leads: totalLeads,
      reach: totalReach,
      ctr: totalImpr > 0 ? totalClicks / totalImpr * 100 : 0,
      cpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
      cpm: totalImpr > 0 ? totalSpend / totalImpr * 1000 : 0,
      cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
    }
  }, [rows])

  const fmt  = formatCurrency
  const fmtN = (n: number) => formatNumber(n, 0)

  const toneColor = (val: number, bench: number, higher = false) => {
    if (higher) return val >= bench ? 'var(--teal)' : '#ef4444'
    return val <= bench ? 'var(--teal)' : '#ef4444'
  }

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Análise da Rede</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            Comportamento agregado — top 8 contas por investimento
          </p>
        </div>
      </div>

      <PeriodFilter value={period} onChange={setPeriod} />

      <div className="p-6 space-y-6">
        {loading && <div className="error-card"><p className="text-sm animate-pulse" style={{ color: 'var(--muted)' }}>Consolidando rede...</p></div>}
        {!loading && error && <ErrorCard title="Erro ao carregar rede" message={error} />}

        {!loading && totals && (
          <>
            {/* Network totals */}
            <div className="metric-card">
              <p className="text-sm font-bold mb-4" style={{ color: 'var(--text)' }}>Consolidado da rede</p>
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: 'Investimento total', value: fmt(totals.spend) },
                  { label: 'Impressões',          value: fmtN(totals.impressions) },
                  { label: 'Cliques',             value: fmtN(totals.clicks) },
                  { label: 'Leads',               value: fmtN(totals.leads) },
                  {
                    label: 'CTR médio',
                    value: `${totals.ctr.toFixed(2)}%`,
                    color: toneColor(totals.ctr, NET_BENCHMARKS.ctr, true),
                  },
                  {
                    label: 'CPL médio',
                    value: fmt(totals.cpl),
                    color: toneColor(totals.cpl, NET_BENCHMARKS.cpl),
                  },
                  {
                    label: 'CPM médio',
                    value: fmt(totals.cpm),
                    color: toneColor(totals.cpm, NET_BENCHMARKS.cpm),
                  },
                  {
                    label: 'CPC médio',
                    value: fmt(totals.cpc),
                    color: toneColor(totals.cpc, NET_BENCHMARKS.cpc),
                  },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>{label}</p>
                    <p className="font-bold text-sm mt-0.5" style={{ color: color || 'var(--text)' }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Share bar chart */}
            <div className="metric-card">
              <p className="text-sm font-bold mb-4" style={{ color: 'var(--text)' }}>
                Investimento por conta — participação na rede
              </p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={rows} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" stroke="var(--muted)" tick={{ fontSize: 11 }}
                    tickFormatter={(v) => fmt(v)} />
                  <YAxis type="category" dataKey="name" stroke="var(--muted)" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip
                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12 }}
                    formatter={(v: any) => [fmt(v), 'Investimento']}
                  />
                  <Bar dataKey="spend" fill="#00c4a0" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Account table */}
            <div className="metric-card">
              <p className="text-sm font-bold mb-4" style={{ color: 'var(--text)' }}>Ranking de contas</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Conta', 'Investimento', 'Share', 'Impressões', 'Cliques', 'CTR', 'CPC', 'Leads', 'CPL', 'Frequência'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-xs font-bold uppercase tracking-wider"
                          style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const share = totals.spend > 0 ? r.spend / totals.spend * 100 : 0
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--text)' }}>
                            <a href={`/dashboard/individual/${r.id}`} style={{ color: 'var(--teal)' }}>{r.name}</a>
                          </td>
                          <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{fmt(r.spend)}</td>
                          <td className="px-3 py-2.5 font-semibold" style={{ color: 'var(--muted)' }}>{share.toFixed(1)}%</td>
                          <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{fmtN(r.impressions)}</td>
                          <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{fmtN(r.clicks)}</td>
                          <td className="px-3 py-2.5" style={{ color: toneColor(r.ctr, NET_BENCHMARKS.ctr, true) }}>{r.ctr.toFixed(2)}%</td>
                          <td className="px-3 py-2.5" style={{ color: toneColor(r.cpc, NET_BENCHMARKS.cpc) }}>{fmt(r.cpc)}</td>
                          <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{fmtN(r.leads)}</td>
                          <td className="px-3 py-2.5" style={{ color: toneColor(r.cpl, NET_BENCHMARKS.cpl) }}>{r.leads > 0 ? fmt(r.cpl) : '—'}</td>
                          <td className="px-3 py-2.5" style={{ color: r.frequency > NET_BENCHMARKS.freq ? '#ef4444' : 'var(--text)' }}>
                            {r.frequency.toFixed(2)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Benchmarks reference card */}
            <div className="metric-card">
              <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Benchmarks de referência da rede</p>
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: 'CPM', range: `R$ ${BENCHMARKS.cpm.min}–R$ ${BENCHMARKS.cpm.max}` },
                  { label: 'CTR', range: `${BENCHMARKS.ctr.min}–${BENCHMARKS.ctr.max}%` },
                  { label: 'CPC', range: `R$ ${BENCHMARKS.cpc.min}–R$ ${BENCHMARKS.cpc.max}` },
                  { label: 'Frequência', range: `${BENCHMARKS.frequency.min}–${BENCHMARKS.frequency.max}x` },
                ].map(({ label, range }) => (
                  <div key={label} className="text-center p-3 rounded-lg" style={{ background: 'rgba(0,196,160,0.06)' }}>
                    <p className="text-xs font-bold" style={{ color: 'var(--muted)' }}>{label}</p>
                    <p className="text-sm font-semibold mt-1" style={{ color: 'var(--teal)' }}>{range}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
