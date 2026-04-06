export const META_API_BASE = 'https://graph.facebook.com/v19.0'

// ─── Lead / Results counting — matches Meta Ads Manager "Resultados" column ──
//
// How Meta Ads Manager computes "Resultados":
//   • Lead Ads campaigns       → action_type: 'lead'
//   • Click-to-WhatsApp / Msgs → action_type: 'onsite_conversion.messaging_conversation_started_7d'
//                                + 'onsite_conversion.messaging_first_reply'
//   • Pixel conversion         → action_type: 'offsite_conversion.fb_pixel_lead'
//
// When an account runs both Lead Ads AND messaging campaigns the Gerenciador
// shows the SUM of all campaign results — so we must do the same.
// NOTE: do NOT include omni_lead together with 'lead' — omni_lead already
//       aggregates lead + pixel + onsite, causing double-counting.
export function countLeads(actions: Array<{ action_type: string; value: string }> = []): number {
  const map: Record<string, number> = {}
  for (const a of actions) {
    map[a.action_type] = (map[a.action_type] || 0) + (Number(a.value) || 0)
  }

  // Lead Ads form fills (primary result for Lead Generation campaigns)
  const leadForms = map['lead'] || 0

  // WhatsApp / Messenger conversations (primary result for Messages campaigns)
  // Both types appear in "Resultados" when the account runs messaging campaigns
  const msgConversations = map['onsite_conversion.messaging_conversation_started_7d'] || 0
  const msgFirstReply    = map['onsite_conversion.messaging_first_reply'] || 0
  const messaging = msgConversations + msgFirstReply

  // If we have explicit results from either type, sum them (different campaign objectives)
  if (leadForms > 0 || messaging > 0) return leadForms + messaging

  // Fallback for pixel-based conversions (website lead events)
  if (map['offsite_conversion.fb_pixel_lead'] > 0) return map['offsite_conversion.fb_pixel_lead']

  // Fallback for on-site web lead (Instant Experience)
  if (map['onsite_web_lead'] > 0) return map['onsite_web_lead']

  // Last resort: Meta's deduplicated cross-channel total
  if (map['omni_lead'] > 0) return map['omni_lead']

  return 0
}

// ─── Metrics Calculator ───────────────────────────────────────────────────────
export interface MetricsInput {
  spend: number
  impressions: number
  clicks: number
  reach: number
  frequency: number
  leads: number
}

export interface Metrics extends MetricsInput {
  ctr: number
  cpc: number
  cpm: number
  cpl: number
  leadRate: number
}

export function calcMetrics(raw: MetricsInput): Metrics {
  const { spend, impressions, clicks, reach, frequency, leads } = raw
  return {
    spend,
    impressions,
    clicks,
    reach,
    frequency,
    leads,
    ctr: impressions > 0 ? Math.round((clicks / impressions) * 100 * 100) / 100 : 0,
    cpc: clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0,
    cpm: impressions > 0 ? Math.round((spend / impressions) * 1000 * 100) / 100 : 0,
    cpl: leads > 0 ? Math.round((spend / leads) * 100) / 100 : 0,
    leadRate: clicks > 0 ? Math.round((leads / clicks) * 100 * 100) / 100 : 0,
  }
}

// ─── Date Range Builder ───────────────────────────────────────────────────────
export type DatePreset = 'today' | 'yesterday' | 'last_7d' | 'last_30d' | 'this_month' | 'last_month' | 'custom'

export const PERIOD_LABELS: Record<DatePreset | string, string> = {
  today: 'Hoje',
  yesterday: 'Ontem',
  last_7d: 'Últimos 7 dias',
  last_30d: 'Últimos 30 dias',
  this_month: 'Este mês',
  last_month: 'Mês passado',
  custom: 'Personalizado',
}

export function buildDateParams(preset: DatePreset | string, since?: string, until?: string): Record<string, string> {
  if (preset === 'custom' && since && until) {
    return { time_range: JSON.stringify({ since, until }) }
  }
  return { date_preset: preset }
}

// ─── Global Benchmarks ────────────────────────────────────────────────────────
export const BENCHMARKS = {
  cpm: { min: 15, max: 35 },
  ctr: { min: 1.2, max: 3 },
  cpc: { min: 1.5, max: 4 },
  frequency: { min: 1.8, max: 3.5 },
}

// ─── Plan Configuration ───────────────────────────────────────────────────────
export type PlanKey = 'slim' | 'smart' | 'platinum'

export interface PlanConfig {
  cplRef: number
  invTotal: number
  invMin: number
  invMax: number
  googleAds: number
  topoRef: number
  meioRef: number
  fundoRef: number
}

export const PLANS: Record<PlanKey, PlanConfig> = {
  slim: {
    cplRef: 70,
    invTotal: 6000,
    invMin: 5100,
    invMax: 7000,
    googleAds: 1,
    topoRef: 600,
    meioRef: 600,
    fundoRef: 4800,
  },
  smart: {
    cplRef: 60,
    invTotal: 8000,
    invMin: 6800,
    invMax: 9500,
    googleAds: 0,
    topoRef: 800,
    meioRef: 800,
    fundoRef: 6400,
  },
  platinum: {
    cplRef: 45,
    invTotal: 14000,
    invMin: 11900,
    invMax: 16000,
    googleAds: 0,
    topoRef: 1400,
    meioRef: 1400,
    fundoRef: 11200,
  },
}

