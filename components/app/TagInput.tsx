'use client'

import { useState, KeyboardEvent } from 'react'
import { Input } from '@/components/ui/input'

interface TagInputProps {
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}

export function TagInput({ value, onChange, placeholder = 'Type and press Enter…' }: TagInputProps) {
  const [input, setInput] = useState('')

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const tag = input.trim()
      if (tag && !value.includes(tag)) {
        onChange([...value, tag])
      }
      setInput('')
    }
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag))
  }

  return (
    <div className="space-y-2">
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-700 px-2.5 py-1 text-xs font-medium"
            >
              {tag}
              <button
                type="button"
                onClick={() => remove(tag)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
