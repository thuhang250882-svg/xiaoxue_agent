import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { SelectV2 } from "@opencode-ai/ui/v2/select-v2"
import { Switch } from "@opencode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { For, Show, createMemo, createResource, createSignal } from "solid-js"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"

const archiveModes = [
  { value: "manual" as const, label: "仅响应明确归档指令" },
  { value: "confirm" as const, label: "确认后正式发布" },
  { value: "auto" as const, label: "自动生成待审核草稿" },
]

type MemoryHistoryEntry = {
  id: string
  content: string
  source: string
  confidence: number
  version: number
  status: "active" | "superseded" | "deleted"
  updatedAt: number
}

export function SettingsXiaoxueKnowledgeV2() {
  const platform = usePlatform()
  const serverSdk = useServerSDK()
  const serverSync = useServerSync()
  const [pluginStatus, setPluginStatus] = createSignal("")
  const [advanced, setAdvanced] = createSignal(false)
  const [overviewFailed, setOverviewFailed] = createSignal(false)
  const [editingID, setEditingID] = createSignal("")
  const [editingValue, setEditingValue] = createSignal("")
  const [forgetID, setForgetID] = createSignal("")
  const [historyID, setHistoryID] = createSignal("")
  const [historyEntries, setHistoryEntries] = createSignal<MemoryHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = createSignal(false)
  const [manageStatus, setManageStatus] = createSignal("")
  const xiaoxue = createMemo(() => serverSync().data.config.xiaoxue ?? {})
  const memory = createMemo(() => xiaoxue().memory ?? {})
  const obsidian = createMemo(() => xiaoxue().obsidian ?? {})
  const [integration, { refetch: refreshIntegration }] = createResource(
    () => obsidian().vault_path ?? "__auto__",
    (vaultPath) =>
      platform.obsidianIntegrationStatus?.(vaultPath === "__auto__" ? undefined : vaultPath) ??
      Promise.resolve({
        available: false,
        pluginInstalled: false,
        vaultPath: vaultPath === "__auto__" ? undefined : vaultPath,
      }),
  )
  const vaultPath = createMemo(() => obsidian().vault_path ?? integration()?.vaultPath ?? "")
  const [overview, { refetch: refreshOverview }] = createResource(() =>
    serverSdk()
      .client.config.xiaoxueMemory()
      .then((result) => {
        setOverviewFailed(false)
        return result.data
      })
      .catch(() => {
        setOverviewFailed(true)
        return undefined
      }),
  )
  const archiveMode = createMemo(
    () => archiveModes.find((option) => option.value === (obsidian().archive_mode ?? "confirm")) ?? archiveModes[1],
  )

  const update = (value: { memory?: Record<string, unknown>; obsidian?: Record<string, unknown> }) =>
    serverSync().updateConfig({
      xiaoxue: {
        ...xiaoxue(),
        ...(value.memory ? { memory: { ...memory(), ...value.memory } } : {}),
        ...(value.obsidian ? { obsidian: { ...obsidian(), ...value.obsidian } } : {}),
      },
    })

  const number = (value: string, fallback: number) => {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
  }

  const pickVault = async () => {
    if (platform.platform !== "desktop") return
    const selected = await platform.openDirectoryPickerDialog({ title: "选择 Obsidian Vault" })
    if (!selected || Array.isArray(selected)) return
    await update({ obsidian: { enabled: true, vault_path: selected } })
    void refreshIntegration()
  }

  const installPlugin = async () => {
    if (!platform.installObsidianCompanion || !vaultPath()) return
    setPluginStatus("正在安装…")
    const result = await platform.installObsidianCompanion(vaultPath()).catch((error) => ({
      success: false,
      message: error instanceof Error ? error.message : String(error),
    }))
    setPluginStatus(result.message)
    if (!result.success) return
    await update({ obsidian: { companion_plugin: true } })
    void refreshIntegration()
  }

  const memoryCount = createMemo(() => {
    const counts = overview()?.counts
    if (!counts) return 0
    return Number(counts.user) + Number(counts.shared) + Number(counts.project)
  })

  const memoryUpdatedAt = createMemo(() => {
    const value = overview()?.updatedAt
    if (typeof value !== "number") return "尚未形成长期记忆"
    return `最近更新：${new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value))}`
  })

  const scopeLabel = (scope: "user" | "shared" | "project") => {
    if (scope === "user") return "用户画像"
    if (scope === "shared") return "共享记忆"
    return "项目记忆"
  }

  const sourceLabel = (source: string) => {
    if (source === "user-correction") return "用户纠正"
    if (source === "legacy-markdown") return "旧版记忆迁移"
    return "小雪自动记忆"
  }

  const loadHistory = async (id: string) => {
    if (historyID() === id) {
      setHistoryID("")
      setHistoryEntries([])
      return
    }
    setHistoryID(id)
    setHistoryEntries([])
    setHistoryLoading(true)
    const result = await serverSdk()
      .client.config.xiaoxueMemoryHistory({ id })
      .then((response) => response.data)
      .catch(() => undefined)
    setHistoryLoading(false)
    if (!result) {
      setManageStatus("暂时无法读取版本历史，请确认主服务已更新。")
      return
    }
    setHistoryEntries([...result])
    setManageStatus("")
  }

  const reviseMemory = async (id: string) => {
    const content = editingValue().trim()
    if (!content) {
      setManageStatus("纠正后的记忆不能为空。")
      return
    }
    setManageStatus("正在保存纠正…")
    const result = await serverSdk()
      .client.config.xiaoxueMemoryUpdate({ id, content })
      .then((response) => response.data)
      .catch(() => undefined)
    if (!result?.success) {
      setManageStatus(result?.message ?? "暂时无法保存纠正，请确认主服务已更新。")
      return
    }
    setEditingID("")
    setEditingValue("")
    setHistoryID("")
    setHistoryEntries([])
    setManageStatus(result.message)
    void refreshOverview()
  }

  const restoreMemory = async (id: string, content: string) => {
    setManageStatus("正在恢复历史版本…")
    const result = await serverSdk()
      .client.config.xiaoxueMemoryUpdate({ id, content })
      .then((response) => response.data)
      .catch(() => undefined)
    if (!result?.success) {
      setManageStatus(result?.message ?? "暂时无法恢复历史版本，请确认主服务已更新。")
      return
    }
    setHistoryID("")
    setHistoryEntries([])
    setManageStatus("已将所选内容恢复为新的当前版本，原有版本仍可追溯。")
    void refreshOverview()
  }

  const forgetMemory = async (id: string) => {
    setManageStatus("正在忘记这条记忆…")
    const result = await serverSdk()
      .client.config.xiaoxueMemoryForget({ id })
      .then((response) => response.data)
      .catch(() => undefined)
    if (!result?.success) {
      setManageStatus(result?.message ?? "暂时无法忘记这条记忆，请确认主服务已更新。")
      return
    }
    setForgetID("")
    setManageStatus(result.message)
    void refreshOverview()
  }

  return (
    <div class="settings-v2-xiaoxue">
      <div class="settings-v2-section">
        <h2 class="settings-v2-section-title">小雪记忆</h2>
        <SettingsListV2>
          <SettingsRowV2
            title="自动记忆"
            description="从对话中提炼稳定事实，并根据当前问题优先召回相关内容；不保存系统指令、敏感提示词或大段原文。"
          >
            <Switch
              checked={memory().enabled !== false}
              onChange={(enabled) => {
                void update({ memory: { enabled } })
                if (enabled) void refreshOverview()
              }}
            />
          </SettingsRowV2>
        </SettingsListV2>

        <div class="settings-v2-xiaoxue-overview">
          <div class="settings-v2-xiaoxue-overview-header">
            <div>
              <div class="settings-v2-xiaoxue-overview-title">小雪记得的内容</div>
              <div class="settings-v2-xiaoxue-overview-description">
                {memory().enabled === false
                  ? "长期记忆已关闭，已有内容不会被删除。"
                  : overview.loading
                    ? "正在读取本机记忆…"
                    : `${memoryCount()} 条有效记忆 · ${memoryUpdatedAt()}`}
              </div>
            </div>
            <ButtonV2 size="small" variant="neutral" onClick={() => void refreshOverview()}>
              刷新
            </ButtonV2>
          </div>

          <Show
            when={!overviewFailed() && overview()?.entries.length}
            fallback={
              <div class="settings-v2-xiaoxue-empty">
                {overviewFailed()
                  ? "暂时无法读取记忆概览，请确认主服务正在运行。"
                  : "随着使用，小雪会在这里形成简洁、可纠正的记忆画像。"}
              </div>
            }
          >
            <div class="settings-v2-xiaoxue-memory-list">
              <For each={overview()?.entries.slice(0, 5)}>
                {(entry) => (
                  <div class="settings-v2-xiaoxue-memory-item">
                    <span class="settings-v2-xiaoxue-memory-scope">{scopeLabel(entry.scope)}</span>
                    <div class="settings-v2-xiaoxue-memory-body">
                      <Show
                        when={editingID() === entry.id}
                        fallback={
                          <div class="settings-v2-xiaoxue-memory-current">
                            <span class="settings-v2-xiaoxue-memory-content">{entry.content}</span>
                            <div class="settings-v2-xiaoxue-memory-actions">
                              <ButtonV2 size="small" variant="ghost-muted" onClick={() => void loadHistory(entry.id)}>
                                {historyID() === entry.id ? "收起历史" : "历史"}
                              </ButtonV2>
                              <ButtonV2
                                size="small"
                                variant="ghost"
                                onClick={() => {
                                  setEditingID(entry.id)
                                  setEditingValue(entry.content)
                                  setForgetID("")
                                  setManageStatus("")
                                }}
                              >
                                纠正
                              </ButtonV2>
                              <ButtonV2
                                size="small"
                                variant={forgetID() === entry.id ? "danger" : "ghost-muted"}
                                onClick={() => {
                                  if (forgetID() !== entry.id) {
                                    setForgetID(entry.id)
                                    setManageStatus("再次点击“确认忘记”后，这条记忆将停止参与召回。")
                                    return
                                  }
                                  void forgetMemory(entry.id)
                                }}
                              >
                                {forgetID() === entry.id ? "确认忘记" : "忘记"}
                              </ButtonV2>
                            </div>
                          </div>
                        }
                      >
                        <div class="settings-v2-xiaoxue-memory-editor">
                          <TextInputV2
                            value={editingValue()}
                            onChange={(event) => setEditingValue(event.currentTarget.value)}
                            aria-label="纠正记忆内容"
                          />
                          <div class="settings-v2-xiaoxue-memory-actions">
                            <ButtonV2 size="small" variant="neutral" onClick={() => void reviseMemory(entry.id)}>
                              保存纠正
                            </ButtonV2>
                            <ButtonV2
                              size="small"
                              variant="ghost-muted"
                              onClick={() => {
                                setEditingID("")
                                setEditingValue("")
                                setManageStatus("")
                              }}
                            >
                              取消
                            </ButtonV2>
                          </div>
                        </div>
                      </Show>
                      <Show when={historyID() === entry.id}>
                        <div class="settings-v2-xiaoxue-history">
                          <Show
                            when={!historyLoading()}
                            fallback={<div class="settings-v2-xiaoxue-history-empty">正在读取版本历史…</div>}
                          >
                            <Show
                              when={historyEntries().length}
                              fallback={<div class="settings-v2-xiaoxue-history-empty">暂无可显示的版本历史。</div>}
                            >
                              <For each={historyEntries()}>
                                {(version) => (
                                  <div class="settings-v2-xiaoxue-history-item">
                                    <div class="settings-v2-xiaoxue-history-meta">
                                      <span>
                                        v{version.version} · {sourceLabel(version.source)}
                                      </span>
                                      <span>
                                        {new Intl.DateTimeFormat("zh-CN", {
                                          month: "numeric",
                                          day: "numeric",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        }).format(new Date(version.updatedAt))}
                                      </span>
                                    </div>
                                    <div class="settings-v2-xiaoxue-history-content">{version.content}</div>
                                    <div class="settings-v2-xiaoxue-history-footer">
                                      <span>{version.status === "active" ? "当前版本" : "历史版本"}</span>
                                      <Show when={version.status !== "active"}>
                                        <ButtonV2
                                          size="small"
                                          variant="ghost"
                                          onClick={() => void restoreMemory(entry.id, version.content)}
                                        >
                                          恢复此版本
                                        </ButtonV2>
                                      </Show>
                                    </div>
                                  </div>
                                )}
                              </For>
                            </Show>
                          </Show>
                        </div>
                      </Show>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <Show when={manageStatus()}>
            <div class="settings-v2-xiaoxue-manage-status" role="status">
              {manageStatus()}
            </div>
          </Show>

          <div class="settings-v2-xiaoxue-scope-summary">
            <span>用户画像 {Number(overview()?.counts.user ?? 0)}</span>
            <span>共享记忆 {Number(overview()?.counts.shared ?? 0)}</span>
            <span>项目记忆 {Number(overview()?.counts.project ?? 0)}</span>
          </div>
          <div class="settings-v2-xiaoxue-privacy">
            记忆由小雪本机数据库独立管理，无需安装 Obsidian。你可以在对话中要求小雪查看、纠正或忘记某条记忆。
          </div>
        </div>
      </div>

      <div class="settings-v2-xiaoxue-advanced">
        <button
          type="button"
          class="settings-v2-xiaoxue-advanced-trigger"
          aria-expanded={advanced()}
          onClick={() => setAdvanced((value) => !value)}
        >
          <span>
            <strong>高级设置</strong>
            <small>记忆预算、外部知识归档与 Obsidian 集成</small>
          </span>
          <span aria-hidden="true">{advanced() ? "收起" : "展开"}</span>
        </button>

        <Show when={advanced()}>
          <div class="settings-v2-xiaoxue-advanced-content">
            <div class="settings-v2-section">
              <h3 class="settings-v2-section-title">记忆容量</h3>
              <SettingsListV2>
                <SettingsRowV2 title="总记忆预算" description="用户画像与长期记忆合计 token，推荐 6000。">
                  <div class="w-full sm:w-[220px]">
                    <TextInputV2
                      type="number"
                      value={String(memory().max_tokens ?? 6_000)}
                      onChange={(event) =>
                        void update({ memory: { max_tokens: number(event.currentTarget.value, 6_000) } })
                      }
                      aria-label="总记忆预算"
                    />
                  </div>
                </SettingsRowV2>
                <SettingsRowV2 title="用户画像预算" description="总预算中专门保留给稳定身份和偏好的 token。">
                  <div class="w-full sm:w-[220px]">
                    <TextInputV2
                      type="number"
                      value={String(memory().profile_tokens ?? 1_200)}
                      onChange={(event) =>
                        void update({ memory: { profile_tokens: number(event.currentTarget.value, 1_200) } })
                      }
                      aria-label="用户画像预算"
                    />
                  </div>
                </SettingsRowV2>
              </SettingsListV2>
            </div>

            <div class="settings-v2-section">
              <h3 class="settings-v2-section-title">外部知识归档（可选）</h3>
              <div class="settings-v2-xiaoxue-optional-note">
                Obsidian 只用于检索和归档知识。未安装、未连接或关闭它，都不会影响上方的小雪长期记忆。
              </div>
              <SettingsListV2>
                <SettingsRowV2
                  title="启用 Obsidian"
                  description="连接已有 Vault，作为可检索、可追溯的外部知识与任务归档层。"
                >
                  <Switch
                    checked={obsidian().enabled ?? integration()?.available ?? false}
                    onChange={(enabled) => void update({ obsidian: { enabled } })}
                  />
                </SettingsRowV2>
                <SettingsRowV2
                  title="闭环状态"
                  description={
                    vaultPath()
                      ? `Vault ${integration()?.available ? "可用" : "待验证"}；归档模式：${archiveMode().label}；伴侣插件：${integration()?.pluginInstalled || obsidian().companion_plugin ? "已安装" : "未安装"}`
                      : "尚未选择 Vault，Obsidian 搜索、读取和归档工具不会启用。"
                  }
                >
                  <span
                    class={
                      vaultPath() && (obsidian().enabled ?? integration()?.available) && integration()?.available
                        ? "text-green-11"
                        : "text-text-weak"
                    }
                  >
                    {vaultPath() && (obsidian().enabled ?? integration()?.available) && integration()?.available
                      ? "已连接"
                      : "未配置"}
                  </span>
                </SettingsRowV2>
                <SettingsRowV2
                  title="Vault 路径"
                  description="首次启动自动创建；有 D 盘时使用 D:\知识库，否则使用系统文档目录下的小雪知识库。"
                >
                  <div class="settings-v2-xiaoxue-vault-control">
                    <TextInputV2
                      value={vaultPath()}
                      onChange={(event) => void update({ obsidian: { vault_path: event.currentTarget.value } })}
                      placeholder="自动选择并创建"
                      aria-label="Obsidian Vault 路径"
                    />
                    <ButtonV2 size="small" variant="neutral" onClick={() => void pickVault()}>
                      选择
                    </ButtonV2>
                  </div>
                </SettingsRowV2>
                <SettingsRowV2 title="归档目录" description="必须是 Vault 内相对目录，默认写入智能体协作区。">
                  <div class="w-full sm:w-[420px]">
                    <TextInputV2
                      value={obsidian().archive_directory ?? "06-日常工作管理/智能体协作"}
                      onChange={(event) => void update({ obsidian: { archive_directory: event.currentTarget.value } })}
                      aria-label="Obsidian 归档目录"
                    />
                  </div>
                </SettingsRowV2>
                <SettingsRowV2
                  title="归档模式"
                  description="自动模式只生成待审核草稿；正式知识必须经过用户确认，且所有模式都拒绝覆盖已有笔记。"
                >
                  <SelectV2
                    appearance="inline"
                    options={archiveModes}
                    current={archiveMode()}
                    value={(option) => option.value}
                    label={(option) => option.label}
                    onSelect={(option) => option && void update({ obsidian: { archive_mode: option.value } })}
                  />
                </SettingsRowV2>
                <SettingsRowV2
                  title="排除目录"
                  description="逗号分隔的 Vault 相对路径或 Glob；始终建议排除 .obsidian 和 .git。"
                >
                  <div class="w-full sm:w-[420px]">
                    <TextInputV2
                      value={(obsidian().exclude_patterns ?? [".obsidian/**", ".git/**", ".trash/**"]).join(", ")}
                      onChange={(event) =>
                        void update({
                          obsidian: {
                            exclude_patterns: event.currentTarget.value
                              .split(",")
                              .map((item) => item.trim())
                              .filter(Boolean),
                          },
                        })
                      }
                      aria-label="Obsidian 排除目录"
                    />
                  </div>
                </SettingsRowV2>
                <SettingsRowV2
                  title="小雪 Obsidian 伴侣插件"
                  description={pluginStatus() || "可选安装；安装后仍需在 Obsidian 的社区插件页面手动启用。"}
                >
                  <ButtonV2
                    size="small"
                    variant="neutral"
                    disabled={!vaultPath() || !platform.installObsidianCompanion}
                    onClick={() => void installPlugin()}
                  >
                    安装插件
                  </ButtonV2>
                </SettingsRowV2>
              </SettingsListV2>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
