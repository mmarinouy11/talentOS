// Quick checks for redeploymentFirstName():  npx tsx scripts/check-redeployment-names.ts
import assert from 'node:assert/strict'
import { redeploymentFirstName as f } from '../lib/redeployment-names'

const cases: [Parameters<typeof f>[0], string][] = [
  [{ firstName: 'Juliana', lastName: 'Martinez', preferredName: 'Juliana Martinez' }, 'Juliana'],
  [{ firstName: 'Michael', lastName: 'Pérez Rodríguez', preferredName: 'Michael Pérez Rodríguez' }, 'Michael'],
  [{ firstName: 'Michael', lastName: 'Pérez Rodríguez', preferredName: 'michael perez  rodriguez' }, 'michael'], // case/accents/spaces
  [{ firstName: 'Ana', lastName: 'Gómez', preferredName: 'Ana' }, 'Ana'], // no change
  [{ firstName: 'Ana María', lastName: 'Gómez', preferredName: '' }, 'Ana María'], // preferred empty → First Name
  [{ firstName: 'Ana', lastName: 'Gómez', preferredName: null }, 'Ana'],
  [{ firstName: 'Martinez', lastName: 'Martinez', preferredName: 'Martinez' }, 'Martinez'], // nothing left → First Name as given
  [{ firstName: 'Juan', lastName: 'Pérez Rodríguez', preferredName: 'Juan Pérez Rodríguez Jr' }, 'Juan Jr'], // last name in the middle
  [{ firstName: 'Juan', lastName: 'Pérez Rodríguez', preferredName: 'Juan Carlos Rodríguez' }, 'Juan Carlos'], // trailing last-name token
]
for (const [input, expected] of cases) {
  assert.equal(f(input), expected, `${JSON.stringify(input)} → expected "${expected}", got "${f(input)}"`)
}
console.log(`redeploymentFirstName: ${cases.length} checks passed`)
