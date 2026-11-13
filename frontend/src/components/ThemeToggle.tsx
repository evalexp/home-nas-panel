import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../theme'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const label = theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      aria-pressed={theme === 'dark'}
      title={label}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-body hover:border-border-strong hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface motion-safe:transition-colors cursor-pointer"
    >
      {theme === 'dark' ? <Sun className="h-4.5 w-4.5" aria-hidden="true" /> : <Moon className="h-4.5 w-4.5" aria-hidden="true" />}
    </button>
  )
}
