type Props = {
  label: string
  value: string | number
}

export function ProgressBadge({ label, value }: Props) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-neutral-100 px-4 py-2 dark:bg-neutral-800">
      <span className="text-xl font-bold">{value}</span>
      <span className="text-xs text-neutral-500 dark:text-neutral-400">{label}</span>
    </div>
  )
}
