import { useCallback, useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

export interface UsePWAInstallResult {
  /** O navegador ofereceu a instalação. */
  canInstall: boolean
  /** Já instalado (ou rodando como app). */
  installed: boolean
  install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>
}

/** Liga o botão "Instalar app" ao evento beforeinstallprompt do navegador. */
export function usePWAInstall(): UsePWAInstallResult {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(
    null,
  )
  const [installed, setInstalled] = useState(() => isStandalone())

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setPromptEvent(event as BeforeInstallPromptEvent)
    }
    const onAppInstalled = () => {
      setInstalled(true)
      setPromptEvent(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  const install = useCallback(async (): Promise<
    'accepted' | 'dismissed' | 'unavailable'
  > => {
    if (!promptEvent) return 'unavailable'
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice
    setPromptEvent(null)
    if (choice.outcome === 'accepted') setInstalled(true)
    return choice.outcome
  }, [promptEvent])

  return { canInstall: Boolean(promptEvent) && !installed, installed, install }
}
