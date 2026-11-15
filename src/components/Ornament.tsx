export default function Ornament({ className = '' }: { className?: string }) {
  return (
    <svg className={`ornament ${className}`} viewBox="0 0 240 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <path d="M6 12h70M164 12h70" />
        <path d="M120 12c-8-9-20-9-28-4M120 12c8-9 20-9 28-4M120 12c-8 9-20 9-28 4M120 12c8 9 20 9 28 4" />
        <path d="M92 8c-5 0-9 2-12 4 3 2 7 4 12 4M148 8c5 0 9 2 12 4-3 2-7 4-12 4" />
        <path d="M104 5c-3 3-3 11 0 14M136 5c3 3 3 11 0 14" />
      </g>
      <g fill="currentColor">
        <circle cx="120" cy="12" r="2.4" />
        <path d="M40 12l4-3 4 3-4 3zM192 12l4-3 4 3-4 3z" />
        <circle cx="6" cy="12" r="1.6" />
        <circle cx="234" cy="12" r="1.6" />
      </g>
    </svg>
  )
}
