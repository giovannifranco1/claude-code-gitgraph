import type { Cell } from '../types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')

export function relTime(now: number, time: number): string {
  const s = Math.max(0, now - time)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`
  const d = new Date(time * 1000)
  const day = `${MONTHS[d.getMonth()]} ${d.getDate()}`
  return d.getFullYear() === new Date(now * 1000).getFullYear() ? day : `${day} ${d.getFullYear()}`
}

export function absTime(time: number): string {
  const d = new Date(time * 1000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fitGraph(cells: Cell[], max: number): Cell[] {
  if (cells.length <= max) return cells
  return [...cells.slice(0, Math.max(0, max - 1)), { ch: '…', color: cells[max - 1]?.color ?? 0 }]
}

export function truncate(text: string, max: number): string {
  if (max <= 0) return ''
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}
