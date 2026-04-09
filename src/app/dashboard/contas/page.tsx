'use client'
import { useState, useEffect } from 'react'
import PeriodFilter from '@/components/PeriodFilter'
import ErrorCard from '@/components/ErrorCard'
import { countLeads, countLeadForms, countConversations } from '@/lib/meta'

export default function ContasPage() {
  const [period, setPeriod] = useState('last_7d')
  const [user, setUser] = useState<any>(null)
  const [data, setData] = useState<any[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [totalAccounts, setTotalAccounts] = useState(0)

  useEffect(() => { fetch('/api/auth/me').then(r => r.json()).then(setUser) }, [])
  useEffect(() => { loadData() }, [period])

  async function loadData() {
    setLoading(true); setError('')
    const cfg = await fetch('/api/user-config').then(r => r.json())
    if (!cfg.meta_token) { setError('Token Meta não configurado em Configurações.'); setLoading(false); return }

    // Get all accounts — prefer cfg.accounts, auto-discover if empty
    let cfgAccounts: Array<{id: string; name: string}> = cfg.accounts || []
    if (cfgAccounts.length === 0) {
      try {
        const adData = await fetch('/api/meta/me/adaccounts?fields=id,name&limit=500').then(r => r.json())
        if (adData?.data?.length > 0) cfgAccounts = adData.data.map((a: any) => ({ id: a.id, name: a.name }))
        else cfgAccounts = (cfg.meta_account_ids || []).map((id: string) => ({ id, name: id }))
      } catch { cfgAccounts = (cfg.meta_account_ids || []).map((id: string) => ({ id, name: id })) }
    }
    setTotalAccounts(cfgAccounts.length)

    const fields = 'account_id,account_name,campaign_id,campaign_name,objective,spend,impressions,clicks,reach,frequency,actions,cost_per_action_type'

    // Parallel fetch — one request per account
    const allResults = await Promise.all(
      cfgAccounts.map(async (acct: {id: string; name: string}) => {
        try {
          const json = await fetch(
            `/api/meta/${acct.id}/insights?fields=${fields}&level=campaign&limit=200&date_preset=${period}`
          ).then(r => r.json())
          return (json.data || []).map((row: any) => ({
            ...row,
            account_name: row.account_name || acct.name,
            _leads: countLeads(row.actions || []),
            _leadForms: countLeadForms(row.actions || []),
            _conversations: countConversations(row.actions || []),
          }))
        } catch { return [] }
      })
    )
    setData(allResults.flat())
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
    { key: '_leadForms', label: 'Cadastros', render: (v: any) => fmtN(Number(v) || 0) },
    { key: '_conversations', label: 'Conversas', render: (v: any) => fmtN(Number(v) || 0) },
    { key: 'spend', label: 'CPL Cadastro', render: (_v: string, row: any) => {
        const leads = Number(row._leadForms) || 0
        const spend = parseFloat(row.spend || '0')
        return leads > 0 ? fmt(spend / leads) : '—'
      }
    },
    { key: 'spend', label: 'CPL Conversa', render: (_v: string, row: any) => {
        const leads = Number(row._conversations) || 0
        const spend = parseFloat(row.spend || '0')
        return leads > 0 ? fmt(spend / leads) : '—'
      }
    },
    { key: 'reach', label: 'Alcance', render: (v: string) => fmtN(parseInt(v || '0')) },
    { key: 'cpm', label: 'CPM', render: (v: string) => fmt(parseFloat(v || '0')) },
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
                        {c.render ? c.render(row[c.key], row) : row[c.key] || '-'}
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
