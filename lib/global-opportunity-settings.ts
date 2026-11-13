import { db } from './db'

// SystemSettings for global opportunities, redeployment matching and the Monday digest (editable in /settings)
export const GLOBAL_OPP_SETTING_DEFAULTS = {
  GLOBAL_OPP_EXTRA_LOCATIONS: { value: 'Canada,Poland', description: 'Comma-separated locations kept by the global opportunities import besides US Hybrid/Remote.' },
  GLOBAL_MATCH_TOP_N: { value: '5', description: 'Opportunity groups scored per redeployment person (best prefilter matches).' },
  GLOBAL_MATCH_MIN_SCORE: { value: '65', description: 'Global matches below this score are stored but hidden by default and left out of the digest.' },
  REDEPLOYMENT_DIGEST_RECIPIENTS: { value: '', description: 'Comma-separated emails for the Monday Redeployment digest. Empty = not sent.' },
} as const

export async function seedGlobalOpportunitySettings(): Promise<void> {
  await Promise.all(Object.entries(GLOBAL_OPP_SETTING_DEFAULTS).map(([key, d]) =>
    db.systemSettings.upsert({ where: { key }, update: {}, create: { key, value: d.value, description: d.description } }),
  ))
}

export interface GlobalOpportunitySettings {
  extraLocations: string[]
  topN: number
  minScore: number
  digestRecipients: string[]
}

export async function getGlobalOpportunitySettings(): Promise<GlobalOpportunitySettings> {
  await seedGlobalOpportunitySettings()
  const rows = await db.systemSettings.findMany({ where: { key: { in: Object.keys(GLOBAL_OPP_SETTING_DEFAULTS) } } })
  const get = (k: keyof typeof GLOBAL_OPP_SETTING_DEFAULTS) => (rows.find((r) => r.key === k)?.value ?? GLOBAL_OPP_SETTING_DEFAULTS[k].value).trim()
  const list = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean)
  const num = (k: keyof typeof GLOBAL_OPP_SETTING_DEFAULTS, min: number) => {
    const n = Number(get(k))
    return Number.isFinite(n) && n >= min ? Math.round(n) : Number(GLOBAL_OPP_SETTING_DEFAULTS[k].value)
  }
  return {
    extraLocations: list(get('GLOBAL_OPP_EXTRA_LOCATIONS')),
    topN: num('GLOBAL_MATCH_TOP_N', 1),
    minScore: num('GLOBAL_MATCH_MIN_SCORE', 0),
    digestRecipients: list(get('REDEPLOYMENT_DIGEST_RECIPIENTS')).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
  }
}
