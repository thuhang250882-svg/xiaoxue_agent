import { Show, createEffect, createMemo, createResource, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { Portal } from "solid-js/web"
import { useSearchParams } from "@solidjs/router"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { NewSessionDesignView } from "@/components/session"
import { PromptInput } from "@/components/prompt-input"
import { StatusPopoverV2 } from "@/components/status-popover"
import {
  PromptProjectAddButton,
  PromptProjectSelector,
  createPromptProjectController,
} from "@/components/prompt-project-selector"
import { useComments } from "@/context/comments"
import { usePrompt } from "@/context/prompt"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useServerSync } from "@/context/server-sync"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { useLocal } from "@/context/local"
import { createPromptInputController, createPromptProjectControls } from "@/pages/session/composer"
import { useSessionKey } from "@/pages/session/session-layout"
import { useComposerCommands } from "@/pages/session/use-composer-commands"
import { NEW_SESSION_CONTENT_WIDTH } from "@/pages/session/new-session-layout"
import { PromptWorkspaceSelector } from "@/components/prompt-workspace-selector"
import { useTitlebarRightMount } from "@/components/titlebar"

const workspaceBarEnabled = import.meta.env.VITE_OPENCODE_CHANNEL !== "prod"

/**
 * The `/new-session` draft page. Unlike `session.tsx`, this only renders the prompt
 * composer for a brand-new session — no terminal, review pane, file tree, or message
 * timeline. Submitting promotes the draft into a real session (see prompt-input/submit).
 */
