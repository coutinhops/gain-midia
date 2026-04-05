'use client'
import { useState, useEffect } from 'react'
import ErrorCard from '@/components/ErrorCard'
import MetricCard from '@/components/MetricCard'
import PeriodFilter from '@/components/PeriodFilter'
import { countLeads } from '@/lib/meta'

interface Metrics {
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpm: number
  cpc: number
  reach: number
  frequency: number
  leads: number
  cpl: number
}

interface AccountRank {
  id: string
  name: string
  leads: number
  spend: number
  cpl: number
}

export default function DashboardPage() {
  const [period, setPeriod] = useState('last_7d')
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [topAccounts, setTopAccounts] = useState<AccountRank[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(setUser)
  }, [])

  useEffect(() => {
    loadData()
  }, [period])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const cfg = await fetch('/api/user-config').then(r => r.json())
      if (!cfg.meta_token) {
        setError('Token Meta não configurado em Configurações.')
        setLoading(false)
        return
      }

      const fields = 'account_name,spend,impressions,clicks,ctr,cpm,cpc,reach,frequency,actions,cost_per_action_type'
      const accountIds = cfg.meta_account_ids || []
      if (accountIds.length === 0) {
        setError('Nenhuma conta Meta selecionada em Configurações.')
        setLoading(false)
        return
      }

      let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalReach = 0, totalLeads = 0
      const accountResults: AccountRank[] = []

      for (const accountId of accountIds) {
        const res = await fetch(`/api/meta/${accountId}/insights?fields=${fields}&level=account&limit=1&date_preset=${period}`)
        const data = await res.json()
        if (data.data?.[0]) {
          const d = data.data[0]
          const spend = parseFloat(d.spend || '0')
          const impressions = parseInt(d.impressions || '0')
          const clicks = parseInt(d.clicks || '0')
          const reach = parseInt(d.reach || '0')
          const leads = countLeads(d.actions || [])

          totalSpend += spend
          totalImpressions += impressions
          totalClicks += clicks
          totalReach += reach
          totalLeads += leads

          accountResults.push({
            id: accountId,
            name: d.account_name || accountId,
            leads,
            spend,
            cpl: leads > 0 ? spend / leads : 0,
          })
        }
      }

      // Rank by leads descending, keep top 3
      const top3 = accountResults.sort((a, b) => b.leads - a.leads).slice(0, 3)
      setTopAccounts(top3)

      setMetrics({
        spend: totalSpend,
        impressions: totalImpressions,
        clicks: totalClicks,
        ctr: totalClicks > 0 ? (totalClicks / totalImpressions * 100) : 0,
        cpm: totalImpressions > 0 ? (totalSpend / totalImpressions * 1000) : 0,
        cpc: totalClicks > 0 ? (totalSpend / totalClicks) : 0,
        reach: totalReach,
        frequency: totalReach > 0 ? (totalImpressions / totalReach) : 0,
        leads: totalLeads,
        cpl: totalLeads > 0 ? (totalSpend / totalLeads) : 0,
      })
    } catch {
      setError('Erro ao carregar dados.')
    }
    setLoading(false)
  }

  const fmt = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
  const fmtN = (n: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(n)
  const fmtP = (n: number) => `${n.toFixed(2)}%`

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Visão Geral</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: 'var(--muted)' }}>Últimos 7 dias</span>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="text-xs px-3 py-1.5 rounded border"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            Auto-refresh: {autoRefresh ? 'on' : 'off'} ▼
          </button>
          {user && (
            <>
              <span className={user.role === 'admin' ? 'badge-admin' : 'badge-viewer'}>{user.role}</span>
              <span className="text-sm" style={{ color: 'var(--text)' }}>{user.name}</span>
            </>
          )}
        </div>
      </div>

      <PeriodFilter value={period} onChange={setPeriod} />

      <div className="p-6">
        <div className="mb-6">
          <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text)' }}>Performance Consolidada</h2>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Consolidado das contas gerenciadas lido diretamente da Meta API para {period === 'last_7d' ? 'últimos 7 dias' : 'o período selecionado'}.
          </p>
        </div>

        {loading && (
          <div className="error-card">
            <p className="text-sm animate-pulse" style={{ color: 'var(--muted)' }}>Carregando dados...</p>
          </div>
        )}

        {!loading && error && (
          <ErrorCard title="Erro ao carregar" message={error} />
        )}

        {!loading && metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Investimento" value={fmt(metrics.spend)} sub="Total consolidado" />
            <MetricCard label="Impressões" value={fmtN(metrics.impressions)} sub={`CPM ${fmt(metrics.cpm)}`} />
            <MetricCard label="Cliques" value={fmtN(metrics.clicks)} sub={`CTR ${fmtP(metrics.ctr)}`} />
            <MetricCard label="Alcance" value={fmtN(metrics.reach)} sub={`Freq. ${metrics.frequency.toFixed(2)}`} />
            <MetricCard label="CPC Médio" value={fmt(metrics.cpc)} />
            <MetricCard label="Leads" value={fmtN(metrics.leads)} />
            <MetricCard label="CPL" value={fmt(metrics.cpl)} highlight />
          </div>
        )}

        {/* Top 3 Unidades */}
        {!loading && topAccounts.length > 0 && (
          <div className="mt-10">
            <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text)' }}>Top 3 Unidades</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
              Ranking por leads gerados no período.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {topAccounts.map((acc, i) => (
                <div key={acc.id} className="metric-card flex items-start gap-3">
                  <span className="text-2xl leading-none mt-0.5">{medals[i]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate" style={{ color: 'var(--text)' }}>{acc.name}</p>
                    <p className="text-2xl font-bold mt-1" style={{ color: 'var(--teal)' }}>
                      {fmtN(acc.leads)} <span className="text-sm font-normal" style={{ color: 'var(--muted)' }}>leads</span>
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                      CPL {fmt(acc.cpl)} · Inv. {fmt(acc.spend)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