// ─── Campaign Objective Classification ───────────────────────────────────────
export function classifyObjective(objective: string): 'topo' | 'meio' | 'fundo' {
  const obj = objective?.toUpperCase() || ''
  if (['REACH', 'BRAND_AWARENESS', 'OUTCOME_AWARENESS'].includes(obj)) return 'topo'
  if (['OUTCOME_LEADS', 'LEAD_GENERATION', 'CONVERSIONS', 'OUTCOME_SALES', 'MESSAGES'].includes(obj)) return 'fundo'
  return 'meio'
}

// ─── Ad Classification ────────────────────────────────────────────────────────
export type AdStatus = 'winner' | 'potencial' | 'investigate' | 'kill' | 'other'

export function classifyAd(ctr: number, cpl: number, spend: number, cplTarget: number): AdStatus {
  if (ctr >= 2 && cpl <= cplTarget)           return 'winner'
  if (ctr >= 1.5 && cpl <= cplTarget * 1.2)   return 'potencial'
  if (ctr >= 1.2)                              return 'investigate'
  if (spend >= 2)                              return 'kill'
  return 'other'
}

export const AD_STATUS_LABELS: Record<AdStatus, string> = {
  winner: 'Winner',
  potencial: 'Potencial',
  investigate: 'Investigar',
  kill: 'Kill',
  other: 'Em análise',
}

// ─── Audit Scoring ────────────────────────────────────────────────────────────
export type BenchmarkTone = 'ok' | 'warn' | 'bad'

export function scoreTone(score: number): BenchmarkTone {
  if (score >= 80) return 'ok'
  if (score >= 60) return 'warn'
  return 'bad'
}

export function benchmarkCheck(value: number, min: number, max: number): BenchmarkTone {
  if (value >= min * 0.7) return 'ok'
  if (value <= max * 1.3) return 'warn'
  return 'bad'
}

export const AUDIT_WEIGHTS = {
  activeVolume: 15,
  objectives: 20,
  zombieAdsets: 15,
  cpm: 15,
  ctr: 15,
  cpc: 15,
  cpl: 35,
  frequency: 15,
}

export function calcAuditScore(structuralScore: number, performanceScore: number): number {
  return Math.round(0.4 * structuralScore + 0.6 * performanceScore)
}

export function auditScoreLabel(score: number, type: 'structural' | 'performance' | 'final'): string {
  if (type === 'structural') {
    if (score >= 80) return 'Saudável'
    if (score >= 60) return 'Atenção'
    return 'Crítico'
  }
  if (type === 'performance') {
    if (score >= 80) return 'Excelente'
    if (score >= 60) return 'Dentro da faixa'
    return 'Crítico'
  }
  if (score >= 80) return 'Saudável'
  if (score >= 60) return 'Atenção'
  return 'Crítico'
}

// ─── Brazilian State → Macro-Region Mapping ──────────────────────────────────
export const STATE_REGION: Record<string, string> = {
  SP: 'Sudeste', RJ: 'Sudeste', MG: 'Sudeste', ES: 'Sudeste',
  PR: 'Sul',     SC: 'Sul',     RS: 'Sul',
  GO: 'Centro-Oeste', MT: 'Centro-Oeste', MS: 'Centro-Oeste', DF: 'Centro-Oeste',
  BA: 'Nordeste', SE: 'Nordeste', AL: 'Nordeste', PE: 'Nordeste',
  PB: 'Nordeste', RN: 'Nordeste', CE: 'Nordeste', PI: 'Nordeste', MA: 'Nordeste',
  AM: 'Norte', PA: 'Norte', AP: 'Norte', AC: 'Norte',
  RO: 'Norte', RR: 'Norte', TO: 'Norte',
}

export const MACRO_REGIONS = ['Sudeste', 'Sul', 'Centro-Oeste', 'Nordeste', 'Norte']

// ─── Audience Type Classification ────────────────────────────────────────────
export type AudienceType = 'advantage' | 'lookalike' | 'custom' | 'interest' | 'broad'

export function classifyAudience(targeting: any): AudienceType {
  if (!targeting) return 'broad'
  if (targeting.advantage_audience) return 'advantage'
  if ((targeting.lookalike_specs || []).length > 0) return 'lookalike'
  if ((targeting.custom_audiences || []).length > 0) return 'custom'
  if (targeting.flexible_spec && (targeting.flexible_spec[0]?.interests || targeting.flexible_spec[0]?.behaviors)) return 'interest'
  return 'broad'
}

export const AUDIENCE_LABELS: Record<AudienceType, string> = {
  advantage: 'Advantage+',
  lookalike: 'Lookalike',
  custom: 'Personalizado',
  interest: 'Interesses',
  broad: 'Amplo',
}

// ─── Meta API Helpers ─────────────────────────────────────────────────────────
export async function metaFetch(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${META_API_BASE}${path}`)
  url.searchParams.set('access_token', token)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString())
  return res.json()
}

export function parseMetricValue(value: string | number | undefined, defaultVal = 0): number {
  if (value === undefined || value === null || value === '') return defaultVal
  const n = Number(value)
  return isNaN(n) ? defaultVal : n
}

// ─── Formatters ───────────────────────────────────────────────────────────────
export function formatCurrency(value: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value)
}

export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: decimals }).format(value)
}

export function formatPercent(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`
}
