import cron from 'node-cron'
import { runRedeploymentSync } from './redeployment-sync'

let redeploymentCronStarted = false

// Daily roster sync at 06:30 America/Montevideo
export function startRedeploymentCron() {
  if (redeploymentCronStarted) {
    console.log('[redeployment] Cron already started, skipping duplicate registration')
    return
  }
  redeploymentCronStarted = true
  cron.schedule('30 6 * * *', () => {
    runRedeploymentSync().catch((err) => console.error('[redeployment] Scheduled sync failed:', err instanceof Error ? err.message : err))
  }, { timezone: 'America/Montevideo' })
  console.log('[redeployment] Sync scheduled daily at 06:30 America/Montevideo')
}
