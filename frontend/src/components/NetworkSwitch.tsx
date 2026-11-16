import { useNetworkMode } from '../networkMode'

export function NetworkSwitch() {
  const { networkMode, toggleNetworkMode } = useNetworkMode()
  const internal = networkMode === 'internal'

  return (
    <button
      type="button"
      role="switch"
      aria-label="使用内网地址"
      aria-checked={internal}
      onClick={toggleNetworkMode}
      title={internal ? '当前使用内网地址；未填写时使用外网地址' : '当前使用外网地址；点击切换到内网'}
      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-1.5 text-xs hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-safe:transition-colors cursor-pointer"
    >
      <span className={`hidden sm:inline ${internal ? 'text-muted' : 'font-medium text-ink'}`}>外网</span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full border motion-safe:transition-colors ${internal ? 'bg-primary border-primary' : 'bg-raised-strong border-border-strong'}`} aria-hidden="true">
        <span className={`absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-on-primary shadow-sm motion-safe:transition-transform ${internal ? 'translate-x-4' : 'translate-x-0'}`} />
      </span>
      <span className={`hidden sm:inline ${internal ? 'font-medium text-accent' : 'text-muted'}`}>内网</span>
      <span className={`sm:hidden ${internal ? 'font-medium text-accent' : 'font-medium text-ink'}`}>{internal ? '内网' : '外网'}</span>
    </button>
  )
}
