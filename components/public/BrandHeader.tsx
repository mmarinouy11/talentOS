'use client'

import { useEffect, useState } from 'react'

// Google Drive "uc?export=view" URLs are often blocked by browsers/CORS;
// thumbnail URLs render reliably in <img> tags.
function toImgUrl(url: string): string {
  const match = url.match(/[?&]id=([^&]+)/)
  if (match) return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1200`
  return url
}

export function BrandHeader() {
  const [headerImageUrl, setHeaderImageUrl] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/public/brand')
      .then((r) => r.json())
      .then((d) => {
        const url = d.headerImageUrl
        setHeaderImageUrl(url && url.trim() ? url.trim() : null)
      })
      .catch((err) => console.error('[BrandHeader] failed to fetch brand settings:', err))
  }, [])

  return (
    <header>
      {headerImageUrl && (
        <div style={{ maxHeight: 120, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={toImgUrl(headerImageUrl)}
            alt="Tenarai"
            style={{ width: '100%', maxHeight: 120, objectFit: 'cover', display: 'block' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
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
