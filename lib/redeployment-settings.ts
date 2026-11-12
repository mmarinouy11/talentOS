import { db } from './db'

// SystemSettings for the Redeployment roster sync (editable in /settings, ADMIN only)
export const REDEPLOYMENT_SETTING_DEFAULTS = {
  REDEPLOYMENT_SHEET_ID: { value: '1_Zvyyrq1kvF1zBRuYgLWrj_Xw00a238SRZ2HJ4AMCEU', description: 'Google Sheet ID of the HR roster used for Redeployment.' },
  REDEPLOYMENT_SHEET_TAB: { value: 'Roster', description: 'Roster tab name, or its numeric gid.' },
  REDEPLOYMENT_CV_FOLDER_ID: { value: '1494vjwFoS-czxWeATTRQabg-bd7d3el6', description: 'Drive folder ID holding the roster CVs.' },
  REDEPLOYMENT_REHIRE_VALUES: { value: 'Yes', description: 'Comma-separated "Open/Recommended for Rehire" values that make a person eligible (case-insensitive).' },
  REDEPLOYMENT_PAST_DAYS: { value: '90', description: 'Include people released up to this many days ago (by LWD).' },
  REDEPLOYMENT_FUTURE_DAYS: { value: '60', description: 'Include people releasing within this many days (by LWD).' },
} as const

export type RedeploymentSettingKey = keyof typeof REDEPLOYMENT_SETTING_DEFAULTS

// The first default pointed at TalentOS's own CV folder by mistake
const WRONG_CV_FOLDER_DEFAULT = '1xnH6hFlqOUpjPRM522G7-bm2yEKgAgZ1'

// Creates missing keys only; values edited in /settings are never overwritten (except the known-wrong
// CV folder default, corrected only while it still holds that exact value)
export async function seedRedeploymentSettings(): Promise<void> {
  await db.systemSettings.updateMany({
    where: { key: 'REDEPLOYMENT_CV_FOLDER_ID', value: WRONG_CV_FOLDER_DEFAULT },
    data: { value: REDEPLOYMENT_SETTING_DEFAULTS.REDEPLOYMENT_CV_FOLDER_ID.value },
  })
  await Promise.all(Object.entries(REDEPLOYMENT_SETTING_DEFAULTS).map(([key, d]) =>
    db.systemSettings.upsert({ where: { key }, update: {}, create: { key, value: d.value, description: d.description } }),
  ))
}

export interface RedeploymentSettings {
  sheetId: string
  sheetTab: string
  cvFolderId: string
  rehireValues: string[]
  pastDays: number
  futureDays: number
}

export async function getRedeploymentSettings(): Promise<RedeploymentSettings> {
  await seedRedeploymentSettings()
  const rows = await db.systemSettings.findMany({ where: { key: { in: Object.keys(REDEPLOYMENT_SETTING_DEFAULTS) } } })
  const get = (k: RedeploymentSettingKey) => (rows.find((r) => r.key === k)?.value ?? REDEPLOYMENT_SETTING_DEFAULTS[k].value).trim()
  const num = (k: RedeploymentSettingKey) => {
    const n = Number(get(k))
    return Number.isFinite(n) && n >= 0 ? n : Number(REDEPLOYMENT_SETTING_DEFAULTS[k].value)
  }
  return {
    sheetId: get('REDEPLOYMENT_SHEET_ID'),
    sheetTab: get('REDEPLOYMENT_SHEET_TAB'),
    cvFolderId: get('REDEPLOYMENT_CV_FOLDER_ID'),
    rehireValues: get('REDEPLOYMENT_REHIRE_VALUES').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    pastDays: num('REDEPLOYMENT_PAST_DAYS'),
    futureDays: num('REDEPLOYMENT_FUTURE_DAYS'),
  }
}
