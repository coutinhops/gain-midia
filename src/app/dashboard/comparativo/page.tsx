'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import PeriodFilter from '@/components/PeriodFilter'
import ErrorCard from '@/components/ErrorCard'
import { countLeads, formatCurrency, formatNumber, formatPercent } from '@/lib/meta'

type Trend = 'spend' | 'leads' | 'cpl' | 'ctr' | 'cpm' | 'frequency'
const TREND_OPTIONS: { key: Trend; label: string }[] = [
  { key: 'spend',     label: 'Investimento' },
  { key: 'leads',     label: 'Leads' },
  { key: 'cpl',       label: 'CPL' },
  { key: 'ctr',       label: 'CTR' },
  { key: 'cpm',       label: 'CPM' },
  { key: 'frequency', label: 'Frequência' },
]

// ── Funnel stage definitions (same as source)
const TOPO_OBJECTIVES  = ['REACH', 'BRAND_AWARENESS', 'OUTCOME_AWARENESS']
const FUNDO_OBJECTIVES = ['OUTCOME_LEADS', 'LEAD_GENERATION', 'CONVERSIONS', 'OUTCOME_SALES', 'MESSAGES']

export default function ComparativoPage() {
  const [months, setMonths]               = useState(6)
  const [selectedAccount, setSelectedAccount] = useState('')
  const [metaCPL, setMetaCPL]             = useState(50)
  const [trend, setTrend]                 = useState<Trend>('spend')
  const [accountList, setAccountList]     = useState<any[]>([])
  const [monthlyData, setMonthlyData]     = useState<any[]>([])
  const [funnelData, setFunnelData]       = useState<any>(null)
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState('')

  // Load account list once
  useEffect(() => {
    fetch('/api/user-config').then(r => r.json()).then(cfg => {
      const accts = cfg.accounts || []
      setAccountList(accts)
    })
  }, [])

  useEffect(() => { loadData() }, [months, selectedAccount])

  async function loadData() {
    setLoading(true); setError('')
    const cfg = await fetch('/api/user-config').then(r => r.json())
    if (!cfg.meta_token) {
      setError('Token Meta não configurado. Acesse Configurações.')
      setLoading(false); return
    }

    const ids = selectedAccount
      ? [selectedAccount]
      : (cfg.meta_account_ids || [])

    const insFields = 'spend,impressions,clicks,reach,frequency,actions,cost_per_action_type'

    try {
      // ── Build monthly slots
      const now = new Date()
      const slots: Record<string, any> = {}
      for (let m = months - 1; m >= 0; m--) {
        const d = new Date(now.getFullYear(), now.getMonth() - m, 1)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        slots[key] = { month: key, spend: 0, leads: 0, impressions: 0, clicks: 0, frequency: 0, freqCount: 0 }
      }

      // ── Funnel aggregation
      const funnel = { topoSpend: 0, topoImpr: 0, meioClicks: 0, meioCtr: 0, fundoLeads: 0, fundoSpend: 0, totalSpend: 0 }
      let fundoCtrSum = 0, fundoCtrCount = 0

      for (const id of ids) {
        // Monthly breakdown
        const monthRes = await fetch(
          `/api/meta/${id}/insights?fields=${insFields}&level=account&date_preset=last_${months * 30}d&time_increment=monthly&limit=100`
        ).then(r => r.json())

        for (const row of (monthRes.data || [])) {
          const key = row.date_start?.substring(0, 7)
          if (key && slots[key]) {
            const leads = countLeads(row.actions || [])
            slots[key].spend       += parseFloat(row.spend || '0')
            slots[key].leads       += leads
            slots[key].impressions += parseInt(row.impressions || '0')
            slots[key].clicks      += parseInt(row.clicks || '0')
            slots[key].frequency   += parseFloat(row.frequency || '0')
            slots[key].freqCount   += 1
          }
        }

        // Campaign-level for funnel
        const campRes = await fetch(
          `/api/meta/${id}/insights?fields=objective,spend,impressions,clicks,ctr,actions&level=campaign&date_preset=last_${months * 30}d&limit=200`
        ).then(r => r.json())

        for (const c of (campRes.data || [])) {
          const obj = (c.objective || '').toUpperCase()
          const sp  = parseFloat(c.spend || '0')
          const imp = parseInt(c.impressions || '0')
          const cl  = parseInt(c.clicks || '0')
          const lds = countLeads(c.actions || [])
          funnel.totalSpend += sp

          if (TOPO_OBJECTIVES.includes(obj)) {
            funnel.topoSpend += sp
            funnel.topoImpr  += imp
          } else if (FUNDO_OBJECTIVES.includes(obj)) {
            funnel.fundoLeads += lds
            funnel.fundoSpend += sp
          } else {
            funnel.meioClicks += cl
          }
        }
      }

      // Compute CPL, CPM, CTR per month
      const monthly = Object.values(slots).map((s: any) => ({
        month: s.month,
        spend: s.spend,
        leads: s.leads,
        cpl: s.leads > 0 ? s.spend / s.leads : 0,
        ctr: s.impressions > 0 ? s.clicks / s.impressions * 100 : 0,
        cpm: s.impressions > 0 ? s.spend / s.impressions * 1000 : 0,
        frequency: s.freqCount > 0 ? s.frequency / s.freqCount : 0,
      }))

      setMonthlyData(monthly)
      setFunnelData(funnel)
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar comparativo.')
    }
    setLoading(false)
  }

  // ── MoM alerts
  const alerts = useMemo(() => {
    if (monthlyData.length < 2) return []
    const curr = monthlyData[monthlyData.length - 1]
    const prev = monthlyData[monthlyData.length - 2]
    const msgs: { tone: 'warn' | 'bad'; msg: string }[] = []

    if (prev.cpl > 0 && curr.cpl > prev.cpl * 1.18)
      msgs.push({ tone: 'bad', msg: `CPL subiu ${(((curr.cpl / prev.cpl) - 1) * 100).toFixed(0)}% no mês atual vs mês anterior (${formatCurrency(prev.cpl)} → ${formatCurrency(curr.cpl)})` })

    if (prev.leads > 0 && curr.leads < prev.leads * 0.8)
      msgs.push({ tone: 'warn', msg: `Leads caíram ${(((prev.leads - curr.leads) / prev.leads) * 100).toFixed(0)}% na comparação mensal (${prev.leads} → ${curr.leads})` })

    return msgs
  }, [monthlyData])

  const fmt  = formatCurrency
  const fmtN = (n: number) => formatNumber(n, 0)

  const trendFormatter = (v: number) =>
    trend === 'spend' || trend === 'cpl' || trend === 'cpm' ? fmt(v)
    : trend === 'ctr' || trend === 'frequency' ? `${v.toFixed(2)}${trend === 'ctr' ? '%' : 'x'}`
    : fmtN(v)

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Comparativo Mensal</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            Série construída via time_increment=monthly · funil Topo → Meio → Fundo
          </p>
        </div>
      </div>

      <PeriodFilter value="last_30d" onChange={() => {}} />

      <div className="p-6 space-y-6">
        {/* Controls */}
        <div className="metric-card">
          <div className="flex flex-wrap gap-6">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Unidade</label>
              <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}
                className="input-field text-sm" style={{ minWidth: 180 }}>
                <option value="">Todas as contas</option>
                {accountList.map((a: any) => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Período</label>
              <select value={months} onChange={e => setMonths(parseInt(e.target.value))}
                className="input-field text-sm" style={{ minWidth: 160 }}>
                <option value={3}>Últimos 3 meses</option>
                <option value={6}>Últimos 6 meses</option>
                <option value={12}>Últimos 12 meses</option>
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Meta CPL (R$)</label>
              <input type="number" value={metaCPL} onChange={e => setMetaCPL(Number(e.target.value))}
                className="input-field text-sm" style={{ width: 100 }} />
            </div>
          </div>
        </div>

        {loading && <div className="error-card"><p className="text-sm animate-pulse" style={{ color: 'var(--muted)' }}>Carregando série mensal...</p></div>}
        {!loading && error && <ErrorCard title="Erro no comparativo" message={error} />}

        {/* MoM alerts */}
        {!loading && alerts.map((a, i) => (
          <div key={i} className="metric-card" style={{ borderLeft: `3px solid ${a.tone === 'bad' ? '#ef4444' : '#f59e0b'}` }}>
            <p className="text-sm" style={{ color: a.tone === 'bad' ? '#ef4444' : '#f59e0b' }}>
              {a.tone === 'bad' ? '🔴' : '⚠️'} {a.msg}
            </p>
          </div>
        ))}

        {!loading && monthlyData.length > 0 && (
          <>
            {/* Funnel visualization */}
            {funnelData && (
              <div className="metric-card">
                <p className="text-sm font-bold mb-4" style={{ color: 'var(--text)' }}>Funil de conversão</p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 rounded-lg" style={{ background: 'rgba(0,196,160,0.06)' }}>
                    <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>TOPO</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>Alcance / Impressões / CPM</p>
                    <p className="text-lg font-bold mt-2" style={{ color: 'var(--text)' }}>{fmtN(funnelData.topoImpr)}</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>impressões · {fmt(funnelData.topoSpend)}</p>
                  </div>
                  <div className="text-center p-4 rounded-lg" style={{ background: 'rgba(126,184,247,0.06)' }}>
                    <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>MEIO</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>Cliques / CTR / CPC</p>
                    <p className="text-lg font-bold mt-2" style={{ color: 'var(--text)' }}>{fmtN(funnelData.meioClicks)}</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>cliques engajados</p>
                  </div>
                  <div className="text-center p-4 rounded-lg" style={{ background: funnelData.fundoLeads > 0 && funnelData.fundoSpend / funnelData.fundoLeads <= metaCPL ? 'rgba(0,196,160,0.1)' : 'rgba(239,68,68,0.06)' }}>
                    <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>FUNDO</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>Leads / CPL</p>
                    <p className="text-lg font-bold mt-2" style={{ color: 'var(--text)' }}>{fmtN(funnelData.fundoLeads)}</p>
                    <p className="text-xs font-bold" style={{ color: funnelData.fundoLeads > 0 && funnelData.fundoSpend / funnelData.fundoLeads <= metaCPL ? 'var(--teal)' : '#ef4444' }}>
                      CPL {funnelData.fundoLeads > 0 ? fmt(funnelData.fundoSpend / funnelData.fundoLeads) : '—'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Trend tabs */}
            <div className="metric-card">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Tendência mensal</p>
                <div className="flex gap-1 flex-wrap">
                  {TREND_OPTIONS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setTrend(key)}
                      className="text-xs px-3 py-1 rounded-full"
                      style={{
                        background: trend === key ? 'var(--teal)' : 'var(--card)',
                        color: trend === key ? '#000' : 'var(--muted)',
                        border: '1px solid var(--border)',
                        cursor: 'pointer',
                        fontWeight: trend === key ? '700' : '400',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <ResponsiveContainer width="100%" height={300}>
                {trend === 'leads' ? (
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="month" stroke="var(--muted)" tick={{ fontSize: 11 }} />
                    <YAxis stroke="var(--muted)" tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)", color: 'var(--text)', fontSize: 12 }}
                      formatter={(v: any) => [fmtN(v), 'Leads']} />
                    <Bar dataKey="leads" fill="#00c4a0" radius={[4,4,0,0]} />
                  </BarChart>
                ) : (
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="month" stroke="var(--muted)" tick={{ fontSize: 11 }} />
                    <YAxis stroke="var(--muted)" tick={{ fontSize: 11 }} tickFormatter={trendFormatter} />
                    <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12 }}
                      formatter={(v: any) => [trendFormatter(v), TREND_OPTIONS.find(t => t.key === trend)?.label]} />
                    <Line type="monotone" dataKey={trend} stroke="#00c4a0" strokeWidth={2} dot={{ r: 4 }} />
                    {trend === 'cpl' && (
                      <Line type="monotone" dataKey={() => metaCPL} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1.5} name="Meta CPL" dot={false} />
                    )}
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Monthly data table */}
            <div className="metric-card">
              <p className="text-sm font-bold mb-4" style={{ color: 'var(--text)' }}>Dados mensais</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Mês', 'Investimento', 'Leads', 'CPL', 'CTR', 'CPM', 'Frequência'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.map((m, i) => {
                      const isLast = i === monthlyData.length - 1
                      return (
                        <tr key={m.month} style={{ borderBottom: '1px solid var(--border)', background: isLast ? 'rgba(0,196,160,0.04)' : undefined }}>
                          <td className="px-3 py-2.5 font-semibold" style={{ color: 'var(--text)' }}>{m.month}</td>
                          <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{fmt(m.spend)}</td>
                          <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{fmtN(m.leads)}</td>
                          <td className="px-3 py-2.5 font-semibold" style={{ color: m.cpl > 0 && m.cpl <= metaCPL ? 'var(--teal)' : '#ef4444' }}>
                            {m.cpl > 0 ? fmt(m.cpl) : '—'}
                          </td>
                          <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{m.ctr.toFixed(2)}%</td>
                          <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{fmt(m.cpm)}</td>
                          <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{m.frequency.toFixed(2)}</td>
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
