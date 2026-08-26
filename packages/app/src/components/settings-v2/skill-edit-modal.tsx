import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { createSignal, Show, type Component } from "solid-js"

type SkillEditModalProps = {
  initialName: string
  initialDescription: string
  onClose: () => void
  onSubmit: (name: string, description: string) => Promise<void>
}

export const SkillEditModal: Component<SkillEditModalProps> = (props) => {
  const [editName, setEditName] = createSignal(props.initialName)
  const [editDesc, setEditDesc] = createSignal(props.initialDescription)
  const [saving, setSaving] = createSignal(false)

  const handleSubmit = async () => {
    if (saving()) return
    setSaving(true)
    try {
      await props.onSubmit(editName(), editDesc())
      props.onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="settings-v2-modal-overlay" onClick={props.onClose}>
      <div class="settings-v2-modal" onClick={(e) => e.stopPropagation()}>
        <h3 class="settings-v2-modal-title">编辑 Skill</h3>
        <label class="settings-v2-modal-label">
          名称
          <input
            class="settings-v2-modal-input"
            type="text"
            value={editName()}
            onInput={(e) => setEditName(e.currentTarget.value)}
            placeholder="Skill 名称"
          />
        </label>
        <label class="settings-v2-modal-label">
          描述
          <textarea
            class="settings-v2-modal-textarea"
            value={editDesc()}
            onInput={(e) => setEditDesc(e.currentTarget.value)}
            placeholder="Skill 功能描述"
            rows={3}
          />
        </label>
        <div class="settings-v2-modal-actions">
          <ButtonV2 size="normal" variant="ghost-muted" onClick={props.onClose}>
            取消
          </ButtonV2>
          <ButtonV2 size="normal" variant="neutral" onClick={() => void handleSubmit()} disabled={saving()}>
            {saving() ? "保存中..." : "保存"}
          </ButtonV2>
        </div>
      </div>
    </div>
  )
}

