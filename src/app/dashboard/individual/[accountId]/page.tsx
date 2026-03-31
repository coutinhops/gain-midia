'use client'
import { useState, useEffect, useMemo } from 'react'
import PeriodFilter from '@/components/PeriodFilter'
import MetricCard from '@/components/MetricCard'
import ErrorCard from '@/components/ErrorCard'
import { countLeads, calcMetrics, classifyObjective, formatCurrency, formatNumber } from '@/lib/meta'

interface PageProps {
  params: { accountId: string }
}

type TabKey = 'campanhas' | 'conjuntos' | 'anuncios'

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  ACTIVE:  { label: 'Ativa',   color: 'var(--teal)' },
  PAUSED:  { label: 'Pausada', color: '#f59e0b' },
  DELETED: { label: 'Deletada',color: '#ef4444' },
  ARCHIVED:{ label: 'Arquivada', color: '#6b7280' },
}

export default function IndividualPage({ params }: PageProps) {
  const { accountId } = params
  const [period, setPeriod]   = useState('last_30d')
  const [tab, setTab]         = useState<TabKey>('campanhas')
  const [account, setAccount] = useState<any>(null)
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [adsets, setAdsets]   = useState<any[]>([])
  const [ads, setAds]         = useState<any[]>([])
  const [overview, setOverview] = useState<any>(null)
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(true)
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => { loadData() }, [accountId, period])

  async function loadData() {
    setLoading(true); setError('')
    setElapsedMs(0)
    const start = Date.now()
    const timer = setInterval(() => setElapsedMs(Date.now() - start), 100)

    const cfg = await fetch('/api/user-config').then(r => r.json())
    if (!cfg.meta_token) {
      setError('Token Meta não configurado.')
      clearInterval(timer); setLoading(false); return
    }

    const base = `spend,impressions,clicks,reach,frequency,actions,cost_per_action_type`

    try {
      const [acctRes, overviewRes, campaignRes, adsetRes, adRes] = await Promise.all([
        fetch(`/api/meta/${accountId}?fields=id,name,account_status,currency,timezone_name,business,amount_spent`).then(r => r.json()),
        fetch(`/api/meta/${accountId}/insights?fields=${base}&level=account&date_preset=${period}`).then(r => r.json()),
        fetch(`/api/meta/${accountId}/insights?fields=campaign_id,campaign_name,status,effective_status,objective,${base}&level=campaign&limit=200&date_preset=${period}`).then(r => r.json()),
        fetch(`/api/meta/${accountId}/insights?fields=adset_id,adset_name,campaign_id,campaign_name,status,effective_status,${base}&level=adset&limit=200&date_preset=${period}`).then(r => r.json()),
        fetch(`/api/meta/${accountId}/insights?fields=ad_id,ad_name,adset_id,campaign_id,status,effective_status,${base}&level=ad&limit=500&date_preset=${period}`).then(r => r.json()),
      ])

      clearInterval(timer)
      setAccount(acctRes)
      setOverview(overviewRes.data?.[0] || null)
      setCampaigns(campaignRes.data || [])
      setAdsets(adsetRes.data || [])
      setAds(adRes.data || [])
    } catch (e: any) {
      clearInterval(timer)
      setError(e.message || 'Erro ao carregar dados da conta.')
    }
    setLoading(false)
  }

  // ── Computed overview metrics
  const overviewMetrics = useMemo(() => {
    if (!overview) return null
    return calcMetrics({
      spend: parseFloat(overview.spend || '0'),
      impressions: parseInt(overview.impressions || '0'),
      clicks: parseInt(overview.clicks || '0'),
      reach: parseInt(overview.reach || '0'),
      frequency: parseFloat(overview.frequency || '0'),
      leads: countLeads(overview.actions || []),
    })
  }, [overview])

  // ── Row builders
  function buildCampaignRow(c: any) {
    const sp = parseFloat(c.spend || '0')
    const im = parseInt(c.impressions || '0')
    const cl = parseInt(c.clicks || '0')
    const ld = countLeads(c.actions || [])
    const rc = parseInt(c.reach || '0')
    return {
      id: c.campaign_id,
      name: c.campaign_name,
      status: c.effective_status || c.status,
      objective: classifyObjective(c.objective),
      spend: sp,
      impressions: im,
      clicks: cl,
      ctr: im > 0 ? cl / im * 100 : 0,
      reach: rc,
      leads: ld,
      cpl: ld > 0 ? sp / ld : 0,
    }
  }

  function buildAdsetRow(a: any) {
    const sp = parseFloat(a.spend || '0')
    const im = parseInt(a.impressions || '0')
    const cl = parseInt(a.clicks || '0')
    const ld = countLeads(a.actions || [])
    return {
      id: a.adset_id,
      name: a.adset_name,
      campaign: a.campaign_name,
      status: a.effective_status || a.status,
      spend: sp,
      impressions: im,
      clicks: cl,
      ctr: im > 0 ? cl / im * 100 : 0,
      leads: ld,
      cpl: ld > 0 ? sp / ld : 0,
    }
  }

  function buildAdRow(a: any) {
    const sp = parseFloat(a.spend || '0')
    const im = parseInt(a.impressions || '0')
    const cl = parseInt(a.clicks || '0')
    const ld = countLeads(a.actions || [])
    return {
      id: a.ad_id,
      name: a.ad_name,
      campaign: a.campaign_id,
      status: a.effective_status || a.status,
      spend: sp,
      impressions: im,
      clicks: cl,
      ctr: im > 0 ? cl / im * 100 : 0,
      leads: ld,
      cpl: ld > 0 ? sp / ld : 0,
    }
  }

  const campaignRows = useMemo(() => campaigns.map(buildCampaignRow), [campaigns])
  const adsetRows    = useMemo(() => adsets.map(buildAdsetRow), [adsets])
  const adRows       = useMemo(() => ads.map(buildAdRow), [ads])

  const fmt  = formatCurrency
  const fmtN = (n: number) => formatNumber(n, 0)
  const accountName = account?.name || accountId.replace('ou-', '').replace(/-/g, ' ')

  const StatusBadge = ({ status }: { status: string }) => {
    const s = STATUS_MAP[status] || { label: status, color: 'var(--muted)' }
    return <span style={{ color: s.color, fontWeight: 600, fontSize: 12 }}>{s.label}</span>
  }

  const ObjBadge = ({ obj }: { obj: string }) => {
    const colors: Record<string, string> = { topo: '#7eb8f7', meio: '#f59e0b', fundo: '#00c4a0' }
    return (
      <span style={{ background: `${colors[obj]}22`, color: colors[obj], padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
        {obj}
      </span>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <h1 className="text-xl font-bold capitalize" style={{ color: 'var(--text)' }}>
            {accountName}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            Dados lidos diretamente da Meta API · exibindo apenas itens ativos
          </p>
        </div>
      </div>

      <PeriodFilter value={period} onChange={setPeriod} />

      <div className="p-6 space-y-6">
        {loading && (
          <div className="error-card">
            <div className="flex items-center justify-between">
              <p className="text-sm animate-pulse" style={{ color: 'var(--muted)' }}>
                Lendo campanhas, conjuntos e anúncios da Meta API...
              </p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {(elapsedMs / 1000).toFixed(1)}s
              </p>
            </div>
          </div>
        )}
        {!loading && error && <ErrorCard title="Erro ao carregar conta" message={error} />}

        {!loading && overviewMetrics && (
          <>
            {/* Overview KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard label="Investimento" value={fmt(overviewMetrics.spend)} />
              <MetricCard label="Impressões" value={fmtN(overviewMetrics.impressions)} sub={`CPM ${fmt(overviewMetrics.cpm)}`} />
              <MetricCard label="Cliques" value={fmtN(overviewMetrics.clicks)} sub={`CTR ${overviewMetrics.ctr.toFixed(2)}%`} />
              <MetricCard label="Alcance" value={fmtN(overviewMetrics.reach)} sub={`Freq. ${overviewMetrics.frequency.toFixed(2)}`} />
              <MetricCard label="CPC Médio" value={fmt(overviewMetrics.cpc)} />
              <MetricCard label="Leads" value={fmtN(overviewMetrics.leads)} />
              <MetricCard label="CPL" value={overviewMetrics.leads > 0 ? fmt(overviewMetrics.cpl) : '—'} highlight />
              <MetricCard
                label="Lead Rate"
                value={overviewMetrics.clicks > 0 ? `${overviewMetrics.leadRate.toFixed(2)}%` : '—'}
                sub="leads / cliques"
              />
            </div>

            {/* Account info */}
            {account && (
              <div className="metric-card" style={{ padding: '12px 16px' }}>
                <div className="flex flex-wrap gap-6 text-xs">
                  <div><span style={{ color: 'var(--muted)' }}>ID: </span><span style={{ color: 'var(--text)' }}>{account.id}</span></div>
                  <div><span style={{ color: 'var(--muted)' }}>Moeda: </span><span style={{ color: 'var(--text)' }}>{account.currency}</span></div>
                  <div><span style={{ color: 'var(--muted)' }}>Fuso: </span><span style={{ color: 'var(--text)' }}>{account.timezone_name}</span></div>
                  {account.business?.name && <div><span style={{ color: 'var(--muted)' }}>Business: </span><span style={{ color: 'var(--text)' }}>{account.business.name}</span></div>}
                </div>
              </div>
            )}

            {/* Tabs */}
            <div>
              <div className="flex gap-1 mb-4">
                {([
                  { key: 'campanhas', label: `Campanhas (${campaignRows.length})` },
                  { key: 'conjuntos', label: `Conjuntos (${adsetRows.length})` },
                  { key: 'anuncios',  label: `Anúncios (${adRows.length})` },
                ] as { key: TabKey; label: string }[]).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className="text-sm px-4 py-2 rounded-lg"
                    style={{
                      background: tab === key ? 'var(--teal)' : 'var(--card)',
                      color: tab === key ? '#000' : 'var(--muted)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      fontWeight: tab === key ? '700' : '400',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Campanhas tab */}
              {tab === 'campanhas' && campaignRows.length > 0 && (
                <div className="metric-card">
                  <div className="overflow-x-auto" style={{ maxHeight: 520, overflowY: 'auto' }}>
                    <table className="w-full text-sm">
                      <thead style={{ position: 'sticky', top: 0, background: 'var(--card)' }}>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          {['Campanha', 'Status', 'Objetivo', 'Investimento', 'Impressões', 'Cliques', 'CTR', 'Alcance', 'Leads', 'CPL'].map(h => (
                            <th key={h} className="text-left px-3 py-2 text-xs font-bold uppercase tracking-wider"
                              style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {campaignRows.map(c => (
                          <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--text)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.name}>{c.name}</td>
                            <td className="px-3 py-2.5"><StatusBadge status={c.status} /></td>
                            <td className="px-3 py-2.5"><ObjBadge obj={c.objective} /></td>
                            <td className="px-3 py-2.5 font-semibold" style={{ color: 'var(--text)' }}>{fmt(c.spend)}</td>
                            <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{fmtN(c.impressions)}</td>
                            <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{fmtN(c.clicks)}</td>
                            <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{c.ctr.toFixed(2)}%</td>
                            <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{fmtN(c.reach)}</td>
                            <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{fmtN(c.leads)}</td>
                            <td className="px-3 py-2.5 font-semibold" style={{ color: c.leads > 0 ? 'var(--teal)' : 'var(--muted)' }}>
                              {c.leads > 0 ? fmt(c.cpl) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Conjuntos tab */}
              {tab === 'conjuntos' && adsetRows.length > 0 && (
                <div className="metric-card">
                  <div className="overflow-x-auto" style={{ maxHeight: 520, overflowY: 'auto' }}>
                    <table className="w-full text-sm">
                      <thead style={{ position: 'sticky', top: 0, background: 'var(--card)' }}>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          {['Conjunto', 'Campanha', 'Status', 'Investimento', 'Impressões', 'Cliques', 'CTR', 'Leads', 'CPL'].map(h => (
                            <th key={h} className="text-left px-3 py-2 text-xs font-bold uppercase tracking-wider"
                              style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {adsetRows.map(a => (
                          <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--text)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.name}>{a.name}</td>
                            <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.campaign}>{a.campaign}</td>
                            <td className="px-3 py-2.5"><StatusBadge status={a.status} /></td>
                            <td className="px-3 py-2.5 font-semibold" style={{ color: 'var(--text)' }}>{fmt(a.spend)}</td>
                            <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{fmtN(a.impressions)}</td>
                            <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{fmtN(a.clicks)}</td>
                            <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{a.ctr.toFixed(2)}%</td>
                            <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{fmtN(a.leads)}</td>
                            <td className="px-3 py-2.5 font-semibold" style={{ color: a.leads > 0 ? 'var(--teal)' : 'var(--muted)' }}>
                              {a.leads > 0 ? fmt(a.cpl) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Anúncios tab */}
              {tab === 'anuncios' && adRows.length > 0 && (
                <div className="metric-card">
                  <div className="overflow-x-auto" style={{ maxHeight: 520, overflowY: 'auto' }}>
                    <table className="w-full text-sm">
                      <thead style={{ position: 'sticky', top: 0, background: 'var(--card)' }}>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          {['Anúncio', 'Status', 'Investimento', 'Impressões', 'Cliques', 'CTR', 'Leads', 'CPL'].map(h => (
                            <th key={h} className="text-left px-3 py-2 text-xs font-bold uppercase tracking-wider"
                              style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {adRows.map(a => (
                          <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--text)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.name}>{a.name}</td>
                            <td className="px-3 py-2.5"><StatusBadge status={a.status} /></td>
                            <td className="px-3 py-2.5 font-semibold" style={{ color: 'var(--text)' }}>{fmt(a.spend)}</td>
                            <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{fmtN(a.impressions)}</td>
                            <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{fmtN(a.clicks)}</td>
                            <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{a.ctr.toFixed(2)}%</td>
                            <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{fmtN(a.leads)}</td>
                            <td className="px-3 py-2.5 font-semibold" style={{ color: a.leads > 0 ? 'var(--teal)' : 'var(--muted)' }}>
                              {a.leads > 0 ? fmt(a.cpl) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {!loading && tab === 'campanhas' && campaignRows.length === 0 && (
                <div className="metric-card text-center" style={{ padding: 40 }}>
                  <p style={{ color: 'var(--muted)' }}>Nenhuma campanha ativa no período.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
