export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startReportingCron } = await import('./lib/reporting-cron')
    startReportingCron()
    const { startBulkUploadWorker } = await import('./lib/bulk-upload-worker')
    startBulkUploadWorker()
    const { startRedeploymentCron } = await import('./lib/redeployment-cron')
    startRedeploymentCron()
    const { runRedeploymentHireBackfill } = await import('./lib/redeployment-hire')
    void runRedeploymentHireBackfill()
  }
}
