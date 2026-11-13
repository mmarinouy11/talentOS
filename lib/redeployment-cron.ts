import cron from 'node-cron'
import { runRedeploymentSync } from './redeployment-sync'
import { sendRedeploymentDigest } from './redeployment-digest'

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
  // Monday digest at 08:00 America/Montevideo
  cron.schedule('0 8 * * 1', () => {
    sendRedeploymentDigest().catch((err) => console.error('[redeployment-digest] Send failed:', err instanceof Error ? err.message : err))
  }, { timezone: 'America/Montevideo' })
  console.log('[redeployment-digest] Scheduled Mondays at 08:00 America/Montevideo')
}
