import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { SelectV2 } from "@opencode-ai/ui/v2/select-v2"
import { Switch } from "@opencode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { createMemo, createResource, createSignal } from "solid-js"
import { usePlatform } from "@/context/platform"
import { useServerSync } from "@/context/server-sync"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"

const archiveModes = [
  { value: "manual" as const, label: "仅响应明确归档指令" },
  { value: "confirm" as const, label: "确认后正式发布" },
  { value: "auto" as const, label: "自动生成待审核草稿" },
]

export function SettingsXiaoxueKnowledgeV2() {
  const platform = usePlatform()
  const serverSync = useServerSync()
  const [pluginStatus, setPluginStatus] = createSignal("")
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
  const archiveMode = createMemo(
    () => archiveModes.find((option) => option.value === (obsidian().archive_mode ?? "confirm")) ?? archiveModes[1],
  )

  const update = (value: {
    memory?: Record<string, unknown>
    obsidian?: Record<string, unknown>
  }) =>
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

  return (
    <div class="settings-v2-content">
      <div class="settings-v2-section">
        <h2 class="settings-v2-section-title">记忆与上下文</h2>
        <SettingsListV2>
          <SettingsRowV2 title="小雪长期记忆" description="跨会话保留用户画像、共享事实和当前项目记忆。">
            <Switch
              checked={memory().enabled !== false}
              onChange={(enabled) => void update({ memory: { enabled } })}
            />
          </SettingsRowV2>
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
        <h2 class="settings-v2-section-title">Obsidian 知识闭环</h2>
        <SettingsListV2>
          <SettingsRowV2
            title="启用 Obsidian"
            description="将 Vault 作为可检索、可追溯的长期知识与任务归档层。"
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
            <div class="flex items-center gap-2 w-full sm:w-[420px]">
              <TextInputV2
                class="flex-1"
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
                onChange={(event) =>
                  void update({ obsidian: { archive_directory: event.currentTarget.value } })
                }
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
          <SettingsRowV2 title="排除目录" description="逗号分隔的 Vault 相对路径或 Glob；始终建议排除 .obsidian 和 .git。">
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
  )
}
