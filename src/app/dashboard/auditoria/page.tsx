'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import PeriodFilter from '@/components/PeriodFilter'
import ErrorCard from '@/components/ErrorCard'
import {
  PLANS, PlanKey, BENCHMARKS,
  countLeads, calcMetrics,
  scoreTone, benchmarkCheck, calcAuditScore, auditScoreLabel,
  formatCurrency, formatNumber,
  AUDIT_WEIGHTS, classifyObjective,
} from '@/lib/meta'

// ─── Types ───────────────────────────────────────────────────────────────────
type Zone = 'winner' | 'potencial' | 'investigate' | 'kill' | 'other'
type BenchTone = 'ok' | 'warn' | 'bad'

interface AuditItem {
  label: string
  tone: BenchTone
  detail: string
  weight: number
  score: number
}

interface CreativeAd {
  ad_id: string
  ad_name: string
  campaignName: string
  adsetName: string
  spend: number
  leads: number
  ctr: number
  cpl: number
  zone: Zone
  reason: string
  creativeType: 'video' | 'imagem' | 'carrossel' | 'outro'
  thumbnailUrl: string | null
  image_url: string | null
}

interface AdsetSegment {
  adset_id: string
  adsetName: string
  campaignName: string
  status: string
  spend: number
  leads: number
  audienceType: string
  ageGender: string
  locations: string
  segmentation: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function classifyAudienceType(targeting: any): string {
  if (!targeting) return 'Amplo'
  if (targeting.advantage_audience || targeting.targeting_automation) return 'Advantage+'
  if ((targeting.lookalike_specs || []).length > 0) return 'Lookalike'
  if ((targeting.custom_audiences || []).length > 0) return 'Personalizado'
  if (targeting.flexible_spec?.[0]?.interests || targeting.flexible_spec?.[0]?.behaviors) return 'Interesses'
  return 'Amplo'
}

function extractAgeGender(targeting: any): string {
  if (!targeting) return '—'
  const parts: string[] = []
  if (targeting.age_min || targeting.age_max) {
    parts.push(`${targeting.age_min || 18}–${targeting.age_max || '65+'}`)
  }
  if (targeting.genders) {
    const g = Array.isArray(targeting.genders) ? targeting.genders : []
    if (g.includes(1) && !g.includes(2)) parts.push('Masc')
    else if (g.includes(2) && !g.includes(1)) parts.push('Fem')
    else parts.push('Todos')
  }
  return parts.join(' · ') || '—'
}

function extractLocations(targeting: any): string {
  if (!targeting?.geo_locations) return '—'
  const gl = targeting.geo_locations
  const parts: string[] = []
  if (gl.cities?.length) {
    const city = gl.cities[0]
    const radius = city.radius ? ` +${city.radius}${city.distance_unit === 'mile' ? 'mi' : 'km'}` : ''
    parts.push(`${city.name || city.key}${radius}` + (gl.cities.length > 1 ? ` +${gl.cities.length - 1}` : ''))
  } else if (gl.regions?.length) {
    parts.push(gl.regions[0].name + (gl.regions.length > 1 ? ` +${gl.regions.length - 1}` : ''))
  } else if (gl.zips?.length) {
    parts.push(`CEP: ${gl.zips.slice(0, 2).map((z: any) => z.key).join(', ')}`)
  } else if (gl.countries?.length) {
    parts.push(gl.countries.includes('BR') ? 'Brasil' : gl.countries.join(', '))
  }
  return parts.join(' · ') || '—'
}

function classifyCreativeType(creative: any): 'video' | 'imagem' | 'carrossel' | 'outro' {
  if (!creative) return 'outro'
  const obj = (creative.object_type || '').toUpperCase()
  if (obj === 'VIDEO' || creative.video_id) return 'video'
  if (obj === 'IMAGE' || creative.image_url) return 'imagem'
  if (obj.includes('CAROUSEL')) return 'carrossel'
  return 'outro'
}

function buildAdReason(zone: Zone, ctr: number, cpl: number, spend: number): string {
  const fmtCtr = ctr.toFixed(1) + '%'
  const fmtCpl = 'R$ ' + cpl.toFixed(0)
  const fmtSpend = 'R$ ' + spend.toFixed(0)
  switch (zone) {
    case 'winner':     return `CTR ${fmtCtr} positivo com CPL ${fmtCpl} dentro da meta — escalar com segurança`
    case 'potencial':  return `CTR ${fmtCtr} positivo com CPL ${fmtCpl} próximo da meta — otimizar pós-clique`
    case 'investigate':return `CTR ${fmtCtr} saudável mas CPL ${fmtCpl} acima da meta — revisar página/formulário`
    case 'kill':       return `CTR baixo com ${fmtSpend} investidos — pouca resposta, candidato à pausa`
    default:           return `Dados insuficientes no período — CTR ${fmtCtr}, CPL ${fmtCpl}`
  }
}

function classifyAdZone(ctr: number, cpl: number, spend: number, cplTarget: number): Zone {
  if (ctr >= 2 && cpl <= cplTarget)           return 'winner'
  if (ctr >= 1.5 && cpl <= cplTarget * 1.2)   return 'potencial'
  if (ctr >= 1.2)                              return 'investigate'
  if (spend >= 2)                              return 'kill'
  return 'other'
}

const ZONE_CONFIG = {
  winner:     { label: 'Winner',    emoji: '🏆', color: '#00c4a0' },
  potencial:  { label: 'Potencial', emoji: '📈', color: '#7eb8f7' },
  investigate:{ label: 'Investigar',emoji: '🔍', color: '#f59e0b' },
  kill:       { label: 'Kill',      emoji: '🔴', color: '#ef4444' },
  other:      { label: 'Em análise',emoji: '⏳', color: '#6b7280' },
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function AuditoriaPage() {
  const [period, setPeriod]       = useState('last_30d')
  const [plan, setPlan]           = useState<PlanKey>('smart')
  const [cplTarget, setCplTarget] = useState(60)
  const [accounts, setAccounts]   = useState<any[]>([])
  const [selectedAcc, setSelectedAcc] = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [rawData, setRawData]     = useState<any>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [previewAd, setPreviewAd] = useState<CreativeAd | null>(null)
  const timerRef = useRef<any>(null)

  useEffect(() => { setCplTarget(PLANS[plan].cplRef) }, [plan])

  useEffect(() => {
    fetch('/api/user-config').then(r => r.json()).then(cfg => {
      setAccounts(cfg.accounts || [])
      if (cfg.accounts?.[0]) setSelectedAcc(cfg.accounts[0].id)
    })
  }, [])

  useEffect(() => {
    if (!selectedAcc) return
    runAudit()
  }, [selectedAcc, period, refreshKey])

  async function runAudit() {
    setLoading(true); setError(''); setRawData(null); setElapsedMs(0)
    const start = Date.now()
    timerRef.current = setInterval(() => setElapsedMs(Date.now() - start), 100)

    const cfg = await fetch('/api/user-config').then(r => r.json())
    if (!cfg.meta_token) {
      setError('Token Meta não configurado. Acesse Configurações.')
      clearInterval(timerRef.current); setLoading(false); return
    }

    try {
      const baseFields = 'spend,impressions,clicks,reach,frequency,actions,cost_per_action_type'

      // ── 6 parallel calls: 4 insight levels + 2 entity levels ──────────────
      const [
        accountInsights,
        campaignInsightsRaw,
        adsetInsightsRaw,
        adInsightsRaw,
        adsetEntitiesRaw,
        adEntitiesRaw,
      ] = await Promise.all([
        // Insights (performance)
        fetch(`/api/meta/${selectedAcc}/insights?fields=${baseFields}&level=account&date_preset=${period}`).then(r => r.json()),
        fetch(`/api/meta/${selectedAcc}/insights?fields=campaign_id,campaign_name,objective,${baseFields}&level=campaign&limit=200&date_preset=${period}`).then(r => r.json()),
        fetch(`/api/meta/${selectedAcc}/insights?fields=adset_id,adset_name,campaign_id,campaign_name,${baseFields}&level=adset&limit=200&date_preset=${period}`).then(r => r.json()),
        fetch(`/api/meta/${selectedAcc}/insights?fields=ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,${baseFields}&level=ad&limit=500&date_preset=${period}`).then(r => r.json()),
        // Entities (structure — targeting + creatives)
        fetch(`/api/meta/${selectedAcc}/adsets?fields=id,name,status,effective_status,campaign_id,targeting&limit=200`).then(r => r.json()),
        fetch(`/api/meta/${selectedAcc}/ads?fields=id,name,status,effective_status,adset_id,campaign_id,creative{thumbnail_url,image_url,object_type,video_id}&limit=500`).then(r => r.json()),
      ])

      clearInterval(timerRef.current)
      setRawData({ accountInsights, campaignInsightsRaw, adsetInsightsRaw, adInsightsRaw, adsetEntitiesRaw, adEntitiesRaw })
    } catch (e: any) {
      clearInterval(timerRef.current)
      setError(e.message || 'Erro ao carregar dados da auditoria.')
    }
    setLoading(false)
  }

  // ─── Main audit computation ───────────────────────────────────────────────
  const audit = useMemo(() => {
    if (!rawData) return null
    const cfg = PLANS[plan]

    const accountRow = rawData.accountInsights?.data?.[0] || {}
    const campaigns  = rawData.campaignInsightsRaw?.data  || []
    const adsetIns   = rawData.adsetInsightsRaw?.data     || []
    const adIns      = rawData.adInsightsRaw?.data        || []
    const adsetEnts  = rawData.adsetEntitiesRaw?.data     || []
    const adEnts     = rawData.adEntitiesRaw?.data        || []

    // ── Index entities by ID for fast lookup
    const adsetEntityMap = new Map(adsetEnts.map((a: any) => [a.id, a]))
    const adEntityMap    = new Map(adEnts.map((a: any) => [a.id, a]))

    // ── Account-level metrics
    const spend       = parseFloat(accountRow.spend || '0')
    const impressions = parseInt(accountRow.impressions || '0')
    const clicks      = parseInt(accountRow.clicks || '0')
    const reach       = parseInt(accountRow.reach || '0')
    const frequency   = parseFloat(accountRow.frequency || '0')
    const leads       = countLeads(accountRow.actions || [])
    const metrics     = calcMetrics({ spend, impressions, clicks, reach, frequency, leads })

    // ──────────────────────────────────────────────────────────────────────────
    // STRUCTURAL CHECKS
    // ──────────────────────────────────────────────────────────────────────────

    // 1. Volume ativo (weight 15)
    const activeCampaigns = campaigns.length
    const activeAdsets    = adsetIns.length
    const activeAds       = adIns.length
    const volScore = activeCampaigns > 0 && activeAdsets > 0 && activeAds > 0
      ? (activeCampaigns <= 8 ? 100 : 60) : 40
    const volItem: AuditItem = {
      label: 'Volume estrutural ativo',
      tone: scoreTone(volScore),
      detail: `${activeCampaigns} campanha(s) · ${activeAdsets} conjunto(s) · ${activeAds} anúncio(s) ativo(s)`,
      weight: AUDIT_WEIGHTS.activeVolume,
      score: volScore,
    }

    // 2. Objetivos de campanha (weight 20)
    const objTypes   = campaigns.map((c: any) => classifyObjective(c.objective))
    const hasFundo   = objTypes.includes('fundo')
    const hasTopo    = objTypes.includes('topo')
    const objScore   = hasFundo ? (hasTopo ? 100 : 80) : 40
    const objDetail  = campaigns.map((c: any) => c.objective).filter(Boolean).join(', ') || '—'
    const objItem: AuditItem = {
      label: 'Objetivos de campanha',
      tone: scoreTone(objScore),
      detail: hasFundo
        ? (hasTopo ? `Funil completo: topo + conversão ✓ (${objDetail})` : `Foco em leads sem topo complementar (${objDetail})`)
        : `Sem objetivo de geração de leads (${objDetail})`,
      weight: AUDIT_WEIGHTS.objectives,
      score: objScore,
    }

    // 3. Conjuntos zumbi (weight 15) — cruzamento adsetInsights × entities
    const zombieAdsets = adsetIns.filter((a: any) => {
      const s = parseFloat(a.spend || '0')
      const l = countLeads(a.actions || [])
      return s > 0 && l === 0
    })
    const zombiePct  = adsetIns.length > 0 ? zombieAdsets.length / adsetIns.length : 0
    const zombieScore = zombiePct === 0 ? 100 : zombiePct < 0.3 ? 70 : 40
    const zombieItem: AuditItem = {
      label: 'Conjuntos zumbi (gasto sem leads)',
      tone: scoreTone(zombieScore),
      detail: zombieAdsets.length === 0
        ? 'Todos os conjuntos com gasto geraram leads ✓'
        : `${zombieAdsets.length} conjunto(s) gastaram dinheiro sem gerar nenhum lead — candidatos imediatos à pausa`,
      weight: AUDIT_WEIGHTS.zombieAdsets,
      score: zombieScore,
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PERFORMANCE BENCHMARKS
    // ──────────────────────────────────────────────────────────────────────────
    const tone2score = (t: BenchTone) => t === 'ok' ? 100 : t === 'warn' ? 60 : 20

    const cpmTone  = benchmarkCheck(metrics.cpm,       BENCHMARKS.cpm.min,       BENCHMARKS.cpm.max)
    const ctrTone  = benchmarkCheck(metrics.ctr,       BENCHMARKS.ctr.min,       BENCHMARKS.ctr.max)
    const cpcTone  = benchmarkCheck(metrics.cpc,       BENCHMARKS.cpc.min,       BENCHMARKS.cpc.max)
    const freqTone = benchmarkCheck(metrics.frequency, BENCHMARKS.frequency.min, BENCHMARKS.frequency.max)
    const cplDelta = metrics.cpl > 0 && cplTarget > 0 ? (metrics.cpl - cplTarget) / cplTarget : -1
    const cplScore = metrics.cpl <= cplTarget ? 100 : cplDelta <= 0.3 ? 70 : 40
    const cplTone  = scoreTone(cplScore) as BenchTone

    const perfItems: AuditItem[] = [
      { label: 'CPM',              tone: cpmTone,  detail: `R$ ${metrics.cpm.toFixed(2)} · ref R$ ${BENCHMARKS.cpm.min}–R$ ${BENCHMARKS.cpm.max}`,                  weight: AUDIT_WEIGHTS.cpm,       score: tone2score(cpmTone)  },
      { label: 'CTR',              tone: ctrTone,  detail: `${metrics.ctr.toFixed(2)}% · ref ${BENCHMARKS.ctr.min}–${BENCHMARKS.ctr.max}%`,                         weight: AUDIT_WEIGHTS.ctr,       score: tone2score(ctrTone)  },
      { label: 'CPC',              tone: cpcTone,  detail: `R$ ${metrics.cpc.toFixed(2)} · ref R$ ${BENCHMARKS.cpc.min}–R$ ${BENCHMARKS.cpc.max}`,                  weight: AUDIT_WEIGHTS.cpc,       score: tone2score(cpcTone)  },
      { label: 'CPL vs meta',      tone: cplTone,  detail: `R$ ${metrics.cpl.toFixed(2)} · meta R$ ${cplTarget} (plano ${plan}) · ${cplDelta > 0 ? '+' : ''}${(cplDelta*100).toFixed(0)}%`, weight: AUDIT_WEIGHTS.cpl, score: cplScore },
      { label: 'Frequência',       tone: freqTone, detail: `${metrics.frequency.toFixed(2)}x · ref ${BENCHMARKS.frequency.min}–${BENCHMARKS.frequency.max}x`,       weight: AUDIT_WEIGHTS.frequency, score: tone2score(freqTone) },
    ]

    const structItems = [volItem, objItem, zombieItem]
    const weighted = (items: AuditItem[]) =>
      Math.round(items.reduce((s, i) => s + i.score * i.weight, 0) / items.reduce((s, i) => s + i.weight, 0))

    const structScore = weighted(structItems)
    const perfScore   = weighted(perfItems)
    const finalScore  = calcAuditScore(structScore, perfScore)

    // ──────────────────────────────────────────────────────────────────────────
    // CREATIVE LAYER — cruzamento adEntities × adInsights
    // ──────────────────────────────────────────────────────────────────────────
    const creativeAds: CreativeAd[] = adIns.map((ins: any) => {
      const ent      = adEntityMap.get(ins.ad_id) as any
      const creative = ent?.creative || null
      const adSpend  = parseFloat(ins.spend || '0')
      const adImpr   = parseInt(ins.impressions || '0')
      const adClicks = parseInt(ins.clicks || '0')
      const adLeads  = countLeads(ins.actions || [])
      const adCtr    = adImpr > 0 ? adClicks / adImpr * 100 : 0
      const adCpl    = adLeads > 0 ? adSpend / adLeads : 9999

      const zone = classifyAdZone(adCtr, adCpl, adSpend, cplTarget)
      return {
        ad_id: ins.ad_id,
        ad_name: ins.ad_name || ent?.name || ins.ad_id,
        campaignName: ins.campaign_name || '—',
        adsetName: ins.adset_name || '—',
        spend: adSpend,
        leads: adLeads,
        ctr: adCtr,
        cpl: adCpl < 9999 ? adCpl : 0,
        zone,
        reason: buildAdReason(zone, adCtr, adCpl < 9999 ? adCpl : 0, adSpend),
        creativeType: classifyCreativeType(creative),
        thumbnailUrl: creative?.thumbnail_url || null,
        image_url: creative?.image_url || null,
      }
    })

    const creativeZones: Record<Zone, CreativeAd[]> = {
      winner: [], potencial: [], investigate: [], kill: [], other: [],
    }
    creativeAds.forEach(ad => creativeZones[ad.zone].push(ad))

    // Creative type distribution
    const creativeTypeCounts = creativeAds.reduce((acc: any, ad) => {
      acc[ad.creativeType] = (acc[ad.creativeType] || 0) + 1
      return acc
    }, {})

    // ──────────────────────────────────────────────────────────────────────────
    // SEGMENTATION LAYER — cruzamento adsetEntities × adsetInsights
    // ──────────────────────────────────────────────────────────────────────────
    const adsetSegments: AdsetSegment[] = adsetIns.map((ins: any) => {
      const ent = adsetEntityMap.get(ins.adset_id) as any
      const targeting = ent?.targeting || null
      return {
        adset_id: ins.adset_id,
        adsetName: ins.adset_name || ent?.name || ins.adset_id,
        campaignName: ins.campaign_name || '—',
        status: ent?.effective_status || ent?.status || 'ACTIVE',
        spend: parseFloat(ins.spend || '0'),
        leads: countLeads(ins.actions || []),
        audienceType: classifyAudienceType(targeting),
        ageGender: extractAgeGender(targeting),
        locations: extractLocations(targeting),
        segmentation: targeting ? JSON.stringify(targeting).length > 10 ? 'detalhada' : 'ampla' : 'ampla',
      }
    })

    // Audience type share (by spend)
    const totalAdsetSpend = adsetSegments.reduce((s, a) => s + a.spend, 0)
    const audienceShareMap: Record<string, { spend: number; count: number }> = {}
    adsetSegments.forEach(a => {
      if (!audienceShareMap[a.audienceType]) audienceShareMap[a.audienceType] = { spend: 0, count: 0 }
      audienceShareMap[a.audienceType].spend += a.spend
      audienceShareMap[a.audienceType].count += 1
    })
    const audienceShares = Object.entries(audienceShareMap).map(([type, d]) => ({
      type,
      count: d.count,
      share: totalAdsetSpend > 0 ? d.spend / totalAdsetSpend * 100 : 0,
      spend: d.spend,
    })).sort((a, b) => b.share - a.share)

    // ──────────────────────────────────────────────────────────────────────────
    // BUDGET DISTRIBUTION
    // ──────────────────────────────────────────────────────────────────────────
    const topoSpend  = campaigns.filter((c: any) => classifyObjective(c.objective) === 'topo').reduce((s: number, c: any) => s + parseFloat(c.spend || '0'), 0)
    const fundoSpend = campaigns.filter((c: any) => classifyObjective(c.objective) === 'fundo').reduce((s: number, c: any) => s + parseFloat(c.spend || '0'), 0)
    const budgetOk   = cfg.fundoRef > 0 ? Math.abs(fundoSpend - cfg.fundoRef) / cfg.fundoRef < 0.3 : true

    // ──────────────────────────────────────────────────────────────────────────
    // FIX LIST
    // ──────────────────────────────────────────────────────────────────────────
    const fixes: string[] = []
    if (cpmTone  === 'bad')         fixes.push('Ampliar segmentação para reduzir CPM até R$ 35')
    if (ctrTone  === 'bad')         fixes.push('Testar novos hooks/criativos — CTR abaixo de 1.2%')
    if (cplTone  === 'bad')         fixes.push(`Revisar landing page e formulário — CPL ${formatCurrency(metrics.cpl)} vs meta R$ ${cplTarget}`)
    if (freqTone === 'bad')         fixes.push('Renovar biblioteca de criativos — frequência acima de 3.5x')
    if (zombieAdsets.length > 0)    fixes.push(`Pausar ${zombieAdsets.length} conjunto(s) zumbi para liberar verba`)
    if (creativeZones.kill.length > 0) fixes.push(`Pausar ${creativeZones.kill.length} anúncio(s) na Kill List (CTR baixo)`)
    if (!hasFundo)                  fixes.push('Criar campanha com objetivo de Geração de Leads ou Conversão')
    if (!budgetOk)                  fixes.push(`Rebalancear investimento: fundo precisa de ~R$ ${cfg.fundoRef} (80% do plano)`)
    if (campaigns.some((c: any) => !/(FUNIL|TOPO|MEIO|FUNDO|LEAD|CONV|ALCANCE)/i.test(c.campaign_name || '')))
      fixes.push('Renomear campanhas fora do padrão de taxonomia (FUNIL_CANAL_REDE_OBJETIVO)')

    return {
      metrics, structScore, perfScore, finalScore,
      structItems, perfItems,
      creativeAds, creativeZones, creativeTypeCounts,
      adsetSegments, audienceShares, totalAdsetSpend,
      topoSpend, fundoSpend, budgetOk,
      zombieAdsets, fixes,
    }
  }, [rawData, plan, cplTarget])

  // ─── UI Helpers ───────────────────────────────────────────────────────────
  const fmt  = formatCurrency
  const fmtN = (n: number) => formatNumber(n, 0)
  const toneColor = (t: string) => t === 'ok' ? 'var(--teal)' : t === 'warn' ? '#f59e0b' : '#ef4444'
  const toneBg    = (t: string) => t === 'ok' ? 'rgba(0,196,160,0.08)' : t === 'warn' ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)'

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Auditoria estrutural da unidade</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            Diagnóstico fiel ao legado, cruzando estrutura, criativos, segmentação e performance da Meta API
          </p>
        </div>
        <button onClick={() => setRefreshKey(k => k + 1)} className="text-xs px-3 py-1.5 rounded-md"
          style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}>
          ↻ Atualizar
        </button>
      </div>

      <PeriodFilter value={period} onChange={setPeriod} />

      <div className="p-6 space-y-6">
        {/* Controls */}
        <div className="metric-card">
          <p className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--muted)' }}>Filtros da auditoria</p>
          <div className="flex flex-wrap gap-5">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Unidade</label>
              <select value={selectedAcc} onChange={e => setSelectedAcc(e.target.value)} className="input-field text-sm" style={{ minWidth: 200 }}>
                {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
                {accounts.length === 0 && <option value="">— configure em Configurações —</option>}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Tipologia</label>
              <select value={plan} onChange={e => setPlan(e.target.value as PlanKey)} className="input-field text-sm" style={{ minWidth: 200 }}>
                <option value="slim">Slim — R$ 6.000,00/mês</option>
                <option value="smart">Smart — R$ 8.000,00/mês</option>
                <option value="platinum">Platinum — R$ 14.000,00/mês</option>
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Meta CPL</label>
              <input type="number" value={cplTarget} onChange={e => setCplTarget(Number(e.target.value))}
                className="input-field text-sm" style={{ width: 90 }} />
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="metric-card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm animate-pulse" style={{ color: 'var(--muted)' }}>
                Auditando conta — campanhas, conjuntos, anúncios e criativos...
              </p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{(elapsedMs/1000).toFixed(1)}s</p>
            </div>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              6 chamadas paralelas: insights (account + campaign + adset + ad) + entities (adsets targeting + ads creative)
            </p>
          </div>
        )}
        {!loading && error && <ErrorCard title="Erro ao auditar conta" message={error} />}

        {!loading && audit && (
          <>
            {/* ── Score cards ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-4">
              {([
                { label: 'Score Estrutural', sub: '40% do total', score: audit.structScore, type: 'structural' as const },
                { label: 'Score Performance', sub: '60% do total', score: audit.perfScore, type: 'performance' as const },
                { label: 'Score Final', sub: '0.4×estrut + 0.6×perf', score: audit.finalScore, type: 'final' as const },
              ]).map(({ label, sub, score, type }) => {
                const tone = score >= 80 ? 'ok' : score >= 60 ? 'warn' : 'bad'
                return (
                  <div key={type} className="metric-card text-center" style={{ borderLeft: `3px solid ${toneColor(tone)}` }}>
                    <p className="text-xs mb-0.5" style={{ color: 'var(--muted)' }}>{label}</p>
                    <p className="text-xs mb-2" style={{ color: 'var(--muted)', opacity: 0.6 }}>{sub}</p>
                    <p className="text-4xl font-black" style={{ color: toneColor(tone) }}>{score}</p>
                    <p className="text-xs mt-1.5 font-bold" style={{ color: toneColor(tone) }}>{auditScoreLabel(score, type)}</p>
                  </div>
                )
              })}
            </div>

            {/* ── Resumo da unidade ───────────────────────────────────────── */}
            <div className="metric-card">
              <p className="text-sm font-bold mb-1" style={{ color: 'var(--text)' }}>Resumo da unidade</p>
              <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
                {accounts.find((a: any) => a.id === selectedAcc)?.name || selectedAcc} · {period}
              </p>
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: 'Investimento', value: fmt(audit.metrics.spend) },
                  { label: 'Leads', value: fmtN(audit.metrics.leads) },
                  { label: 'CPL atual', value: audit.metrics.leads > 0 ? fmt(audit.metrics.cpl) : '—', color: audit.metrics.cpl <= cplTarget ? 'var(--teal)' : '#ef4444' },
                  { label: 'Alcance', value: fmtN(audit.metrics.reach) },
                  { label: 'CTR', value: `${audit.metrics.ctr.toFixed(2)}%`, color: audit.metrics.ctr >= BENCHMARKS.ctr.min ? 'var(--teal)' : '#ef4444' },
                  { label: 'CPC', value: fmt(audit.metrics.cpc) },
                  { label: 'CPM', value: fmt(audit.metrics.cpm) },
                  { label: 'Frequência', value: audit.metrics.frequency.toFixed(2) },
                ].map(({ label, value, color }: any) => (
                  <div key={label}>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>{label}</p>
                    <p className="font-bold text-sm mt-0.5" style={{ color: color || 'var(--text)' }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Structural items ────────────────────────────────────────── */}
            <div className="metric-card">
              <p className="text-sm font-bold mb-4" style={{ color: 'var(--text)' }}>Estrutura ativa (40% do score)</p>
              <div className="space-y-3">
                {audit.structItems.map(item => (
                  <div key={item.label} style={{ padding: '10px 14px', borderRadius: 10, background: toneBg(item.tone), borderLeft: `3px solid ${toneColor(item.tone)}` }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{item.label}</span>
                      <span className="text-xs font-bold" style={{ color: toneColor(item.tone) }}>
                        {item.score}/100 · peso {item.weight}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Performance benchmarks ──────────────────────────────────── */}
            <div className="metric-card">
              <p className="text-sm font-bold mb-4" style={{ color: 'var(--text)' }}>Performance vs benchmarks (60% do score)</p>
              <div className="space-y-3">
                {audit.perfItems.map(item => (
                  <div key={item.label} style={{ padding: '10px 14px', borderRadius: 10, background: toneBg(item.tone), borderLeft: `3px solid ${toneColor(item.tone)}` }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{item.label}</span>
                      <span className="text-xs font-bold" style={{ color: toneColor(item.tone) }}>
                        {item.score}/100 · peso {item.weight}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── CAMADA DE CRIATIVOS ──────────────────────────────────────── */}
            <div className="metric-card">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Camada criativos</p>
                <div className="flex gap-3 text-xs" style={{ color: 'var(--muted)' }}>
                  {Object.entries(audit.creativeTypeCounts).map(([type, count]) => (
                    <span key={type}>{type}: {count as number}</span>
                  ))}
                </div>
              </div>
              <p className="text-xs mb-5" style={{ color: 'var(--muted)' }}>
                Cruzamento entities (creative.thumbnail_url + object_type) × insights (CTR + CPL + spend)
              </p>

              <div className="grid grid-cols-2 gap-4">
                {(['winner','potencial','investigate','kill'] as Zone[]).map(zone => {
                  const zc   = ZONE_CONFIG[zone]
                  const list = audit.creativeZones[zone]
                  return (
                    <div key={zone} style={{ border: `1px solid ${zc.color}22`, borderRadius: 12, overflow: 'hidden' }}>
                      <div className="px-4 py-3 flex items-center justify-between" style={{ background: `${zc.color}11` }}>
                        <span className="text-sm font-bold" style={{ color: zc.color }}>
                          {zc.emoji} {zc.label}
                        </span>
                        <span className="text-xs font-bold" style={{ color: zc.color }}>{list.length}</span>
                      </div>

                      {list.length === 0 ? (
                        <p className="px-4 py-3 text-xs" style={{ color: 'var(--muted)' }}>
                          Nenhum anúncio nesta zona no período atual.
                        </p>
                      ) : (
                        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                          {list.map(ad => (
                            <div
                              key={ad.ad_id}
                              className="flex items-start gap-3 px-4 py-3 cursor-pointer"
                              style={{ borderTop: `1px solid ${zc.color}18` }}
                              onClick={() => setPreviewAd(ad)}
                            >
                              {/* Thumbnail */}
                              <div style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: 'var(--active)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {ad.thumbnailUrl || ad.image_url ? (
                                  <img
                                    src={ad.thumbnailUrl || ad.image_url || ''}
                                    alt={ad.ad_name}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                  />
                                ) : (
                                  <span style={{ fontSize: 20 }}>
                                    {ad.creativeType === 'video' ? '🎬' : ad.creativeType === 'carrossel' ? '🎠' : '🖼'}
                                  </span>
                                )}
                              </div>

                              {/* Info */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }} title={ad.ad_name}>
                                  {ad.ad_name}
                                </p>
                                <p className="text-xs truncate" style={{ color: 'var(--muted)', fontSize: 10 }} title={`${ad.campaignName} › ${ad.adsetName}`}>
                                  {ad.campaignName}
                                </p>
                                <p className="text-xs mt-1" style={{ color: zc.color, fontSize: 10, lineHeight: 1.4 }}>
                                  {ad.reason}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── SEGMENTAÇÃO ──────────────────────────────────────────────── */}
            <div className="metric-card">
              <p className="text-sm font-bold mb-1" style={{ color: 'var(--text)' }}>Segmentações mapeadas</p>
              <p className="text-xs mb-5" style={{ color: 'var(--muted)' }}>
                Cruzamento entities (targeting: idade, gênero, localização, tipo de público) × insights (verba por conjunto)
              </p>

              {/* Audience type share */}
              <div className="flex gap-3 flex-wrap mb-5">
                {audit.audienceShares.map(({ type, count, share, spend }) => (
                  <div key={type} className="px-3 py-2 rounded-lg text-center" style={{ background: 'var(--active)', border: '1px solid var(--border)', minWidth: 100 }}>
                    <p className="text-xs font-bold" style={{ color: 'var(--text)' }}>{type}</p>
                    <p className="text-sm font-black mt-0.5" style={{ color: 'var(--teal)' }}>{share.toFixed(0)}%</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>{count} conj · {fmt(spend)}</p>
                  </div>
                ))}
              </div>

              {/* Adset segmentation table */}
              <div className="overflow-x-auto" style={{ maxHeight: 420, overflowY: 'auto' }}>
                <table className="w-full text-xs">
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--card)' }}>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Conjunto', 'Tipo de Público', 'Idade / Gênero', 'Localização', 'Status', 'Investimento', 'Leads'].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-bold uppercase tracking-wider" style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {audit.adsetSegments.map(seg => (
                      <tr key={seg.adset_id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--text)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={seg.adsetName}>
                          {seg.adsetName}
                        </td>
                        <td className="px-3 py-2.5">
                          <span style={{ padding: '2px 7px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'rgba(0,196,160,0.1)', color: 'var(--teal)' }}>
                            {seg.audienceType}
                          </span>
                        </td>
                        <td className="px-3 py-2.5" style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{seg.ageGender}</td>
                        <td className="px-3 py-2.5" style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{seg.locations}</td>
                        <td className="px-3 py-2.5">
                          <span style={{ color: seg.status === 'ACTIVE' ? 'var(--teal)' : '#f59e0b', fontWeight: 700 }}>
                            {seg.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-semibold" style={{ color: 'var(--text)' }}>{fmt(seg.spend)}</td>
                        <td className="px-3 py-2.5" style={{ color: seg.leads > 0 ? 'var(--teal)' : '#ef4444', fontWeight: 700 }}>
                          {seg.leads > 0 ? seg.leads : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Distribuição de verba ────────────────────────────────────── */}
            <div className="metric-card">
              <p className="text-sm font-bold mb-4" style={{ color: 'var(--text)' }}>Distribuição de verba por funil (plano {plan})</p>
              <div className="grid grid-cols-4 gap-4 text-center">
                {[
                  { label: 'Topo investido', value: fmt(audit.topoSpend), ref: `ref R$ ${PLANS[plan].topoRef}` },
                  { label: 'Fundo investido', value: fmt(audit.fundoSpend), ref: `ref R$ ${PLANS[plan].fundoRef}`, ok: audit.budgetOk },
                  { label: 'Total real', value: fmt(audit.metrics.spend), ref: `ref R$ ${PLANS[plan].invMin}–R$ ${PLANS[plan].invMax}` },
                  { label: 'CPL ref do plano', value: `R$ ${PLANS[plan].cplRef}`, ref: `atual R$ ${audit.metrics.cpl.toFixed(0)}` },
                ].map(({ label, value, ref, ok }: any) => (
                  <div key={label} style={{ padding: 16, borderRadius: 10, background: 'var(--active)' }}>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>{label}</p>
                    <p className="text-lg font-black mt-1" style={{ color: ok === false ? '#f59e0b' : ok === true ? 'var(--teal)' : 'var(--text)' }}>
                      {value}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{ref}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Plano de otimização (Fix List) ───────────────────────────── */}
            {audit.fixes.length > 0 && (
              <div className="metric-card" style={{ borderLeft: '3px solid #f59e0b' }}>
                <p className="text-sm font-bold mb-4" style={{ color: 'var(--text)' }}>
                  🛠 Plano de otimização — {audit.fixes.length} ação(ões) recomendada(s)
                </p>
                <div className="space-y-2">
                  {audit.fixes.map((fix, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'rgba(245,158,11,0.06)' }}>
                      <span className="text-sm font-bold mt-0.5" style={{ color: '#f59e0b', flexShrink: 0 }}>{i + 1}.</span>
                      <p className="text-sm" style={{ color: 'var(--text)' }}>{fix}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Creative Preview Modal ──────────────────────────────────────────── */}
      {previewAd && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)', zIndex: 1000 }}
          onClick={() => setPreviewAd(null)}
        >
          <div
            className="relative"
            style={{ background: 'var(--card)', borderRadius: 16, padding: 24, maxWidth: 480, width: '90%', maxHeight: '80vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => setPreviewAd(null)} style={{ position: 'absolute', top: 12, right: 16, background: 'none', border: 'none', color: 'var(--muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>

            <p className="text-sm font-bold mb-1" style={{ color: 'var(--text)' }} title={previewAd.ad_name}>{previewAd.ad_name}</p>
            <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>{previewAd.campaignName} › {previewAd.adsetName}</p>

            {/* Creative preview */}
            <div style={{ borderRadius: 12, overflow: 'hidden', background: 'var(--active)', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 220 }}>
              {previewAd.thumbnailUrl || previewAd.image_url ? (
                <img
                  src={previewAd.thumbnailUrl || previewAd.image_url || ''}
                  alt={previewAd.ad_name}
                  style={{ width: '100%', objectFit: 'contain', maxHeight: 320 }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              ) : (
                <div style={{ padding: 40, textAlign: 'center' }}>
                  <span style={{ fontSize: 48 }}>
                    {previewAd.creativeType === 'video' ? '🎬' : previewAd.creativeType === 'carrossel' ? '🎠' : '🖼'}
                  </span>
                  <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>Criativo {previewAd.creativeType} — thumbnail não disponível</p>
                </div>
              )}
            </div>

            {/* Zone badge */}
            <div className="flex items-center gap-2 mb-4">
              <span style={{ padding: '3px 10px', borderRadius: 20, background: `${ZONE_CONFIG[previewAd.zone].color}22`, color: ZONE_CONFIG[previewAd.zone].color, fontWeight: 700, fontSize: 12 }}>
                {ZONE_CONFIG[previewAd.zone].emoji} {ZONE_CONFIG[previewAd.zone].label}
              </span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Tipo: {previewAd.creativeType}</span>
            </div>

            {/* Reason */}
            <div style={{ padding: '10px 14px', borderRadius: 8, background: `${ZONE_CONFIG[previewAd.zone].color}11`, marginBottom: 16 }}>
              <p style={{ color: ZONE_CONFIG[previewAd.zone].color, fontSize: 13 }}>{previewAd.reason}</p>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'CTR', value: `${previewAd.ctr.toFixed(2)}%` },
                { label: 'CPL', value: previewAd.leads > 0 ? fmt(previewAd.cpl) : '—' },
                { label: 'Leads', value: String(previewAd.leads) },
                { label: 'Investimento', value: fmt(previewAd.spend) },
              ].map(({ label, value }) => (
                <div key={label} style={{ padding: '10px 8px', borderRadius: 8, background: 'var(--active)' }}>
                  <p style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
                  <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
