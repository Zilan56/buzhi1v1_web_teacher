import { useMemo, useState } from 'react'
import { inspirePhrases } from '../../config/inspirePhrases'

function pickNext(pool: string[], current: string) {
  if (pool.length <= 1) return current
  let next = current
  while (next === current) {
    next = pool[Math.floor(Math.random() * pool.length)]
  }
  return next
}

export function InspireBar() {
  const pool = useMemo(() => inspirePhrases, [])
  const [phrase, setPhrase] = useState(() => pool[0] ?? '')
  const [visible, setVisible] = useState(true)

  return (
    <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-bg-left)] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div
          className={[
            'min-w-0 flex-1 text-sm text-[var(--color-text-secondary)] transition-opacity duration-200',
            visible ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        >
          <span className="block truncate">{phrase}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            setVisible(false)
            window.setTimeout(() => {
              setPhrase((p) => pickNext(pool, p))
              setVisible(true)
            }, 180)
          }}
          className="shrink-0 rounded-[var(--radius-card)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-light)]"
        >
          换一条
        </button>
      </div>
    </div>
  )
}
