'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error || 'Erro ao criar conta')
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-md mx-4 rounded-2xl p-8 shadow-2xl" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: '#1a3a4a' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#00c4a0" strokeWidth="2"/>
              <circle cx="12" cy="12" r="4" fill="#00c4a0"/>
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text)' }}>Criar conta</h1>
        <p className="text-sm mb-8" style={{ color: 'var(--muted)' }}>Preencha seus dados para criar sua conta</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>Nome</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome" className="input-field" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>E-mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" className="input-field" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>Senha</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" className="input-field" required minLength={8} />
          </div>

          {error && <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-4 py-2">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-2">
            {loading ? 'Criando conta...' : 'Criar conta'}
          </button>
        </form>

        <div className="text-center mt-6">
          <a href="/login" style={{ color: 'var(--teal)' }} className="text-sm font-medium hover:underline">
            Já tem conta? Entrar
          </a>
        </div>
      </div>
    </div>
  (�s

