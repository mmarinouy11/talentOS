import { useState, useMemo } from 'react'

type SortDirection = 'asc' | 'desc'

export function useSortableData<T>(
  data: T[],
  defaultSortKey?: keyof T,
  defaultDirection: SortDirection = 'asc',
) {
  const [sortKey, setSortKey] = useState<keyof T | undefined>(defaultSortKey)
  const [direction, setDirection] = useState<SortDirection>(defaultDirection)

  const sorted = useMemo(() => {
    if (!sortKey) return data
    return [...data].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]
      if (aVal == null) return 1
      if (bVal == null) return -1
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      if (aVal < bVal) return direction === 'asc' ? -1 : 1
      if (aVal > bVal) return direction === 'asc' ? 1 : -1
      return 0
    })
  }, [data, sortKey, direction])

  function toggleSort(key: keyof T) {
    if (sortKey === key) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setDirection('asc')
    }
  }

  return { sorted, sortKey, direction, toggleSort }
}
