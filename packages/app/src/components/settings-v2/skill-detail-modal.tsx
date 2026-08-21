import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Tag } from "@opencode-ai/ui/v2/badge-v2"
import { For, createSignal, onMount, Show, type Component } from "solid-js"
import type { SkillClient, SkillConflict, SkillDiagnostic, SkillHealth, SkillInfo } from "@/utils/skill-client"

type SkillDetailModalProps = {
  skill: SkillInfo
  skillClient?: Pick<SkillClient, "health" | "validate" | "conflicts">
  onClose: () => void
  onToggle?: () => void
  onEdit?: () => void
  onDelete?: () => void
}

const sourceLabel: Record<SkillInfo["source"], string> = {
  bundled: "随软件提供",
  user: "用户",
  project: "项目",
  remote: "远程",
  unknown: "未知",
}

const healthLabel: Record<SkillHealth, string> = {
  healthy: "正常",
  warning: "警告",
  error: "错误",
}

const healthClass: Record<SkillHealth, string> = {
  healthy: "settings-v2-skill-health-healthy",
  warning: "settings-v2-skill-health-warning",
  error: "settings-v2-skill-health-error",
}

export const SkillDetailModal: Component<SkillDetailModalProps> = (props) => {
  const isUserSkill = () => props.skill.capabilities.editable || props.skill.capabilities.removable
  const [health, setHealth] = createSignal<SkillHealth | null>(props.skill.health)
  const [diagnostics, setDiagnostics] = createSignal<SkillDiagnostic[]>(props.skill.diagnostics)
  const [conflict, setConflict] = createSignal<SkillConflict | null>(null)

  onMount(async () => {
    if (props.skillClient) {
      const [healthResult, diagnosticResult, conflictResult] = await Promise.allSettled([
        props.skillClient.health(props.skill.name),
        props.skillClient.validate(props.skill.name),
        props.skillClient.conflicts(),
      ])
      if (healthResult.status === "fulfilled") setHealth(healthResult.value)
      if (diagnosticResult.status === "fulfilled") setDiagnostics(diagnosticResult.value)
      setConflict(conflictResult.status === "fulfilled" ? conflictResult.value.find((item) => item.skill === props.skill.name) ?? null : null)
    }
  })

  return (
    <div class="settings-v2-modal-overlay" onClick={props.onClose}>
      <div class="settings-v2-modal settings-v2-skill-detail" onClick={(e) => e.stopPropagation()}>
        <div class="settings-v2-skill-detail-header">
          <div>
            <h3 class="settings-v2-modal-title">{props.skill.name}</h3>
            <div class="settings-v2-skill-detail-meta">
              <Tag>{sourceLabel[props.skill.source]}</Tag>
              <Show when={!props.skill.enabled}>
                <Tag class="settings-v2-skill-disabled">已禁用</Tag>
              </Show>
            </div>
          </div>
        </div>

        <div class="settings-v2-skill-detail-body">
          <div class="settings-v2-skill-detail-section">
            <div class="settings-v2-skill-detail-label">描述</div>
            <div class="settings-v2-skill-detail-value">{props.skill.description || "暂无描述"}</div>
          </div>

          <div class="settings-v2-skill-detail-section">
            <div class="settings-v2-skill-detail-label">文件位置</div>
            <div class="settings-v2-skill-detail-value settings-v2-skill-detail-location">{props.skill.location}</div>
          </div>

          <div class="settings-v2-skill-detail-grid">
            <div class="settings-v2-skill-detail-section">
              <div class="settings-v2-skill-detail-label">来源</div>
              <div class="settings-v2-skill-detail-value">{sourceLabel[props.skill.source]}</div>
            </div>
            <div class="settings-v2-skill-detail-section">
              <div class="settings-v2-skill-detail-label">启用状态</div>
              <div class="settings-v2-skill-detail-value">{props.skill.enabled ? "已启用" : "已禁用"}</div>
            </div>
          </div>

          <div class="settings-v2-skill-detail-grid">
            <div class="settings-v2-skill-detail-section">
              <div class="settings-v2-skill-detail-label">版本</div>
              <div class="settings-v2-skill-detail-value settings-v2-skill-detail-placeholder">未声明</div>
            </div>
            <div class="settings-v2-skill-detail-section">
              <div class="settings-v2-skill-detail-label">作者</div>
              <div class="settings-v2-skill-detail-value settings-v2-skill-detail-placeholder">未声明</div>
            </div>
          </div>

          <Show when={health()}>
            <div class="settings-v2-skill-detail-section">
              <div class="settings-v2-skill-detail-label">健康状态</div>
              <div class={`settings-v2-skill-detail-value ${healthClass[health()!]}`}>
                {healthLabel[health()!]}
              </div>
            </div>
          </Show>

          <Show when={diagnostics().length > 0}>
            <div class="settings-v2-skill-detail-section">
              <div class="settings-v2-skill-detail-label">诊断详情</div>
              <div class="settings-v2-skill-diagnostics">
                <For each={diagnostics()}>{(item) => <div data-level={item.level}><strong>[{item.code}]</strong> {item.message}</div>}</For>
              </div>
            </div>
          </Show>

          <Show when={conflict()}>
            {(item) => (
              <div class="settings-v2-skill-detail-section">
                <div class="settings-v2-skill-detail-label">来源解析</div>
                <div class="settings-v2-skill-diagnostics" data-level={item().severity}>
                  <div>{item().reason}</div>
                  <For each={item().candidates}>
                    {(candidate) => <div>{candidate.selected ? "当前选用" : "未选用"} · {sourceLabel[candidate.source]} · 优先级 {candidate.priority} · {candidate.location}</div>}
                  </For>
                </div>
              </div>
            )}
          </Show>

          <div class="settings-v2-skill-detail-section">
            <div class="settings-v2-skill-detail-label">支持的操作</div>
            <div class="settings-v2-skill-detail-capabilities">
              <Show when={props.skill.capabilities.enableable}>
                <Tag>启用/禁用</Tag>
              </Show>
              <Show when={props.skill.capabilities.editable}>
                <Tag>编辑</Tag>
              </Show>
              <Show when={props.skill.capabilities.removable}>
                <Tag>删除</Tag>
              </Show>
            </div>
          </div>
        </div>

        <div class="settings-v2-modal-actions">
          <Show when={props.skill.capabilities.enableable && props.onToggle}>
            <ButtonV2
              size="normal"
              variant="ghost-muted"
              icon={props.skill.enabled ? "pause" : "play"}
              onClick={props.onToggle}
            >
              {props.skill.enabled ? "禁用" : "启用"}
            </ButtonV2>
          </Show>
          <Show when={isUserSkill() && props.onEdit}>
            <ButtonV2 size="normal" variant="ghost-muted" icon="edit" onClick={props.onEdit}>
              编辑
            </ButtonV2>
          </Show>
          <Show when={isUserSkill() && props.onDelete}>
            <ButtonV2 size="normal" variant="ghost-muted" icon="delete" onClick={props.onDelete}>
              删除
            </ButtonV2>
          </Show>
          <div style={{ flex: "1" }} />
          <ButtonV2 size="normal" variant="neutral" onClick={props.onClose}>
            关闭
          </ButtonV2>
        </div>
      </div>
    </div>
  )
}
