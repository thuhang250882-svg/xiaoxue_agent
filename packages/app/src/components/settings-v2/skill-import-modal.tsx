import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { For, Show, createSignal, type Component } from "solid-js"
import type { SkillImportPreview } from "@/utils/skill-client"

type SkillImportModalProps = {
  preview: (source: string) => Promise<SkillImportPreview>
  install: (token: string) => Promise<void>
  chooseFile?: () => Promise<string | undefined>
  onClose: () => void
}

const formatLabel: Record<SkillImportPreview["format"], string> = {
  markdown: "SKILL.md",
  directory: "Skill 目录",
  "skill-archive": ".skill 压缩包",
}

export const SkillImportModal: Component<SkillImportModalProps> = (props) => {
  const [source, setSource] = createSignal("")
  const [preview, setPreview] = createSignal<SkillImportPreview | null>(null)
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal("")

  const inspect = async () => {
    const value = source().trim()
    if (!value) {
      setError("请选择本地文件，或输入本地 Skill 目录路径。")
      return
    }
    setBusy(true)
    setError("")
    setPreview(null)
    try {
      setPreview(await props.preview(value))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const choose = async () => {
    const value = await props.chooseFile?.()
    if (value) {
      setSource(value)
      setPreview(null)
      setError("")
    }
  }

  const install = async () => {
    const result = preview()
    if (!result?.canInstall) return
    setBusy(true)
    setError("")
    try {
      await props.install(result.token)
      props.onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="settings-v2-modal-overlay" onClick={props.onClose}>
      <div class="settings-v2-modal settings-v2-skill-import" onClick={(event) => event.stopPropagation()}>
        <h3 class="settings-v2-modal-title">安全导入本地 Skill</h3>
        <p class="settings-v2-skills-summary">
          内容会先复制到隔离区并静态检查，不会执行其中的脚本或命令。仅支持本地 .skill、SKILL.md 或标准 Skill 目录，不支持 URL。
        </p>

        <label class="settings-v2-skill-import-source">
          <span>本地路径</span>
          <div>
            <input
              class="settings-v2-skills-search"
              value={source()}
              placeholder="选择文件，或粘贴本地 Skill 目录路径"
              onInput={(event) => {
                setSource(event.currentTarget.value)
                setPreview(null)
              }}
            />
            <Show when={props.chooseFile}>
              <ButtonV2 size="normal" variant="ghost-muted" icon="folder" onClick={() => void choose()}>
                选择文件
              </ButtonV2>
            </Show>
          </div>
        </label>

        <Show when={error()}>
          <div class="settings-v2-skill-import-error">{error()}</div>
        </Show>

        <Show when={preview()}>
          {(result) => (
            <div class="settings-v2-skill-import-preview">
              <div class="settings-v2-skill-detail-grid">
                <div><strong>{result().name}</strong><br />{result().description || "暂无描述"}</div>
                <div>{formatLabel[result().format]} · {result().fileCount} 个文件 · {(result().totalBytes / 1024).toFixed(1)} KB</div>
              </div>
              <div class="settings-v2-skill-import-hash">SHA-256：{result().sha256}</div>
              <Show when={result().conflicts.length > 0}>
                <div class="settings-v2-skill-import-error">
                  名称冲突：<For each={result().conflicts}>{(item) => <div>{item}</div>}</For>
                </div>
              </Show>
              <Show when={result().risks.length > 0} fallback={<div class="settings-v2-skill-import-safe">未发现静态安全风险。</div>}>
                <div class="settings-v2-skill-import-risks">
                  <For each={result().risks}>
                    {(risk) => (
                      <div data-level={risk.level}>
                        <strong>[{risk.code}]</strong> {risk.message}{risk.path ? `（${risk.path}）` : ""}
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          )}
        </Show>

        <div class="settings-v2-modal-actions">
          <ButtonV2 size="normal" variant="ghost-muted" onClick={props.onClose}>取消</ButtonV2>
          <Show when={!preview()}>
            <ButtonV2 size="normal" variant="contrast" disabled={busy()} onClick={() => void inspect()}>
              {busy() ? "正在检查…" : "复制到隔离区并检查"}
            </ButtonV2>
          </Show>
          <Show when={preview()}>
            <ButtonV2 size="normal" variant="contrast" disabled={busy() || !preview()?.canInstall} onClick={() => void install()}>
              {busy() ? "正在安装…" : "确认安装并刷新"}
            </ButtonV2>
          </Show>
        </div>
      </div>
    </div>
  )
}
