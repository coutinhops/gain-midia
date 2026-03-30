'use client'
import { useState, useEffect, useRef } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = [
  'Qual conta tem o maior CPC?',
  'Compare o desempenho Meta x Google',
  'Quais campanhas estão com CTR abaixo da média?',
  'Gere um relatório de performance da rede',
]

export default function ChatPage() {
  const [user, setUser] = useState<any>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { fetch('/api/auth/me').then(r => r.json()).then(setUser) }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function sendMessage(text?: string) {
    const msg = text || input.trim()
    if (!msg || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg }),
    })
    const data = await res.json()
    setMessages(prev => [...prev, { role: 'assistant', content: data.reply || data.error || 'Erro ao processar.' }])
    setLoading(false)
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Chat IA</h1>
        {user && (
          <div className="flex items-center gap-3">
            <span className={user.role === 'admin' ? 'badge-admin' : 'badge-viewer'}>{user.role}</span>
            <span className="text-sm" style={{ color: 'var(--text)' }}>{user.name}</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-12 h-12 mb-6" style={{ color: 'var(--teal)' }}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L13.09 8.26L20 9L13.09 9.74L12 16L10.91 9.74L4 9L10.91 8.26L12 2Z"/>
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text)' }}>Como posso ajudar?</h2>
            <p className="text-sm mb-8 text-center max-w-md" style={{ color: 'var(--muted)' }}>
              Analiso campanhas, comparo contas, identifico oportunidades e gero relatórios de marketing.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => sendMessage(s)}
                  className="px-4 py-2 rounded-full text-sm font-medium transition-all"
                  style={{ border: '1px solid var(--border)', color: 'var(--text)', background: 'var(--card)' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--teal)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`mb-4 flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-2xl rounded-2xl px-5 py-3 text-sm"
              style={{
                background: m.role === 'user' ? 'var(--teal)' : 'var(--card)',
                color: m.role === 'user' ? '#000' : 'var(--text)',
                border: m.role === 'assistant' ? '1px solid var(--border)' : 'none',
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap',
              }}>
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start mb-4">
            <div className="rounded-2xl px-5 py-3 text-sm" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
              <span className="animate-pulse">Pensando...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-6 pb-6">
        <div className="flex gap-3" style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--card)', padding: '4px 4px 4px 16px' }}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Digite sua pergunta sobre campanhas, contas ou métricas..."
            className="flex-1 bg-transparent outline-none text-sm py-3"
            style={{ color: 'var(--text)' }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="btn-primary px-4 py-2 rounded-lg disabled:opacity-40"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  )
}
