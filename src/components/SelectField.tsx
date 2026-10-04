import type { ChangeEvent, ReactNode } from 'react'

/** A labelled native select styled for the dark design system. */
function SelectField({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string
  label: string
  value: string
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={onChange}
        className="h-8 min-w-36 rounded-lg border border-input bg-input/30 px-2 text-sm text-foreground outline-none [color-scheme:dark] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {children}
      </select>
    </div>
  )
}

export default SelectField
