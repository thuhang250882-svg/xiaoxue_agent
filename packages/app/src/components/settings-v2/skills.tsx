import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Tag } from "@opencode-ai/ui/v2/badge-v2"
import { For, Show, createResource, type Component } from "solid-js"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import "./settings-v2.css"

type SkillItem = {
  name: string
  description?: string
  location: string
}

export const SettingsSkillsV2: Component = () => {
  const platform = usePlatform()
  const serverSdk = useServerSDK()
  const [skills, { refetch }] = createResource(
    () => serverSdk().client.app.skills().then((result) => [...(result.data ?? [])] as SkillItem[]),
    { initialValue: [] as SkillItem[] },
  )

  const refresh = async () => {
    await serverSdk().client.global.dispose()
    await refetch()
  }

  const openDirectory = async () => {
    if (!platform.openSkillDirectory) return
    await platform
      .openSkillDirectory()
      .then((directory) =>
        showToast({
          variant: "success",
          icon: "folder",
          title: "已打开自定义 Skill 目录",
          description: `把包含 SKILL.md 的 Skill 文件夹放入 ${directory}，然后点击刷新。`,
        }),
      )
      .catch((error: unknown) =>
        showToast({ title: "无法打开 Skill 目录", description: error instanceof Error ? error.message : String(error) }),
      )
  }

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-skills-header">
        <div>
          <h2 class="settings-v2-tab-title">Skill 清单</h2>
          <p class="settings-v2-skills-summary">当前可用 {skills().length} 个 Skill。自定义 Skill 需要包含带 name 和 description 的 SKILL.md。</p>
        </div>
        <div class="settings-v2-skills-actions">
          <ButtonV2 size="normal" variant="ghost-muted" icon="refresh" onClick={() => void refresh()}>
            刷新
          </ButtonV2>
          <ButtonV2 size="normal" variant="neutral" icon="folder" onClick={() => void openDirectory()} disabled={!platform.openSkillDirectory}>
            添加自己的 Skill
          </ButtonV2>
        </div>
      </div>
      <div class="settings-v2-tab-body settings-v2-skills">
        <SettingsListV2>
          <Show when={!skills.loading} fallback={<div class="settings-v2-provider-empty">正在读取 Skill 清单…</div>}>
            <Show when={skills().length > 0} fallback={<div class="settings-v2-provider-empty">没有发现可用 Skill。</div>}>
              <For each={skills()}>
                {(skill) => (
                  <div class="settings-v2-skill-row">
                    <div class="settings-v2-skill-copy">
                      <div class="settings-v2-provider-main">
                        <span class="settings-v2-provider-name">{skill.name}</span>
                        <Tag>{skill.location.includes(".xiaoxue") ? "自定义" : "随软件提供"}</Tag>
                      </div>
                      <p class="settings-v2-provider-description">{skill.description || "暂无说明"}</p>
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </Show>
        </SettingsListV2>
      </div>
    </>
  )
}
