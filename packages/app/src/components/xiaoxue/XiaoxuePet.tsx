import { createSignal, onCleanup, onMount } from "solid-js"
import { Icon } from "@opencode-ai/ui/v2/icon"
import type { XiaoxueAgentStateEvent, XiaoxueState } from "../../../../../avatar/xiaoxue_pet/state"
import { XIAOXUE_ACTION_MAP } from "../../../../../avatar/xiaoxue_pet/state"

export function XiaoxuePet(props: { state?: XiaoxueState; message?: string; avatarUrl?: string }) {
  const [eventState, setEventState] = createSignal<XiaoxueState>("idle")
  const [eventMessage, setEventMessage] = createSignal<string>()
  const state = () => props.state ?? eventState()
  const message = () => props.message ?? eventMessage() ?? defaultMessage(state())

  onMount(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<XiaoxueAgentStateEvent>).detail
      if (!detail || detail.event !== "agent_state_changed") return
      setEventState(detail.state)
      setEventMessage(detail.message)
    }
    window.addEventListener("agent_state_changed", handler)
    onCleanup(() => window.removeEventListener("agent_state_changed", handler))
  })

  return (
    <aside class="flex min-w-0 items-center gap-3 rounded-[8px] border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-3">
      <div class="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-v2-border-border-muted bg-v2-background-bg-layer-02">
        {props.avatarUrl ? (
          <img src={props.avatarUrl} alt="录井小雪" class="size-full object-cover" />
        ) : (
          <span class="text-[13px] leading-4 text-v2-text-text-base [font-weight:620]">小雪</span>
        )}
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-2">
          <span class="text-[13px] leading-5 text-v2-text-text-base [font-weight:560]">录井小雪</span>
          <span class="inline-flex items-center gap-1 rounded-[999px] border border-v2-border-border-muted px-2 py-0.5 text-[11px] leading-4 text-v2-text-text-muted [font-weight:530]">
            <Icon name={stateIcon(state())} size="small" />
            {state()}
          </span>
        </div>
        <div class="mt-1 min-w-0 text-[12px] leading-5 text-v2-text-text-muted [font-weight:440]">
          <span class="text-v2-text-text-base">{XIAOXUE_ACTION_MAP[state()]}</span>
          <span class="mx-1">·</span>
          <span>{message()}</span>
        </div>
      </div>
    </aside>
  )
}

function stateIcon(state: XiaoxueState) {
  if (state === "reviewing") return "review"
  if (state === "searching") return "magnifying-glass"
  if (state === "success" || state === "celebrate") return "check"
  if (state === "writing") return "edit"
  if (state === "reading") return "filetree"
  if (state === "error" || state === "warning") return "status-active"
  return "status"
}

function defaultMessage(state: XiaoxueState) {
  if (state === "waiting") return "正在等待外部结果或您的后续输入。"
  if (state === "reviewing") return "正在检查报告结构、井号、层位、岩性和油气显示..."
  if (state === "searching") return "正在检索制度、标准和历史样例。"
  if (state === "speaking") return "正在向您说明结果和下一步建议。"
  if (state === "writing") return "正在组织公司常用文档结构。"
  if (state === "success") return "当前任务或普通步骤已完成。"
  if (state === "celebrate") return "项目交付或关键里程碑已完成，值得庆祝！"
  if (state === "error") return "当前任务未完成，需要检查输入资料。"
  if (state === "reading") return "正在读取报告文本、段落和表格。"
  if (state === "thinking") return "正在汇总问题等级和修改建议。"
  return "选择一个任务开始。"
}