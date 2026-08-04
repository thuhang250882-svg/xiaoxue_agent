import { Icon } from "@opencode-ai/ui/icon"
import { Component, For, Show, createMemo, createSignal } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSync } from "@/context/server-sync"
import { showToast } from "@/utils/toast"
import "./settings-v2.css"

type ApprovalMode = "request" | "auto" | "full"

const modes = [
  {
    value: "request",
    icon: "edit" as const,
    title: "请求批准",
    description: "编辑项目外文件、运行命令或使用互联网前始终询问。",
    detail: "适合审阅陌生资料、首次使用新技能，以及需要逐步确认的任务。",
  },
  {
    value: "auto",
    icon: "shield" as const,
    title: "替我审批",
    description: "日常低风险操作自动执行，仅在检测到风险操作时请求批准。",
    detail: "推荐设置。保留专业智能体的工具边界和敏感文件保护规则。",
  },
  {
    value: "full",
    icon: "warning" as const,
    title: "完全访问权限",
    description: "自动批准文件、命令和联网权限请求，可访问项目外文件。",
    detail: "仅在你信任当前任务、附件、技能和项目来源时使用。",
  },
] satisfies ReadonlyArray<{
  value: ApprovalMode
  icon: "edit" | "shield" | "warning"
  title: string
  description: string
  detail: string
}>

export const SettingsApprovalV2: Component = () => {
  const language = useLanguage()
  const serverSync = useServerSync()
  const [saving, setSaving] = createSignal<ApprovalMode>()
  const current = createMemo<ApprovalMode>(() => serverSync().data.config.xiaoxue?.approval_mode ?? "auto")

  const select = async (value: ApprovalMode) => {
    if (value === current() || saving()) return
    setSaving(value)
    await serverSync()
      .updateConfig({
        xiaoxue: {
          ...serverSync().data.config.xiaoxue,
          approval_mode: value,
        },
      })
      .catch((error: unknown) => {
        showToast({
          title: language.t("settings.permissions.toast.updateFailed.title"),
          description: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => setSaving(undefined))
  }

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-approval-header">
        <h2 class="settings-v2-tab-title">审批权限</h2>
        <p>决定录井小雪在执行文件、命令和联网操作时何时需要你的确认。</p>
      </div>

      <div class="settings-v2-approval" role="radiogroup" aria-label="审批权限模式">
        <For each={modes}>
          {(mode) => (
            <button
              type="button"
              class="settings-v2-approval-option"
              classList={{
                "settings-v2-approval-option-selected": current() === mode.value,
                "settings-v2-approval-option-danger": mode.value === "full",
              }}
              role="radio"
              aria-checked={current() === mode.value}
              disabled={!!saving()}
              onClick={() => void select(mode.value)}
            >
              <span class="settings-v2-approval-icon">
                <Icon name={mode.icon} />
              </span>
              <span class="settings-v2-approval-copy">
                <strong>{mode.title}</strong>
                <span>{mode.description}</span>
                <small>{mode.detail}</small>
              </span>
              <span class="settings-v2-approval-check" aria-hidden="true">
                <Show
                  when={saving() === mode.value}
                  fallback={
                    <Show when={current() === mode.value}>
                      <Icon name="check" />
                    </Show>
                  }
                >
                  保存中
                </Show>
              </span>
            </button>
          )}
        </For>

        <div class="settings-v2-approval-note">
          <Icon name="shield" />
          <span>审批设置不会突破 Windows 账户权限，也不会替代专业智能体已有的只读、安全和业务边界。</span>
        </div>
      </div>
    </>
  )
}
