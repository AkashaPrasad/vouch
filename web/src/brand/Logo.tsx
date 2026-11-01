interface MarkProps { size?: number; className?: string }

/** The Vouch mark: a rounded square holding a check whose right stroke is a lime "V". */
export function LogoMark({ size = 28, className }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="var(--text)" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="var(--border-strong)" />
      <path d="M8 16.5l4.5 5" stroke="var(--bg)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M12.5 21.5L24 9" stroke="var(--accent)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

const SIZES = { sm: { mark: 22, text: 'text-[17px]' }, md: { mark: 28, text: 'text-[21px]' }, lg: { mark: 40, text: 'text-[30px]' } }

export function Logo({ size = 'md', className = '' }: { size?: keyof typeof SIZES; className?: string }) {
  const s = SIZES[size]
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={s.mark} />
      <span className={`${s.text} font-bold leading-none tracking-[-0.04em] text-text`}>vouch</span>
    </span>
  )
}
