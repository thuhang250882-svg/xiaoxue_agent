import { Show, createEffect, createMemo, createResource, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { Portal } from "solid-js/web"
import { useSearchParams } from "@solidjs/router"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { NewSessionDesignView } from "@/components/session"
import { PromptInputV2Composer, usePromptInputV2Controller } from "@/components/prompt-input-v2"
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
import { createPromptInputController, createPromptProjectControls } from "@/pages/session/composer"
import { useSessionKey } from "@/pages/session/session-layout"
import { useComposerCommands } from "@/pages/session/use-composer-commands"
import { NEW_SESSION_CONTENT_WIDTH } from "@/pages/session/new-session-layout"
import { PromptGitStatus, PromptWorkspaceSelector } from "@/components/prompt-workspace-selector"
import { useTitlebarRightMount } from "@/components/titlebar"
import { useCommand } from "@/context/command"
import { useSettingsCommand } from "@/components/settings-dialog"
import { useLocal } from "@/context/local"
import { createPromptModelSelection } from "@/pages/session/composer/prompt-model-selection"

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
  const dialog = useDialog()
  const command = useCommand()
  useSettingsCommand()
  const route = useSessionKey()
  const local = useLocal()
  const [searchParams, setSearchParams] = useSearchParams<{
    draftId?: string
    prompt?: string
    agent?: string
    autoSubmit?: string
    files?: string
  }>()
  const model = createPromptModelSelection({ agent: local.agent.current })

  useComposerCommands({ model })

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
    model,
  })
  const projectControls = createPromptProjectControls()

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
  const promptInputV2Controller = usePromptInputV2Controller({
    get controls() {
      return inputController()
    },
    get newSessionWorktree() {
      return newSessionWorktree()
    },
    onNewSessionWorktreeReset: () => setStore("worktree", undefined),
    onSubmit: () => comments.clear(),
  })
  const projectController = createPromptProjectController({
    controls: projectControls,
    onDone: promptInputV2Controller.restoreFocus,
  })

  command.register("new-session", () => [
    {
      id: "command.palette",
      title: language.t("command.palette"),
      hidden: true,
      onSelect: async () => {
        const { DialogSelectFile } = await import("@/components/dialog-select-file")
        void dialog.show(() => <DialogSelectFile />)
      },
    },
    {
      id: "input.focus",
      title: language.t("command.input.focus"),
      category: language.t("command.category.view"),
      keybind: "ctrl+l",
      onSelect: () => promptInputV2Controller.restoreFocus(),
    },
  ])

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
      // Pet actions enter through Home with an explicit prompt and task ID.
      // Never recover a process-wide pending pet task into an ordinary draft:
      // a stale task would otherwise prefill every new conversation.
    })
  })

  createEffect(() => {
    if (!prompt.ready()) return
    promptInputV2Controller.restoreFocus()
  })

  const ready = Promise.resolve()
  const [suspendUntilPromptReady] = createResource(
    () => prompt.ready.promise ?? ready,
    (promise) => promise.then(() => true),
  )

  return (
    <div class="relative size-full overflow-hidden flex flex-col">
      {suspendUntilPromptReady()}
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
                <div class="flex flex-col gap-8">
                  <PromptInputV2Composer controller={promptInputV2Controller} />
                  <Show when={!projectController.selected()}>
                    <PromptProjectAddButton controller={projectController} />
                  </Show>
                  <Show when={projectController.selected()}>
                    <div class="flex min-h-7 min-w-0 flex-col items-center justify-center gap-0 text-v2-text-text-faint sm:flex-row">
                      <PromptProjectSelector controller={projectController} placement="bottom" />
                      <Show
                        when={showWorkspaceBar()}
                        fallback={<PromptGitStatus branch={selectedBranch()} noGit={sync().project?.vcs !== "git"} />}
                      >
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
                          onDone={promptInputV2Controller.restoreFocus}
                        />
                      </Show>
                    </div>
                  </Show>
                </div>
                {/*</Show>*/}
              </div>
            </NewSessionDesignView>
          </div>
        </div>
      </div>
    </div>
  )
}
