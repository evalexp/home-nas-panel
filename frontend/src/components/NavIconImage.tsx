import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '../api/client'

interface Props {
  iconId: number
  alt: string
  className?: string
  refreshKey?: number
  initialData?: string
  fallback: ReactNode
}

export function NavIconImage({ iconId, alt, className, refreshKey = 0, initialData, fallback }: Props) {
  const container = useRef<HTMLSpanElement>(null)
  const [resolved, setResolved] = useState<{ id: number; version: number; data: string } | null>(null)
  const [failedData, setFailedData] = useState<string | null>(null)

  useEffect(() => {
    if (initialData) return
    let active = true
    let started = false
    const load = () => {
      if (started) return
      started = true
      observer?.disconnect()
      api.nav.getIcon(iconId).then((icon) => {
        if (active) setResolved({ id: iconId, version: refreshKey, data: icon.data })
      }).catch(() => {
        if (active) setResolved(null)
      })
    }
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) load()
    }, { rootMargin: '160px' })
    if (observer && container.current) observer.observe(container.current)
    else load()
    return () => {
      active = false
      observer?.disconnect()
    }
  }, [iconId, refreshKey, initialData])

  const data = initialData || (resolved?.id === iconId && resolved.version === refreshKey ? resolved.data : null)
  return (
    <span ref={container} className="flex items-center justify-center w-full h-full">
      {data && data !== failedData ? (
        <img src={data} alt={alt} className={className} draggable={false} loading="lazy" onError={() => setFailedData(data)} />
      ) : fallback}
    </span>
  )
}
