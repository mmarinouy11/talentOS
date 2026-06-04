interface SkillTagsProps {
  tags: string[]
  max?: number
}

export function SkillTags({ tags, max }: SkillTagsProps) {
  if (tags.length === 0) return <span className="text-gray-400 text-xs">—</span>

  const shown = max ? tags.slice(0, max) : tags
  const extra = max ? tags.length - max : 0

  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-xs font-medium"
        >
          {tag}
        </span>
      ))}
      {extra > 0 && (
        <span className="inline-flex items-center rounded-full bg-gray-200 text-gray-500 px-2 py-0.5 text-xs font-medium">
          +{extra} more
        </span>
      )}
    </div>
  )
}
