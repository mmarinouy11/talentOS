'use client'

import { useEffect, useState } from 'react'

export function BrandHeader() {
  const [headerImageUrl, setHeaderImageUrl] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/public/brand')
      .then((r) => r.json())
      .then((d) => setHeaderImageUrl(d.headerImageUrl || null))
      .catch(() => {})
  }, [])

  return (
    <header>
      {headerImageUrl && (
        <div style={{ maxHeight: 120, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={headerImageUrl}
            alt="Tenarai"
            style={{ width: '100%', maxHeight: 120, objectFit: 'cover', display: 'block' }}
          />
        </div>
      )}
      <div style={{ background: '#2F2C29', padding: '14px 24px' }}>
        <span style={{ color: '#8CF000', fontWeight: 700, fontSize: 18, letterSpacing: '0.02em', fontFamily: 'Arial, "Open Sans", sans-serif' }}>
          Tenarai LATAM
        </span>
      </div>
    </header>
  )
}
