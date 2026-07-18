const LATAM_COUNTRIES = new Set([
  'argentina', 'bolivia', 'brazil', 'brasil', 'chile', 'colombia',
  'costa rica', 'cuba', 'dominican republic', 'república dominicana',
  'ecuador', 'el salvador', 'guatemala', 'haiti', 'haití', 'honduras',
  'jamaica', 'mexico', 'méxico', 'nicaragua', 'panama', 'panamá',
  'paraguay', 'peru', 'perú', 'puerto rico', 'trinidad and tobago',
  'uruguay', 'venezuela',
])

const CATCH_ALL_PATTERNS = [
  'anywhere', 'remote', 'latam', 'latin america', 'latinoamerica',
  'latinoamérica', 'worldwide', 'global',
]

export function locationAllowed(positionLocations: string[], candidateCountry: string): boolean {
  if (!positionLocations || positionLocations.length === 0) return true

  const country = candidateCountry.trim().toLowerCase()

  for (const loc of positionLocations) {
    const l = loc.trim().toLowerCase()

    if (CATCH_ALL_PATTERNS.some((p) => l.includes(p))) {
      if (l.includes('latam') || l.includes('latin america') || l.includes('latinoam')) {
        if (LATAM_COUNTRIES.has(country)) return true
      } else {
        return true
      }
      continue
    }

    if (l === country) return true
    if (l.includes(country) || country.includes(l)) return true
  }

  return false
}
