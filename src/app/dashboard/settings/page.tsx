'use client'
import { useState, useEffect } from 'react'

interface MetaAccount {
  id: string
  name: string
  account_status: number
}

const STATUS_LABEL: Record<number, { label: string; color: string }> = {
  1: { label: 'Ativa',    color: '#00c4a0' },
  2: { label: 'Desativada', color: '#ef4444' },
  3: { label: 'Sem pagamento', color: '#f59e0b' },
  7: { label: 'Encerrada', color: '#6b7280' },
  9: { label: 'Em análise', color: '#7eb8f7' },
  101: { label: 'Pendente', color: '#f59e0b' },
}

export default function SettingsPage() {
  const [user, setUser]                 = useState<any>(null)
  const [metaToken, setMetaToken]       = useState('')
  const [savedToken, setSavedToken]     = useState('')
  const [accounts, setAccounts]         = useState<MetaAccount[]>([])
  const [selected, setSelected]         = useState<string[]>([])
  const [saving, setSaving]             = useState(false)
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [msg, setMsg]                   = useState<{ text: string; ok: boolean } | null>(null)
  const [tokenSaved, setTokenSaved]     = useState(false)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(setUser)
    fetch('/api/user-config').then(r => r.json()).then(cfg => {
      const token = cfg.meta_token || ''
      setMetaToken(token)
      setSavedToken(token)
      setSelected(cfg.meta_account_ids || [])
      setTokenSaved(!!token)
    })
  }, [])

  // ─── Step 1: save token + immediately fetch accounts
  async function handleFetchAccounts() {
    if (!metaToken.trim()) {
      setMsg({ text: 'Cole o access token primeiro.', ok: false })
      return
    }
    setLoadingAccounts(true)
    setMsg(null)

    // Save token first so the proxy can use it
    await fetch('/api/user-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meta_token: metaToken, meta_account_ids: selected }),
    })
    setSavedToken(metaToken)
    setTokenSaved(true)

    // Now fetch real accounts from Meta API
    const res = await fetch('/api/meta/me/adaccounts?fields=id,name,account_status&limit=200')
    const data = await res.json()

    if (data.error) {
      setMsg({ text: `Erro Meta: ${data.error.message}`, ok: false })
      setLoadingAccounts(false)
      return
    }

    const fetched: MetaAccount[] = data.data || []
    setAccounts(fetched)

    if (fetched.length === 0) {
      setMsg({ text: 'Nenhuma conta de anúncio encontrada neste token.', ok: false })
    } else {
      setMsg({ text: `${fetched.length} conta(s) encontrada(s). Selecione as que deseja gerenciar.`, ok: true })
    }
    setLoadingAccounts(false)
  }

  // ─── Step 2: save selected accounts + sync names to DB
  async function handleSave() {
    if (!metaToken.trim()) {
      setMsg({ text: 'Token não pode estar vazio.', ok: false })
      return
    }
    setSaving(true)
    setMsg(null)

    // Send token + selected IDs + account names for DB sync
    const selectedAccounts = accounts.filter(a => selected.includes(a.id))

    const res = await fetch('/api/user-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meta_token: metaToken,
        meta_account_ids: selected,
        accounts: selectedAccounts.map(a => ({ id: a.id, name: a.name })),
      }),
    })

    if (res.ok) {
      setSavedToken(metaToken)
      setTokenSaved(true)
      setMsg({ text: `✓ Configuração salva! ${selected.length} conta(s) ativa(s).`, ok: true })
    } else {
      setMsg({ text: 'Erro ao salvar. Tente novamente.', ok: false })
    }
    setSaving(false)
  }

  function toggleAccount(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function selectAll() {
    setSelected(accounts.map(a => a.id))
  }

  const tokenChanged = metaToken !== savedToken

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Configurações</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            Conecte suas contas de anúncios para ativar todos os painéis
          </p>
        </div>
        {user && (
          <div className="flex items-center gap-3">
            <span className={user.role === 'admin' ? 'badge-admin' : 'badge-viewer'}>{user.role}</span>
            <span className="text-sm" style={{ color: 'var(--text)' }}>{user.name}</span>
          </div>
        )}
      </div>

      <div className="p-6 space-y-6" style={{ maxWidth: 760 }}>

        {/* ── Meta Ads ───────────────────────────────────── */}
        <div className="metric-card">
          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-lg" style={{ background: '#1877f2' }}>
              f
            </div>
            <div>
              <h2 className="font-bold" style={{ color: 'var(--text)' }}>Meta Ads</h2>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Marketing API v19.0 — token de usuário ou sistema
              </p>
            </div>
            {tokenSaved && !tokenChanged && (
              <span className="ml-auto text-xs px-3 py-1 rounded-full font-bold"
                style={{ background: 'rgba(0,196,160,0.12)', color: 'var(--teal)' }}>
                 ✓ CONECTADO
              </span>
              )}
          </div>

          {/* How to get token */}
          <div className="mb-5 p-4 rounded-xl text-xs space-y-1.5" style={{ background: 'var(--active)', border: '1px solid var(--border)' }}>
            <p className="font-bold" style={{ color: 'var(--text)' }}>Como obter o Access Token:</p>
            <p style={{ color: 'var(--muted)' }}>1. Acesse <a href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noopener" style={{ color: 'var(--teal)' }}>developers.facebook.com/tools/explorer</a></p>
            <p style={{ color: 'var(--muted)' }}>2. Selecione seu App → clique em "Gerar token"</p>
            <p style={{ color: 'var(--muted)' }}>3. Adicione as permissões: <code style={{ color: 'var(--teal)' }}>ads_read</code>, <code style={{ color: 'var(--teal)' }}>ads_management</code>, <code style={{ color: 'var(--teal)' }}>read_insights</code></p>
            <p style={{ color: 'var(--muted)' }}>4. Copie o token gerado e cole abaixo</p>
            <p style={{ color: '#f59e0b' }}>⚠ Para produção use um token de sistema (System User Token) — não expira.</p>
          </div>

          {/* Token input */}
          <div className="mb-4">
            <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
              Access Token
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={metaToken}
                onChange={e => { setMetaToken(e.target.value); setMsg(null) }}
                placeholder="EAAxxxxxxxxxxxxxxxxxxxxxxx..."
                className="input-field flex-1 font-mono text-sm"
                style={{ letterSpacing: metaToken ? '0.02em' : undefined }}
              />
              {tokenChanged && metaToken && (
                <div className="flex items-center" title="Token alterado — salve para aplicar">
                  <span style={{ color: '#f59e0b', fontSize: 18 }}>●</span>
                </div>
              )}
            </div>
          </div>

          {/* Fetch accounts button */}
          <div className="flex items-center gap-3 mb-5">
            <button
              onClick={handleFetchAccounts}
              disabled={!metaToken.trim() || loadingAccounts}
              className="btn-primary text-sm"
              style={{ opacity: !metaToken.trim() ? 0.5 : 1 }}
            >
              {loadingAccounts ? '⏳ Carregando contas...' : '🔍 Ler contas da Meta'}
            </button>
            {tokenSaved && !tokenChanged && (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Token salvo · {accounts.length > 0 ? `${accounts.length} contas carregadas` : 'clique para carregar contas'}</p>
            )}
          </div>

          {/* Account list */}
          {accounts.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                  Contas encontradas — selecione as que deseja gerenciar
                </label>
                <div className="flex gap-2">
                  <button onClick={selectAll} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--active)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                    Todas
                  </button>
                  <button onClick={() => setSelected([])} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--active)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                    Nenhuma
                  </button>
                </div>
              </div>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {accounts.map((a, i) => {
                  const st = STATUS_LABEL[a.account_status] || { label: `Status ${a.account_status}`, color: 'var(--muted)' }
                  const isSelected = selected.includes(a.id)
                  return (
                    <label
                      key={a.id}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                      style={{
                        borderBottom: i < accounts.length - 1 ? '1px solid var(--border)' : 'none',
                        background: isSelected ? 'rgba(0,196,160,0.05)' : undefined,
                        transition: 'background 0.1s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleAccount(a.id)}
                        style={{ accentColor: '#00c4a0', width: 16, height: 16 }}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{a.name}</p>
                        <p className="text-xs font-mono" style={{ color: 'var(--muted)' }}>{a.id}</p>
                      </div>
                      <span className="text-xs font-bold" style={{ color: st.color }}>{st.label}</span>
                    </label>
                  )
                })}
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
                {selected.length} de {accounts.length} selecionadas
              </p>
            </div>
          )}

          {/* Feedback message */}
          {msg && (
            <div className="mb-4 p-3 rounded-lg text-sm" style={{
              background: msg.ok ? 'rgba(0,196,160,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${msg.ok ? 'rgba(0,196,160,0.3)' : 'rgba(239,68,68,0.3)'}`,
              color: msg.ok ? 'var(--teal)' : '#ef4444',
            }}>
              {msg.text}
            </div>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving || !metaToken.trim()}
            className="btn-primary"
            style={{ opacity: !metaToken.trim() ? 0.5 : 1 }}
          >
            {saving ? 'Salvando...' : 'Salvar configuração'}
          </button>
        </div>

        {/* ── Google Ads ─────────────────────────────────── */}
        <div className="metric-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-lg" style={{ background: '#4285f4' }}>
              G
            </div>
            <div>
              <h2 className="font-bold" style={{ color: 'var(--text)' }}>Google Ads</h2>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Configurado via variáveis de ambiente no servidor</p>
            </div>
          </div>

          <div className="text-xs mb-4 p-4 rounded-xl space-y-1.5" style={{ background: 'var(--active)', border: '1px solid var(--border)' }}>
            <p className="font-bold" style={{ color: 'var(--text)' }}>Configure no arquivo <code style={{ color: 'var(--teal)' }}>.env.local</code>:</p>
            {[
              ['GADS_CLIENT_ID', 'OAuth2 Client ID (Google Cloud Console)'],
              ['GADS_CLIENT_SECRET', 'OAuth2 Client Secret'],
              ['GADS_REFRESH_TOKEN', 'Refresh Token do OAuth2 Playground'],
              ['GADS_DEV_TOKEN', 'Developer Token (Google Ads API Center)'],
              ['GADS_MCC_ID', 'ID da conta MCC (gerenciadora)'],
            ].map(([key, desc]) => (
              <div key={key} className="flex gap-2">
                <code style={{ color: 'var(--teal)', minWidth: 200 }}>{key}=</code>
                <span style={{ color: 'var(--muted)' }}>{desc}</span>
              </div>
            ))}
          </div>

          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            O token OAuth2 é renovado automaticamente a cada requisição usando o refresh token.
          </p>
        </div>

        {/* ── OpenAI (Chat IA) ────────────────────────────── */}
        <div className="metric-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-sm" style={{ background: '#10a37f' }}>
              AI
            </div>
            <div>
              <h2 className="font-bold" style={{ color: 'var(--text)' }}>Chat IA</h2>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>GPT-4o-mini via variável de ambiente</p>
            </div>
          </div>
          <div className="text-xs p-4 rounded-xl" style={{ background: 'var(--active)', border: '1px solid var(--border)' }}>
            <p className="font-bold mb-1" style={{ color: 'var(--text)' }}>Configure no <code style={{ color: 'var(--teal)' }}>.env.local</code>:</p>
            <code style={{ color: 'var(--teal)' }}>OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx</code>
          </div>
        </div>
      </div>
    </div>
  )
}
