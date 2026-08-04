// 提交互斥测试共享的 mock harness：复刻 submit.test.ts 的依赖注入，
// 额外提供会话创建/消息派发的失败注入与并发控制
import { mock } from "bun:test"
import { createStore } from "solid-js/store"
import type { Prompt, PromptStore } from "@/context/prompt"

export const harnessState = {
  params: {} as { id?: string },
  createSessionGate: undefined as Promise<void> | undefined,
  failSessionCreate: false,
  failPromptDispatch: false,
  promptParts: [{ type: "text", content: "ls", start: 0, end: 2 }] as Prompt,
}

export const harnessLog = {
  createdSessions: [] as string[],
  promptDispatches: [] as string[],
  optimisticAdds: [] as Array<{ sessionID?: string }>,
}

export function resetHarness() {
  harnessState.params = {}
  harnessState.createSessionGate = undefined
  harnessState.failSessionCreate = false
  harnessState.failPromptDispatch = false
  harnessState.promptParts = [{ type: "text", content: "ls", start: 0, end: 2 }]
  harnessLog.createdSessions.length = 0
  harnessLog.promptDispatches.length = 0
  harnessLog.optimisticAdds.length = 0
}

// 等待 fire-and-forget 的 sendFollowupDraft 微任务排空
export const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0))

const [promptStore, setPromptStore] = createStore<PromptStore>({
  prompt: harnessState.promptParts,
  cursor: 0,
  context: { items: [] },
})

const promptStub = {
  store: [() => promptStore, setPromptStore] as [() => PromptStore, typeof setPromptStore],
  ready: Object.assign(() => true, { promise: Promise.resolve(true) }),
  current: () => harnessState.promptParts,
  cursor: () => 0,
  dirty: () => true,
  model: { current: () => undefined, set: () => undefined },
  reset: () => undefined,
  set: (value: Prompt) => {
    harnessState.promptParts = value
  },
  context: {
    add: () => undefined,
    remove: () => undefined,
    removeComment: () => undefined,
    updateComment: () => undefined,
    replaceComments: () => undefined,
    items: () => [],
  },
  capture: () => promptStub,
}

export function submitEvent() {
  return { preventDefault: () => undefined } as unknown as Event
}

export async function initSubmitHarness() {
  const clientFor = (directory: string) => ({
    session: {
      create: async () => {
        await harnessState.createSessionGate
        if (harnessState.failSessionCreate) throw new Error("session create failed")
        harnessLog.createdSessions.push(directory)
        return {
          data: { id: `session-${harnessLog.createdSessions.length}`, title: "New session" },
        }
      },
      shell: async () => ({ data: undefined }),
      prompt: async () => ({ data: undefined }),
      promptAsync: async () => {
        if (harnessState.failPromptDispatch) throw new Error("provider rejected")
        harnessLog.promptDispatches.push(directory)
        return { data: undefined }
      },
      command: async () => ({ data: undefined }),
      abort: async () => ({ data: undefined }),
    },
    worktree: { create: async () => ({ data: { directory: `${directory}/new` } }) },
  })
  const rootClient = clientFor("/repo/main")

  mock.module("@solidjs/router", () => ({
    useNavigate: () => () => undefined,
    useParams: () => harnessState.params,
    useLocation: () => ({}),
    useSearchParams: () => [{}, () => undefined],
  }))
  mock.module("@opencode-ai/sdk/v2/client", () => ({
    createOpencodeClient: () => clientFor("/repo/main"),
  }))
  mock.module("@opencode-ai/ui/toast", () => ({
    Toast: { Region: () => null },
    showToast: () => 0,
  }))
  mock.module("@opencode-ai/core/util/encode", () => ({
    base64Encode: (value: string) => value,
  }))
  mock.module("@/context/local", () => ({
    useLocal: () => ({
      model: {
        current: () => ({ id: "model", provider: { id: "provider" } }),
        variant: { current: () => undefined },
      },
      agent: { current: () => ({ name: "agent" }) },
      session: { promote: () => undefined },
    }),
  }))
  mock.module("@/context/permission", () => ({
    usePermission: () => ({ currentServerState: () => ({ enableAutoAccept: () => undefined }) }),
  }))
  mock.module("@/context/server", () => ({
    useServer: () => ({ key: "server-key" }),
  }))
  mock.module("@/context/tabs", () => ({
    useTabs: () => ({ draft: () => ({ server: "project-server" }), promoteDraft: () => undefined }),
  }))
  mock.module("@/context/prompt", () => ({ usePrompt: () => promptStub }))
  mock.module("@/context/layout", () => ({
    useLayout: () => ({ handoff: { setTabs: () => undefined } }),
  }))
  mock.module("@/context/sdk", () => ({
    useSDK: () => () => ({
      scope: "local",
      directory: "/repo/main",
      client: rootClient,
      url: "http://localhost:4096",
      createClient: (opts: { directory: string }) => clientFor(opts.directory),
    }),
  }))
  mock.module("@/context/sync", () => ({
    useSync: () => () => ({
      data: { command: [] },
      session: {
        optimistic: {
          add: (value: { sessionID?: string }) => harnessLog.optimisticAdds.push(value),
          remove: () => undefined,
        },
      },
      set: () => undefined,
    }),
  }))
  mock.module("@/context/server-sync", () => ({
    useServerSync: () => () => ({
      session: { remember: () => undefined, set: () => undefined },
      child: () => [{ session: [] }, () => undefined],
    }),
  }))
  mock.module("@/context/platform", () => ({ usePlatform: () => ({ fetch }) }))
  mock.module("@/context/language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }))

  return import("./submit")
}

export function defaultSubmitInput() {
  return {
    prompt: promptStub,
    // 已有会话 ID 时复用会话（重试场景），否则走新建会话流程
    info: () => (harnessState.params.id ? { id: harnessState.params.id } : undefined),
    imageAttachments: () => [],
    commentCount: () => 0,
    autoAccept: () => false,
    mode: () => "normal" as const,
    working: () => false,
    editor: () => undefined,
    queueScroll: () => undefined,
    promptLength: (value: Prompt) =>
      value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
    addToHistory: () => undefined,
    resetHistoryNavigation: () => undefined,
    setMode: () => undefined,
    setPopover: () => undefined,
    onSubmit: () => undefined,
  }
}
