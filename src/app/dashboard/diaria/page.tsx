'use client'
import { useState, useEffect, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import PeriodFilter from '@/components/PeriodFilter'
import ErrorCard from '@/components/ErrorCard'
import { countLeads, formatCurrency, formatNumber } from '@/lib/meta'

const METRICS = ['spend', 'impressions', 'clicks', 'ctr', 'leads', 'cpc', 'cpm', 'frequency'] as const
type MetricKey = typeof METRICS[number]

const METRIC_LABELS: Record<MetricKey, string> = {
  spend: 'Investimento', impressions: 'Impressões', clicks: 'Cliques',
  ctr: 'CTR', leads: 'Leads', cpc: 'CPC', cpm: 'CPM', frequency: 'Frequência',
}

const COLORS = ['#00c4a0', '#7eb8f7', '#f59e0b', '#ec4899', '#8b5cf6', '#10b981']

export default function DiariaPage() {
  const [period, setPeriod]   = useState('last_30d')
  const [metric, setMetric]   = useState<MetricKey>('spend')
  const [view, setView]       = useState('all')
  const [accounts, setAccounts] = useState<any[]>([])
  const [chartData, setChartData] = useState<any[]>([])
  const [lines, setLines]     = useState<string[]>([])
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(true)
  const [elapsedMs, setElapsedMs] = useState(0)
  const timerRef = useRef<any>(null)
  const startRef = useRef<number>(0)

  useEffect(() => {
    fetch('/api/user-config').then(r => r.json()).then(async cfg => {
      let accts: Array<{id: string; name: string}> = cfg.accounts || []
      if (accts.length === 0) {
        try {
          const adData = await fetch('/api/meta/me/adaccounts?fields=id,name&limit=500').then(r => r.json())
          if (adData?.data?.length > 0) accts = adData.data.map((a: any) => ({ id: a.id, name: a.name }))
          else accts = (cfg.meta_account_ids || []).map((id: string) => ({ id, name: id }))
        } catch { accts = (cfg.meta_account_ids || []).map((id: string) => ({ id, name: id })) }
      }
      setAccounts(accts)
    })
  }, [])

  useEffect(() => { loadData() }, [period, view, metric])

  async function loadData() {
    setLoading(true); setError('')
    setElapsedMs(0)
    startRef.current = Date.now()
    timerRef.current = setInterval(() => setElapsedMs(Date.now() - startRef.current), 100)

    const cfg = await fetch('/api/user-config').then(r => r.json())
    if (!cfg.meta_token) {
      setError('Token Meta não configurado. Acesse Configurações.')
      clearInterval(timerRef.current); setLoading(false); return
    }

    const fields = 'date_start,spend,impressions,clicks,reach,frequency,actions,cost_per_action_type'

    try {
      let cfgAccounts: Array<{id: string; name: string}> = cfg.accounts || []
      if (cfgAccounts.length === 0) {
        try {
          const adData = await fetch('/api/meta/me/adaccounts?fields=id,name&limit=500').then(r => r.json())
          if (adData?.data?.length > 0) cfgAccounts = adData.data.map((a: any) => ({ id: a.id, name: a.name }))
          else cfgAccounts = (cfg.meta_account_ids || []).map((id: string) => ({ id, name: id }))
        } catch { cfgAccounts = (cfg.meta_account_ids || []).map((id: string) => ({ id, name: id })) }
      }
      const acctMap: Record<string, string> = {}
      cfgAccounts.forEach((a: {id: string; name: string}) => { acctMap[a.id] = a.name || a.id })
      const ids = view === 'all' ? cfgAccounts.map((a: {id: string}) => a.id) : [view]

      const allData: Record<string, any> = {}
      const lineNames: string[] = []

      await Promise.all(ids.map(async (id: string) => {
        const res = await fetch(
          `/api/meta/${id}/insights?fields=${fields}&level=account&limit=90&date_preset=${period}&time_increment=1`
        ).then(r => r.json())

        const accName = acctMap[id] || id
        if (!lineNames.includes(accName)) lineNames.push(accName)

        for (const row of (res.data || [])) {
          const date = row.date_start
          if (!allData[date]) allData[date] = { date }

          const spend       = parseFloat(row.spend || '0')
          const impressions = parseInt(row.impressions || '0')
          const clicks      = parseInt(row.clicks || '0')
          const reach       = parseInt(row.reach || '0')
          const frequency   = parseFloat(row.frequency || '0')
          const leads       = countLeads(row.actions || [])

          const val: Record<MetricKey, number> = {
            spend,
            impressions,
            clicks,
            ctr: impressions > 0 ? clicks / impressions * 100 : 0,
            leads,
            cpc: clicks > 0 ? spend / clicks : 0,
            cpm: impressions > 0 ? spend / impressions * 1000 : 0,
            frequency,
          }
          allData[date][accName] = val[metric]
        }
      }))

      clearInterval(timerRef.current)
      setLines(lineNames)
      setChartData(Object.values(allData).sort((a, b) => a.date.localeCompare(b.date)))
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar série diária.')
      clearInterval(timerRef.current)
    }
    setLoading(false)
  }

  const fmt  = formatCurrency
  const fmtN = (n: number) => formatNumber(n, 0)

  const tickFormatter = (v: number) =>
    metric === 'spend' || metric === 'cpc' || metric === 'cpm' ? fmt(v)
    : metric === 'ctr' ? `${v.toFixed(2)}%`
    : fmtN(v)

  // Summary bar for the selected period
  const totals = chartData.reduce((acc, d) => {
    lines.forEach(l => { acc[l] = (acc[l] || 0) + (d[l] || 0) })
    return acc
  }, {} as Record<string, number>)

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Análise Diária</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            Série construída via time_increment=1 · todos os canais Meta
          </p>
        </div>
      </div>

      <PeriodFilter value={period} onChange={setPeriod} />

      <div className="p-6 space-y-6">
        {/* Filters */}
        <div className="metric-card">
          <div className="flex flex-wrap gap-6">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Visualizar</label>
              <select value={view} onChange={e => setView(e.target.value)} className="input-field text-sm" style={{ minWidth: 200 }}>
                <option value="all">Todas as contas</option>
                {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Métrica</label>
              <select value={metric} onChange={e => setMetric(e.target.value as MetricKey)} className="input-field text-sm" style={{ minWidth: 180 }}>
                {METRICS.map(m => <option key={m} value={m}>{METRIC_LABELS[m]}</option>)}
              </select>
            </div>
          </div>
        </div>

        {loading && (
          <div className="error-card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm animate-pulse" style={{ color: 'var(--muted)' }}>
                Lendo insights diários da Meta API...
              </p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Tempo decorrido: {(elapsedMs / 1000).toFixed(1)}s
              </p>
            </div>
          </div>
        )}
        {!loading && error && <ErrorCard title="Erro ao carregar série diária" message={error} />}

        {!loading && chartData.length > 0 && (
          <>
            {/* Summary KPIs */}
            <div className="metric-card">
              <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>
                Total do período — {METRIC_LABELS[metric]}
              </p>
              <div className="flex flex-wrap gap-6">
                {lines.map((line, i) => (
                  <div key={line}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[i % COLORS.length], display: 'inline-block' }} />
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>{line}</span>
                    </div>
                    <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>
                      {metric === 'spend' || metric === 'cpc' || metric === 'cpm'
                        ? fmt(totals[line] || 0)
                        : metric === 'ctr'
                        ? `${((totals[line] || 0) / chartData.length).toFixed(2)}%`
                        : fmtN(totals[line] || 0)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Line chart */}
            <div className="metric-card">
              <p className="text-sm font-bold mb-4" style={{ color: 'var(--text)' }}>
                Evolução diária — {METRIC_LABELS[metric]}
              </p>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" stroke="var(--muted)" tick={{ fontSize: 10 }}
                    tickFormatter={(v) => v.slice(5)} />
                  <YAxis stroke="var(--muted)" tick={{ fontSize: 10 }} tickFormatter={tickFormatter} />
                  <Tooltip
                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12 }}
                    formatter={(v: any) => [tickFormatter(v)]}
                    labelFormatter={(label) => `Data: ${label}`}
                  />
                  <Legend />
                  {lines.map((line, i) => (
                    <Line key={line} type="monotone" dataKey={line} stroke={COLORS[i % COLORS.length]}
                      dot={false} strokeWidth={2} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Detalhamento table */}
            <div className="metric-card">
              <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Detalhamento diário</p>
              <div className="overflow-x-auto" style={{ maxHeight: 520, overflowY: 'auto' }}>
                <table className="w-full text-sm">
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--card)' }}>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th className="text-left px-3 py-2 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                        Data
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                        Dia
                      </th>
                      {lines.map(l => (
                        <th key={l} className="text-right px-3 py-2 text-xs font-bold uppercase tracking-wider"
                          style={{ color: 'var(--muted)' }}>{l}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((d, i) => {
                      const dt = new Date(d.date + 'T12:00:00')
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>{d.date}</td>
                          <td className="px-3 py-2" style={{ color: 'var(--muted)' }}>
                            {dt.toLocaleDateString('pt-BR', { weekday: 'short' })}
                          </td>
                          {lines.map(l => (
                            <td key={l} className="px-3 py-2 text-right" style={{ color: 'var(--text)' }}>
                              {metric === 'spend' || metric === 'cpc' || metric === 'cpm'
                                ? fmt(d[l] || 0)
                                : metric === 'ctr'
                                ? `${(d[l] || 0).toFixed(2)}%`
                                : fmtN(d[l] || 0)}
                            </td>
                          ))}
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
