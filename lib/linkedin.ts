/**
 * Extract the normalized personal-profile handle from any LinkedIn URL format.
 * Returns the lowercase handle, or null when the input is not a /in/ profile URL.
 *
 * Examples:
 *   normalizeLinkedinHandle('https://www.linkedin.com/in/RafaelPortela-dev/')        → 'rafaelportela-dev'
 *   normalizeLinkedinHandle('http://linkedin.com/in/rafaelportela-dev')               → 'rafaelportela-dev'
 *   normalizeLinkedinHandle('linkedin.com/in/rafaelportela-dev')                      → 'rafaelportela-dev'
 *   normalizeLinkedinHandle('www.linkedin.com/in/rafaelportela-dev/')                 → 'rafaelportela-dev'
 *   normalizeLinkedinHandle('https://br.linkedin.com/in/rafaelportela-dev')           → 'rafaelportela-dev'
 *   normalizeLinkedinHandle('mx.linkedin.com/in/rafaelportela-dev?locale=es_ES')      → 'rafaelportela-dev'
 *   normalizeLinkedinHandle('https://www.linkedin.com/in/rafaelportela-dev/#about')   → 'rafaelportela-dev'
 *   normalizeLinkedinHandle('https://www.linkedin.com/in/rafaelportela-dev/details/experience/') → 'rafaelportela-dev'
 *   normalizeLinkedinHandle('https://www.linkedin.com/in/jos%C3%A9-p%C3%A9rez-123')  → 'josé-pérez-123'
 *   normalizeLinkedinHandle('/in/rafaelportela-dev')                                  → 'rafaelportela-dev'
 *   normalizeLinkedinHandle('in/rafaelportela-dev')                                   → 'rafaelportela-dev'
 *   normalizeLinkedinHandle('  https://LinkedIn.com/IN/RafaelPortela-dev  ')          → 'rafaelportela-dev'
 *   normalizeLinkedinHandle('https://www.linkedin.com/company/tenarai')               → null
 *   normalizeLinkedinHandle('https://www.linkedin.com/pub/dir/john/smith')            → null
 *   normalizeLinkedinHandle('https://example.com/in/rafael')                          → null
 *   normalizeLinkedinHandle('rafaelportela-dev')                                      → null
 *   normalizeLinkedinHandle('')                                                       → null
 *   normalizeLinkedinHandle(null)                                                     → null
 */
export function normalizeLinkedinHandle(url: string | null | undefined): string | null {
  if (!url) return null
  let input = url.trim()
  if (!input) return null

  let path: string
  if (/^\/?in\//i.test(input)) {
    path = input.startsWith('/') ? input : `/${input}`
  } else {
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) input = `https://${input}`
    let parsed: URL
    try {
      parsed = new URL(input)
    } catch {
      return null
    }
    const host = parsed.hostname.toLowerCase()
    if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) return null
    path = parsed.pathname
  }

  path = path.split(/[?#]/)[0]
  const match = /^\/in\/([^/]+)/i.exec(path)
  if (!match) return null

  let handle = match[1]
  try {
    handle = decodeURIComponent(handle)
  } catch {
    // keep the raw segment if it is not valid percent-encoding
  }
  handle = handle.trim().toLowerCase()
  return handle || null
}
