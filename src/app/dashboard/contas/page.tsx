'use client'
import { useState, useEffect } from 'react'
import PeriodFilter from '@/components/PeriodFilter'
import ErrorCard from '@/components/ErrorCard'

export default function ContasPage() {
  const [period, setPeriod] = useState('last_7d')
  const [user, setUser] = useState<any>(null)
  const [data, setData] = useState<any[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetch('/api/auth/me').then(r => r.json()).then(setUser) }, [])
  useEffect(() => { loadData() }, [period])

  async function loadData() {
    setLoading(true); setError('')
    const cfg = await fetch('/api/user-config').then(r => r.json())
    if (!cfg.meta_token) { setError('Token Meta não configurado em Configurações.'); setLoading(false); return }

    const fields = 'account_id,account_name,campaign_id,campaign_name,objective,spend,impressions,clicks,ctr,cpm,cpc,reach,frequency,actions,cost_per_action_type'
    const results: any[] = []
    for (const id of (cfg.meta_account_ids || [])) {
      const res = await fetch(`/api/meta/${id}/insights?fields=${fields}&level=campaign&limit=200&date_preset=${period}`)
      const json = await res.json()
      results.push(...(json.data || []))
    }
    setData(results)
    setLoading(false)
  }

  const fmt = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
  const fmtN = (n: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(n)

  const cols = [
    { key: 'account_name', label: 'Conta' },
    { key: 'campaign_name', label: 'Campanha' },
    { key: 'spend', label: 'Investimento', render: (v: string) => fmt(parseFloat(v || '0')) },
    { key: 'impressions', label: 'Impressões', render: (v: string) => fmtN(parseInt(v || '0')) },
    { key: 'clicks', label: 'Cliques', render: (v: string) => fmtN(parseInt(v || '0')) },
    { key: 'ctr', label: 'CTR', render: (v: string) => `${parseFloat(v || '0').toFixed(2)}%` },
    { key: 'cpc', label: 'CPC', render: (v: string) => fmt(parseFloat(v || '0')) },
    { key: 'cpm', label: 'CPM', render: (v: string) => fmt(parseFloat(v || '0')) },
    { key: 'reach', label: 'Alcance', render: (v: string) => fmtN(parseInt(v || '0')) },
  ]

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Todas as Contas</h1>
        {user && (
          <div className="flex items-center gap-3">
            <span className={user.role === 'admin' ? 'badge-admin' : 'badge-viewer'}>{user.role}</span>
            <span className="text-sm" style={{ color: 'var(--text)' }}>{user.name}</span>
          </div>
        )}
      </div>
      <PeriodFilter value={period} onChange={setPeriod} />

      <div className="p-6">
        <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text)' }}>Visão geral por campanha</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>Todas as campanhas ativas de todas as contas Meta gerenciadas.</p>

        {loading && <div className="error-card"><p className="text-sm animate-pulse" style={{ color: 'var(--muted)' }}>Carregando campanhas...</p></div>}
        {!loading && error && <ErrorCard title="Erro ao carregar contas" message={error} />}

        {!loading && data.length > 0 && (
          <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
                  {cols.map(c => (
                    <th key={c.key} className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i} className="transition-colors" style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--active)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    {cols.map(c => (
                      <td key={c.key} className="px-4 py-3" style={{ color: 'var(--text)' }}>
                        {c.render ? c.render(row[c.key]) : row[c.key] || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
