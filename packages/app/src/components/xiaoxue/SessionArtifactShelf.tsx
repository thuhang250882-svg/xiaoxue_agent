import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { OfficeArtifactPreview, type OfficeArtifactResultData } from "./OfficeArtifactPreview"

export function SessionArtifactShelf(props: { sessionID: string; artifacts: OfficeArtifactResultData[] }) {
  const language = useLanguage()
  const platform = usePlatform()
  const [expanded, setExpanded] = createSignal(true)
  const [saved, setSaved] = createSignal<OfficeArtifactResultData[]>([])
  const artifacts = createMemo(() => [...new Map([...props.artifacts, ...saved()].map((item) => [item.filePath, item])).values()])
  createEffect(() => {
    const key = `xiaoxue:session-artifacts:${props.sessionID}`
    setSaved([])
    try {
      const stored = localStorage.getItem(key)
      if (stored) {
        const value: unknown = JSON.parse(stored)
        if (Array.isArray(value)) setSaved(value.filter(isSavedArtifact))
      }
    } catch {
      // Storage can be unavailable or contain an old invalid entry; tool results still render.
    }
    const onSaved = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      const detail = event.detail as { filePath?: string; fileName?: string }
      if (typeof detail.filePath !== "string" || typeof detail.fileName !== "string") return
      const fileType = detail.filePath.match(/\.(docx|xlsx|pptx|doc|xls|ppt|pdf|mdb|md)$/i)?.[1]?.toLowerCase()
      if (!fileType) return
      const artifact: OfficeArtifactResultData = {
        type: "office_artifact_result",
        filePath: detail.filePath,
        fileName: detail.fileName,
        fileType: fileType as OfficeArtifactResultData["fileType"],
        size: 0,
        metadata: {},
        paragraphs: [],
        tables: [],
        annotations: [],
        truncated: false,
      }
      const next = [...new Map([...saved(), artifact].map((item) => [item.filePath, item])).values()]
      setSaved(next)
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Keep the saved file visible for the current session even when storage is unavailable.
      }
    }
    window.addEventListener("xiaoxue:artifact-saved", onSaved)
    onCleanup(() => window.removeEventListener("xiaoxue:artifact-saved", onSaved))
  })

  return (
    <Show when={artifacts().length > 0}>
      <section class="shrink-0 border-t border-v2-border-border-muted bg-v2-background-bg-base px-3 py-2" aria-label={language.t("office.artifacts.title")}>
        <button type="button" class="mb-2 flex w-full items-center justify-between text-[12px] text-v2-text-text-base" onClick={() => setExpanded(!expanded())}>
          <span>{language.t("office.artifacts.count", { count: artifacts().length })}</span>
          <span>{expanded() ? language.t("office.artifacts.collapse") : language.t("office.artifacts.expand")}</span>
        </button>
        <Show when={expanded()}>
          <div class="grid max-h-[210px] grid-cols-1 gap-2 overflow-y-auto lg:grid-cols-2">
            <For each={artifacts()}>
              {(artifact) => <OfficeArtifactPreview result={artifact} onOpenFile={(path) => void platform.openPath?.(path)} />}
            </For>
          </div>
        </Show>
      </section>
    </Show>
  )
}

function isSavedArtifact(value: unknown): value is OfficeArtifactResultData {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  if (!("filePath" in value) || typeof value.filePath !== "string") return false
  if (!("fileName" in value) || typeof value.fileName !== "string") return false
  if (!("fileType" in value) || !["doc", "docx", "xls", "xlsx", "ppt", "pptx", "pdf", "mdb", "md"].includes(String(value.fileType))) return false
  if (!("paragraphs" in value) || !Array.isArray(value.paragraphs)) return false
  if (!("tables" in value) || !Array.isArray(value.tables)) return false
  if (!("annotations" in value) || !Array.isArray(value.annotations)) return false
  return /^[a-z]:[\\/]/i.test(value.filePath) || value.filePath.startsWith("/") || value.filePath.startsWith("\\\\")
}
