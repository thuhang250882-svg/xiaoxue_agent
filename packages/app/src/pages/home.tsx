import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { createHomeController } from "./home/home-controller"
import { createHomeProjectsController } from "./home/home-projects-controller"
import { HomeUtilityNav } from "./home/home-projects-view"
import { HomeProjects } from "./home/home-projects"
import { createHomeScrollController } from "./home/home-scroll-controller"
import { createHomeSessionSearchController } from "./home/home-session-search-controller"
import { createHomeSessionsController } from "./home/home-sessions-controller"
import { HomeSessions } from "./home/home-sessions"
import { onCleanup, onMount } from "solid-js"
import { consumePetTask, currentPendingPetAction, type PendingPetAction } from "./pending-pet-action"

export function NewHome() {
  const home = createHomeController()
  const projects = createHomeProjectsController(home)
  const sessions = createHomeSessionsController(home)
  const search = createHomeSessionSearchController(home, sessions)
  const scroll = createHomeScrollController(sessions.data.groups)

  onMount(() => {
    const runPetAction = (detail?: PendingPetAction) => {
      if (!detail || !consumePetTask(detail.taskId)) return
      detail.handled = true
      if (detail.taskId) {
        const pet = (
          window as {
            api?: { xiaoxuePet?: { acknowledgePendingTask?: (taskId: string) => Promise<void> } }
          }
        ).api?.xiaoxuePet
        void pet?.acknowledgePendingTask?.(detail.taskId)
      }
      sessions.session.create(detail.prompt, detail.agent, detail.autoSubmit, detail.taskId)
    }
    const handler = (event: Event) => runPetAction((event as CustomEvent<PendingPetAction>).detail)
    window.addEventListener("xiaoxue:pet-action", handler)
    const pending = sessionStorage.getItem("xiaoxue.pet.pending-action")
    if (pending) {
      sessionStorage.removeItem("xiaoxue.pet.pending-action")
      runPetAction(currentPendingPetAction(JSON.parse(pending)))
    }
    onCleanup(() => window.removeEventListener("xiaoxue:pet-action", handler))
  })
  return (
    <div
      class={`
        m-2 min-h-0 flex-1 self-stretch overflow-hidden rounded-[10px]
        bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]
      `}
    >
      <ScrollView
        class="h-full [container-type:size]"
        thumbContainer={scroll.viewport.thumbTrack}
        thumbHoverTarget={scroll.viewport.hoverTarget}
        viewportRef={scroll.viewport.setViewport}
        onScroll={(event) => scroll.viewport.update(event.currentTarget.scrollTop)}
        onWheel={scroll.viewport.containOuterWheel}
      >
        <div
          class={`
            mx-auto grid min-h-full w-full grid-rows-[auto_minmax(0,1fr)_auto] gap-4 px-3
            lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-1 lg:gap-8 lg:px-6
          `}
        >
          <HomeProjects projects={projects} scroll={scroll} />
          <HomeSessions sessions={sessions} search={search} scroll={scroll} />
          <HomeUtilityNav
            class="flex lg:hidden"
            onOpenSettings={projects.utility.settings}
            onOpenHelp={projects.utility.help}
            language={projects.copy.language}
          />
        </div>
      </ScrollView>
    </div>
  )
}
