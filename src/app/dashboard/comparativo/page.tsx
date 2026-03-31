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
      const now = new Date()
      const slots = {}
      for (let m = months - 1; m >= 0; m--) {
        const d = new Date(now.getFullYear(), now.getMonth() - m, 1)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        slots[key] = { month: key, spend: 0, leads: 0, impressions: 0, clicks: 0, frequency: 0, freqCount: 0 }
      }
      const funnel = { topoSpend: 0, topoImpr: 0, meioClicks: 0, meioCtr: 0, fundoLeads: 0, fundoSpend: 0, totalSpend: 0 }
      setMonthlyData(Object.values(slots))
      setFunnelData(funnel)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  return <div>Comparativo</div>
}
