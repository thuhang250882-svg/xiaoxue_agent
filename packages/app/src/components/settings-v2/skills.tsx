import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Tag } from "@opencode-ai/ui/v2/badge-v2"
import { For, Show, createResource, createSignal, createMemo, type Component } from "solid-js"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import { createSkillClient, normalizeSkillInfos, type SkillClientError, type SkillInfo } from "@/utils/skill-client"
import { SettingsListV2 } from "./parts/list"
import { SkillDetailModal } from "./skill-detail-modal"
import { SkillEditModal } from "./skill-edit-modal"
import { SkillImportModal } from "./skill-import-modal"
import { SkillsToolbar } from "./skills-toolbar"
import "./settings-v2.css"

type SkillItem = SkillInfo

const isCatalogOnly = (skill: SkillItem) => skill.diagnostics.some((item) => item.code === "SKILL_CATALOG_ONLY")

const sourceLabel: Record<SkillItem["source"], string> = {
  bundled: "随软件提供",
  user: "用户",
  project: "项目",
  remote: "远程",
  unknown: "未知",
}

const healthLabel: Record<SkillItem["health"], string> = {
  healthy: "正常",
  warning: "警告",
  error: "错误",
}

export const SettingsSkillsV2: Component = () => {
  const platform = usePlatform()
  const serverSdk = useServerSDK()
  const skillClient = () => createSkillClient(serverSdk().url, serverSdk().server.http)
  const [skills, { refetch }] = createResource(
    () => serverSdk().client.app.skills().then((result) => normalizeSkillInfos(result.data)),
    { initialValue: [] as SkillItem[] },
  )

  const [editTarget, setEditTarget] = createSignal<SkillItem | null>(null)
  const [editName, setEditName] = createSignal("")
  const [editDesc, setEditDesc] = createSignal("")
  const [detailTarget, setDetailTarget] = createSignal<SkillItem | null>(null)
  const [importOpen, setImportOpen] = createSignal(false)
  const [searchQuery, setSearchQuery] = createSignal("")
  const [filterMode, setFilterMode] = createSignal<"all" | "enabled" | "disabled">("all")

  const isUserSkill = (skill: SkillItem) => skill.capabilities.editable || skill.capabilities.removable

  const filteredSkills = createMemo(() => {
    const query = searchQuery().toLowerCase()
    const mode = filterMode()
    return skills().filter((skill) => {
      if (mode === "enabled" && !skill.enabled) return false
      if (mode === "disabled" && skill.enabled) return false
      const searchable = [
        skill.name,
        skill.description ?? "",
        skill.source,
        sourceLabel[skill.source],
        skill.health,
        healthLabel[skill.health],
        skill.enabled ? "enabled 已启用" : "disabled 已禁用",
      ].join(" ").toLowerCase()
      if (query && !searchable.includes(query)) return false
      return true
    })
  })

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

  const chooseImportFile = async () => {
    if (!platform.openAttachmentPickerDialog || !platform.getPathForFile) return undefined
    let selected: string | undefined
    await platform.openAttachmentPickerDialog(
      { title: "选择本地 Skill", multiple: false, extensions: ["skill", "md"] },
      async (file) => {
        selected = platform.getPathForFile?.(file)
      },
    )
    return selected
  }

  const openEdit = (skill: SkillItem) => {
    setEditTarget(skill)
    setEditName(skill.name)
    setEditDesc(skill.description ?? "")
  }

  const submitEdit = async () => {
    const target = editTarget()
    if (!target) return
    const name = editName().trim()
    const description = editDesc().trim()
    if (!name) {
      showToast({ title: "编辑失败", description: "Skill 名称不能为空" })
      return
    }
    try {
      await skillClient().update(target.name, {
        ...(name !== target.name ? { name } : {}),
        ...(description !== (target.description ?? "") ? { description } : {}),
      })
      showToast({ variant: "success", icon: "check", title: "Skill 已更新" })
      setEditTarget(null)
      await refresh()
    } catch (error: unknown) {
      const code = (error as SkillClientError)?.code
      const message = error instanceof Error ? error.message : String(error)
      showToast({ title: "编辑失败", description: code ? `[${code}] ${message}` : message })
    }
  }

  const handleDelete = async (skill: SkillItem) => {
    const confirmed = window.confirm(`确定要删除 Skill「${skill.name}」吗？此操作不可撤销。`)
    if (!confirmed) return
    try {
      await skillClient().remove(skill.name)
      showToast({ variant: "success", icon: "check", title: `Skill「${skill.name}」已删除` })
      await refresh()
    } catch (error: unknown) {
      const code = (error as SkillClientError)?.code
      const message = error instanceof Error ? error.message : String(error)
      showToast({ title: "删除失败", description: code ? `[${code}] ${message}` : message })
    }
  }

  const handleToggle = async (skill: SkillItem) => {
    if (!skill.capabilities.enableable) return
    try {
      const updated = skill.enabled
        ? await skillClient().disable(skill.name)
        : await skillClient().enable(skill.name)
      showToast({
        variant: "success",
        icon: "check",
        title: updated.enabled ? `已启用 ${updated.name}` : `已禁用 ${updated.name}`,
      })
      await refresh()
    } catch (error: unknown) {
      const code = (error as SkillClientError)?.code
      const message = error instanceof Error ? error.message : String(error)
      showToast({ title: skill.enabled ? "禁用失败" : "启用失败", description: code ? `[${code}] ${message}` : message })
    }
  }

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-skills-header">
        <div>
          <h2 class="settings-v2-tab-title">Skill 清单</h2>
          <p class="settings-v2-skills-summary">
            当前显示 {skills().length} 个 Skill，其中 {skills().filter((skill) => skill.enabled).length} 个已启用，
            {skills().filter(isCatalogOnly).length} 个为治理后保留但未随核心包启用。
          </p>
        </div>
        <div class="settings-v2-skills-actions">
          <ButtonV2 size="normal" variant="ghost-muted" icon="refresh" onClick={() => void refresh()}>
            刷新
          </ButtonV2>
          <ButtonV2 size="normal" variant="neutral" icon="folder" onClick={() => void openDirectory()} disabled={!platform.openSkillDirectory}>
            添加自己的 Skill
          </ButtonV2>
          <ButtonV2 size="normal" variant="contrast" icon="download" onClick={() => setImportOpen(true)}>
            安全导入
          </ButtonV2>
        </div>
      </div>
      <SkillsToolbar
        searchQuery={searchQuery()}
        filterMode={filterMode()}
        onSearchChange={setSearchQuery}
        onFilterChange={setFilterMode}
      />
      <div class="settings-v2-tab-body settings-v2-skills">
        <SettingsListV2>
          <Show when={!skills.loading} fallback={<div class="settings-v2-provider-empty">正在读取 Skill 清单…</div>}>
            <Show when={filteredSkills().length > 0} fallback={<div class="settings-v2-provider-empty">没有发现可用 Skill。</div>}>
              <For each={filteredSkills()}>
                {(skill) => (
                  <div class="settings-v2-skill-row" data-disabled={!skill.enabled}>
                    <div class="settings-v2-skill-copy" onClick={() => setDetailTarget(skill)}>
                      <div class="settings-v2-provider-main">
                        <span class="settings-v2-provider-name">{skill.name}</span>
                        <Tag>{isCatalogOnly(skill) ? "治理后保留" : sourceLabel[skill.source]}</Tag>
                        <Tag class={`settings-v2-skill-health-${skill.health}`}>{healthLabel[skill.health]}</Tag>
                        <Show when={!skill.enabled}>
                          <Tag class="settings-v2-skill-disabled">{isCatalogOnly(skill) ? "当前包未启用" : "已禁用"}</Tag>
                        </Show>
                      </div>
                      <p class="settings-v2-provider-description">{skill.description || "暂无说明"}</p>
                    </div>
                    <div class="settings-v2-skill-actions">
                      <Show when={skill.capabilities.enableable}>
                        <ButtonV2
                          size="small"
                          variant="ghost-muted"
                          icon={skill.enabled ? "pause" : "play"}
                          onClick={() => void handleToggle(skill)}
                        >
                          {skill.enabled ? "禁用" : "启用"}
                        </ButtonV2>
                      </Show>
                      <Show when={isUserSkill(skill)}>
                        <ButtonV2 size="small" variant="ghost-muted" icon="edit" onClick={() => openEdit(skill)}>
                          编辑
                        </ButtonV2>
                        <ButtonV2 size="small" variant="ghost-muted" icon="delete" onClick={() => void handleDelete(skill)}>
                          删除
                        </ButtonV2>
                      </Show>
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </Show>
        </SettingsListV2>
      </div>

      {/* Detail Skill Modal */}
      <Show when={detailTarget()}>
        <SkillDetailModal
          skill={detailTarget()!}
          skillClient={skillClient()}
          onClose={() => setDetailTarget(null)}
          onToggle={
            detailTarget()?.capabilities.enableable
              ? () => {
                  void handleToggle(detailTarget()!)
                  setDetailTarget(null)
                }
              : undefined
          }
          onEdit={
            isUserSkill(detailTarget()!)
              ? () => {
                  openEdit(detailTarget()!)
                  setDetailTarget(null)
                }
              : undefined
          }
          onDelete={
            isUserSkill(detailTarget()!)
              ? () => {
                  void handleDelete(detailTarget()!)
                  setDetailTarget(null)
                }
              : undefined
          }
        />
      </Show>

      {/* Edit Skill Modal */}
      <Show when={editTarget()}>
        <SkillEditModal
          initialName={editName()}
          initialDescription={editDesc()}
          onClose={() => setEditTarget(null)}
          onSubmit={async (name, description) => {
            const target = editTarget()
            if (!target) return
            await skillClient().update(target.name, { name, description })
            showToast({ variant: "success", icon: "check", title: `Skill「${name}」已更新` })
            setEditTarget(null)
            await refresh()
          }}
        />
      </Show>

      <Show when={importOpen()}>
        <SkillImportModal
          preview={(source) => skillClient().previewImport(source)}
          install={async (token) => {
            const installed = await skillClient().import(token)
            await refresh()
            showToast({ variant: "success", icon: "check", title: `Skill「${installed.name}」已安全导入` })
          }}
          chooseFile={platform.openAttachmentPickerDialog && platform.getPathForFile ? chooseImportFile : undefined}
          onClose={() => setImportOpen(false)}
        />
      </Show>
    </>
  )
}
