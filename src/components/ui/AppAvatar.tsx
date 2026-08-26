import { cn } from '../../lib/cn'
import { colorFromName } from '../../lib/color'

/** 统一头像圆圈。替代 10+ 处内联的 "圆底 + 首字" 写法，配色走 lib/color 单源。 */
export function AppAvatar({
  name,
  color,
  size = 32,
  className,
}: {
  name: string
  color?: string
  size?: number
  className?: string
}) {
  const label = (name || '?').slice(0, 1)
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-bold text-white',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(11, Math.round(size * 0.42)),
        backgroundColor: color || colorFromName(name),
      }}
    >
      {label}
    </div>
  )
}
