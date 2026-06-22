export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startReportingCron } = await import('./lib/reporting-cron')
    startReportingCron()
  }
}
