import { ordinaryChatDirectory, useServer, useServerSync, useSettings, useTabs } from "@opencode-ai/app"
import { createEffect, onMount } from "solid-js"

export function DesktopFirstLaunchOnboarding(props: { initialUrl: string; onLoaded: () => void }) {
  const server = useServer()
  const sync = useServerSync()
  const settings = useSettings()
  const tabs = useTabs()
  const ordinaryDirectoryReady = new Promise<string>((resolve) => {
    createEffect(() => {
      const directory = ordinaryChatDirectory(sync().data.path)
      if (directory) resolve(directory)
    })
  })

  onMount(() => {
    void runFirstLaunchOnboarding().finally(props.onLoaded)
  })

  async function runFirstLaunchOnboarding() {
    try {
      await Promise.all(
        [server.ready.promise, tabs.ready.promise, tabs.recentReady.promise].map((p) => p ?? Promise.resolve()),
      )
      const existingInstall = await window.api.isOldLayoutEligible()
      settings.general.setOldLayoutEligible(existingInstall)
      settings.general.initializeAgentVisibility(existingInstall)
      await tabs.startDesktopConversation(await ordinaryDirectoryReady)
      if (!server.isLocal()) return

      const pending = await window.api.isFirstLaunchOnboardingPending()
      if (!pending) return

      console.info("[desktop-onboarding] first launch onboarding evaluated", {
        pending,
        existingInstall,
        initialUrl: props.initialUrl,
        tabs: tabs.store.length,
      })
      await window.api.finishFirstLaunchOnboarding(false)
    } catch (error) {
      console.error("[desktop-onboarding] first launch onboarding failed", error)
    }
  }

  return null
}
