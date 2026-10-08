import { useCallback, useEffect, useState } from 'react'
import type { HistoryItem } from '../types'

const STORAGE_KEY = 'blip-vira-texto/history/v1'
const MAX_ITEMS = 50

function loadItems(): HistoryItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is HistoryItem =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as HistoryItem).id === 'string' &&
        typeof (item as HistoryItem).text === 'string',
    )
  } catch {
    return []
  }
}

function saveItems(items: HistoryItem[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Storage cheio/indisponível — o histórico só não persiste.
  }
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export interface UseTranscriptHistoryResult {
  items: HistoryItem[]
  add: (text: string, lang: string) => boolean
  remove: (id: string) => void
  clear: () => void
}

/** Histórico de transcrições salvas — tudo em localStorage, offline. */
export function useTranscriptHistory(): UseTranscriptHistoryResult {
  const [items, setItems] = useState<HistoryItem[]>(() => loadItems())

  useEffect(() => {
    saveItems(items)
  }, [items])

  const add = useCallback((text: string, lang: string): boolean => {
    const trimmed = text.trim()
    if (!trimmed) return false

    let added = false
    setItems((current) => {
      // Não duplicar o mesmo texto salvo em sequência.
      if (current[0]?.text === trimmed) return current
      added = true
      const next: HistoryItem = {
        id: createId(),
        text: trimmed,
        lang,
        createdAt: Date.now(),
      }
      return [next, ...current].slice(0, MAX_ITEMS)
    })
    return added
  }, [])

  const remove = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const clear = useCallback(() => {
    setItems([])
  }, [])

  return { items, add, remove, clear }
}
