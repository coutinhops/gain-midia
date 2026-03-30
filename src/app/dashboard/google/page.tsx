'use client'
import { useState, useEffect } from 'react'
import PeriodFilter from '@/components/PeriodFilter'
import MetricCard from '@/components/MetricCard'
import ErrorCard from '@/components/ErrorCard'

export default function GooglePage() {
  const [period, setPeriod] = useState('last_7d')
  const [user, setUser] = useState<any>(null)
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetch('/api/auth/me').then(r => r.json()).then(setUser) }, [])
  useEffect(() => { loadData() }, [period])

  function periodToDateRange(p: string) {
    const today = new Date()
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    const past = (days: number) => { const d = new Date(today); d.setDate(d.getDate() - days); return fmt(d) }

    switch (p) {
      case 'today': return { start: fmt(today), end: fmt(today) }
      case 'yesterday': return { start: past(1), end: past(1) }
      case 'last_7d': return { start: past(7), end: fmt(today) }
      case 'last_30d': return { start: past(30), end: fmt(today) }
      default: return { start: past(7), end: fmt(today) }
    }
  }

  async function loadData() {
    setLoading(true); setError('')
    const res = await fetch('/api/gads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateRange: periodToDateRange(period) }),
    })
    const json = await res.json()
    if (!res.ok || json.error) { setError(json.error || 'Erro ao carregar Google Ads'); setLoading(false); return }
    setData(json)
    setLoading(false)
  }

  const fmt = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
  const fmtN = (n: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(n)

  const statusBadge = (s: string) => {
    const styles: Record<string, { bg: string; color: string; label: string }> = {
      ENABLED: { bg: '#0a2e1a', color: '#00c4a0', label: 'ATIVA' },
      PAUSED: { bg: '#2e1a0a', color: '#f59e0b', label: 'PAUSADA' },
      REMOVED: { bg: '#2e0a0a', color: '#ef4444', label: 'REMOVIDA' },
    }
    const st = styles[s] || { bg: 'var(--active)', color: 'var(--muted)', label: s }
    return (
      <span className="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider"
            style={{ background: st.bg, color: st.color }}>
        {st.label}
      </span>
    )
  }

  // Aggregate totals
  const campaigns = data?.campaigns || []
  const total = campaigns.reduce((acc: any, c: any) => ({
    cost: acc.cost + c.cost,
    impressions: acc.impressions + c.impressions,
    clicks: acc.clicks + c.clicks,
    conversions: acc.conversions + c.conversions,
    conversionsValue: acc.conversionsValue + c.conversionsValue,
  }), { cost: 0, impressions: 0, clicks: 0, conversions: 0, conversionsValue: 0 })

  const totalCTR = total.impressions > 0 ? (total.clicks / total.impressions * 100) : 0
  const totalCPC = total.clicks > 0 ? (total.cost / total.clicks) : 0

  // Group by customer
  const byCustomer: Record<string, any[]> = {}
  for (const c of campaigns) {
    const key = c.customerName || c.customerId
    if (!byCustomer[key]) byCustomer[key] = []
    byCustomer[key].push(c)
  }

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Google Ads</h1>
        {user && (
          <div className="flex items-center gap-3">
            <span className={user.role === 'admin' ? 'badge-admin' : 'badge-viewer'}>{user.role}</span>
            <span className="text-sm" style={{ color: 'var(--text)' }}>{user.name}</span>
          </div>
        )}
      </div>
      <PeriodFilter value={period} onChange={setPeriod} />

      <div className="p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Campanhas Google Ads</h2>
          {!loading && !error && campaigns.length > 0 && (
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase" style={{ background: '#0a2e1a', color: '#00c4a0' }}>SAUDÁVEL</span>
          )}
        </div>
        <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>Resumo consolidado do legado para pesquisa, Performance Max e remarketing.</p>

        {loading && <div className="error-card"><p className="text-sm animate-pulse" style={{ color: 'var(--muted)' }}>Carregando Google Ads...</p></div>}
        {!loading && error && <ErrorCard title="Erro ao carregar Google Ads" message={error} />}

        {!loading && campaigns.length > 0 && (
          <>
            {/* Summary metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <MetricCard label="Investimento" value={fmt(total.cost)} sub="Contas conectadas da MCC" />
              <MetricCard label="Impressões" value={fmtN(total.impressions)} sub={`CTR ${totalCTR.toFixed(2)}%`} />
              <MetricCard label="Cliques" value={fmtN(total.clicks)} sub={`CPC médio ${fmt(totalCPC)}`} />
              <MetricCard label="Conversões" value={fmtN(total.conversions)} sub={`Valor conv. ${fmt(total.conversionsValue)}`} />
            </div>

            {/* Campaign table */}
            <div className="metric-card">
              <h3 className="font-semibold mb-4" style={{ color: 'var(--text)' }}>Campanhas por conta</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Conta', 'Campanha', 'Status', 'Investimento', 'Impressões', 'Cliques', 'CTR', 'CPC Médio', 'Conversões', 'Valor Conv.', 'Share'].map(h => (
                        <th key={h} className="text-left px-3 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c: any, i: number) => {
                      const share = total.cost > 0 ? (c.cost / total.cost * 100) : 0
                      const ctr = c.impressions > 0 ? (c.clicks / c.impressions * 100) : 0
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{c.customerName}</td>
                          <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{c.campaignName}</td>
                          <td className="px-3 py-2.5">{statusBadge(c.status)}</td>
                          <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{fmt(c.cost)}</td>
                          <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{fmtN(c.impressions)}</td>
                          <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{fmtN(c.clicks)}</td>
                          <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{ctr.toFixed(2)}%</td>
                          <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{fmt(c.averageCpc)}</td>
                          <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{fmtN(c.conversions)}</td>
                          <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{fmt(c.conversionsValue)}</td>
                          <td className="px-3 py-2.5" style={{ color: 'var(--muted)' }}>{share.toFixed(1)}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
