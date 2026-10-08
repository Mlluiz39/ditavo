/** Formata um timestamp como "agora", "há 5 min", "ontem"... */
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const diff = Math.max(0, now - timestamp)
  const minutes = Math.floor(diff / 60_000)

  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`

  const days = Math.floor(hours / 24)
  if (days === 1) return 'ontem'
  if (days < 7) return `há ${days} dias`

  return new Date(timestamp).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}