function draftFiles(value?: string) {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === "string" && item.length > 0)
  } catch {
    return []
  }
}
export default function NewSessionPage() {
  const prompt = usePrompt()
  const sdk = useSDK()
  const sync = useSync()
  const serverSync = useServerSync()
  const comments = useComments()
  const language = useLanguage()
  const settings = useSettings()
  const local = useLocal()
  const route = useSessionKey()
  const [searchParams, setSearchParams] = useSearchParams<{
    draftId?: string
    prompt?: string
    agent?: string
    autoSubmit?: string
    files?: string
  }>()

  useComposerCommands()

  createEffect(() => {
    const agent = searchParams.agent
    if (!agent) return
    if (!local.agent.list().some((item) => item.name === agent)) return
    local.agent.set(agent)
    setSearchParams({ ...searchParams, agent: undefined })
  })
  let inputRef: HTMLDivElement | undefined

  const inputController = createPromptInputController({
    sessionKey: route.sessionKey,
    sessionID: () => route.params.id,
    queryOptions: serverSync().queryOptions,
  })
  const projectControls = createPromptProjectControls()
  const projectController = createPromptProjectController({
    controls: projectControls,
    onDone: () => inputRef?.focus(),
  })

  const [store, setStore] = createStore<{ worktree?: string }>({})
  const rightMount = useTitlebarRightMount()

  const showWorkspaceBar = createMemo(() => workspaceBarEnabled && sync().project?.vcs === "git")
  const newSessionWorktree = createMemo(() => {
    if (!showWorkspaceBar()) return "main"
    if (store.worktree) return store.worktree
    const project = sync().project
    if (project && sdk().directory !== project.worktree) return sdk().directory
    return "main"
  })
  const projectRoot = createMemo(() => sync().project?.worktree ?? sdk().directory)
  const localBranch = createMemo(() => serverSync().child(projectRoot())[0].vcs?.branch)
  const selectedBranch = createMemo(() => {
    const worktree = newSessionWorktree()
    if (worktree === "main" || worktree === "create") return localBranch()
    return serverSync().child(worktree)[0].vcs?.branch ?? localBranch()
  })

  createEffect(() => {
    if (!prompt.ready()) return
    untrack(() => {
      const text = searchParams.prompt
      if (text) {
        const shouldAutoSubmit = searchParams.autoSubmit === "1"
        const files = draftFiles(searchParams.files)
        prompt.set(
          [
            { type: "text", content: text, start: 0, end: text.length },
            ...files.map((path) => ({
              type: "file" as const,
              path,
              filename: path.split(/[\\/]/).at(-1),
              content: `@${path}`,
              start: 0,
              end: 0,
            })),
          ],
          text.length,
        )
        setSearchParams({ ...searchParams, prompt: undefined, autoSubmit: undefined, files: undefined })
        if (shouldAutoSubmit) {
          requestAnimationFrame(() => inputRef?.closest("form")?.requestSubmit())
        }
        return
      }
      // Check direct pending task from pet window IPC (desktop only)
      const desktopApi = (window as { api?: Record<string, unknown> }).api
      const petApi = desktopApi?.xiaoxuePet as
        | { consumePendingTask?: () => Promise<{ prompt: string; agent: string; autoSubmit: boolean } | null> }
        | undefined
      if (!petApi?.consumePendingTask) return
      void petApi.consumePendingTask().then((task) => {
        if (!task) return
        prompt.set([{ type: "text", content: task.prompt, start: 0, end: task.prompt.length }], task.prompt.length)
        if (task.autoSubmit) {
          queueMicrotask(() => {
            requestAnimationFrame(() => inputRef?.closest("form")?.requestSubmit())
          })
        }
      })
    })
  })

  createEffect(() => {
    if (!prompt.ready()) return
    requestAnimationFrame(() => inputRef?.focus())
  })
  const ready = Promise.resolve()
  const [promptReady] = createResource(
    () => prompt.ready.promise ?? ready,
    (promise) => promise.then(() => true),
  )

  return (
    <div class="relative size-full overflow-hidden flex flex-col">
      <Show when={rightMount()}>
        {(mount) => (
          <Portal mount={mount()}>
            <Show when={settings.visibility.status()}>
              <Tooltip placement="bottom" value={language.t("status.popover.trigger")}>
                <StatusPopoverV2 />
              </Tooltip>
            </Show>
          </Portal>
        )}
      </Show>
      <div class="flex-1 min-h-0 flex flex-col gap-2 p-2">
        <div class="@container relative flex flex-col min-h-0 h-full flex-1">
          <div class="flex-1 min-h-0 overflow-hidden rounded-[10px]">
            <NewSessionDesignView>
              <div class={NEW_SESSION_CONTENT_WIDTH}>
                <Show
                  when={prompt.ready() || promptReady()}
                  fallback={
                    <div class="w-full min-h-32 md:min-h-40 rounded-md border border-border-weak-base bg-background-base/50 px-4 py-3 text-text-weak pointer-events-none">
                      {language.t("prompt.loading")}
                    </div>
                  }
                >
                  <div class="flex flex-col" classList={{ "gap-8": showWorkspaceBar(), "gap-3": !showWorkspaceBar() }}>
                    <PromptInput
                      controls={inputController()}
                      variant="new-session"
                      ref={(el) => {
                        inputRef = el
                      }}
                      newSessionWorktree={newSessionWorktree()}
                      onNewSessionWorktreeReset={() => setStore("worktree", undefined)}
                      onSubmit={() => comments.clear()}
                      toolbar={
                        <Show when={!projectController.selected()}>
                          <PromptProjectAddButton controller={projectController} />
                        </Show>
                      }
                    />
                    <Show when={projectController.selected()}>
                      <div
                        class="flex min-h-7 min-w-0 items-center gap-0 text-v2-text-text-faint"
                        classList={{
                          "flex-col justify-center sm:flex-row": showWorkspaceBar(),
                          "justify-start": !showWorkspaceBar(),
                        }}
                      >
                        <PromptProjectSelector
                          controller={projectController}
                          placement={showWorkspaceBar() ? "bottom" : "bottom-start"}
                        />
                        <Show when={showWorkspaceBar()}>
                          <PromptWorkspaceSelector
                            value={newSessionWorktree()}
                            projectRoot={projectRoot()}
                            workspaces={sync().project?.sandboxes ?? []}
                            branch={selectedBranch()}
                            onChange={(value) =>
                              setStore(
                                "worktree",
                                value === "main" && sync().project?.worktree !== sdk().directory
                                  ? sync().project?.worktree
                                  : value,
                              )
                            }
                            onDone={() => inputRef?.focus()}
                          />
                        </Show>
                      </div>
                    </Show>
                  </div>
                </Show>
              </div>
            </NewSessionDesignView>
          </div>
        </div>
      </div>
    </div>
  )
}
