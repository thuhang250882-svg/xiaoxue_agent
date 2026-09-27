import { For, Show, createSignal } from "solid-js"
import { Portal } from "solid-js/web"
import { usePlatform } from "@/context/platform"

export type OfficeArtifactResultData = {
  type: "office_artifact_result"
  filePath: string
  fileName: string
  fileType: "docx" | "xlsx" | "pptx" | "pdf"
  size: number
  modifiedAt?: number
  sha256?: string
  metadata: Record<string, unknown>
  paragraphs: Array<{ location: string; text: string; headingLevel?: number }>
  tables: Array<{ location: string; rows: string[][] }>
  annotations: Array<{ id: string; author: string; anchor: string; comment: string; date?: string }>
  truncated: boolean
}

export function OfficeArtifactPreview(props: {
  result: OfficeArtifactResultData
  onOpenFile?: (path: string) => void
}) {
  const platform = usePlatform()
  const [open, setOpen] = createSignal(false)
  const [view, setView] = createSignal<"document" | "annotations">("document")
  const label = () => ({ docx: "Word", xlsx: "Excel", pptx: "PowerPoint", pdf: "PDF" })[props.result.fileType]

  return (
    <>
      <section class="flex min-w-0 items-center justify-between gap-3 rounded-[8px] border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-4">
        <div class="min-w-0">
          <div class="truncate text-[14px] text-v2-text-text-base [font-weight:560]">{props.result.fileName}</div>
          <div class="text-[12px] text-v2-text-text-muted">
            {label()} 产物 · {formatSize(props.result.size)}
          </div>
        </div>
        <div class="flex shrink-0 gap-2">
          <Show when={platform.revealPath}>
            <button
              type="button"
              class="rounded-[6px] border border-v2-border-border-muted px-3 py-1.5 text-[12px] text-v2-text-text-base hover:bg-v2-background-bg-layer-02"
              onClick={() => void platform.revealPath?.(props.result.filePath)}
            >
              定位文件
            </button>
          </Show>
          <button
            type="button"
            class="rounded-[6px] border border-v2-border-border-muted px-3 py-1.5 text-[12px] text-v2-text-text-base hover:bg-v2-background-bg-layer-02"
            onClick={() => setOpen(true)}
          >
            预览文档
          </button>
          <button
            type="button"
            class="rounded-[6px] border border-v2-border-border-muted px-3 py-1.5 text-[12px] text-v2-text-text-base hover:bg-v2-background-bg-layer-02"
            onClick={() => props.onOpenFile?.(props.result.filePath)}
          >
            用本机应用打开
          </button>
        </div>
      </section>

      <Show when={open()}>
        <Portal>
          <button
            type="button"
            aria-label="关闭产物预览"
            class="fixed inset-0 z-[99] cursor-default bg-black/20"
            onClick={() => setOpen(false)}
          />
          <aside
            class="fixed inset-y-0 right-0 z-[100] flex w-[min(920px,96vw)] flex-col border-l border-v2-border-border-muted bg-v2-background-bg-base shadow-2xl"
            aria-label="文档预览"
          >
            <header class="flex items-start justify-between gap-4 border-b border-v2-border-border-muted px-5 py-4">
              <div class="min-w-0">
                <div class="truncate text-[15px] text-v2-text-text-base [font-weight:620]">{props.result.fileName}</div>
                <div class="mt-1 text-[12px] text-v2-text-text-muted">
                  {label()} 内容预览 · {formatSize(props.result.size)} · 非原版式
                  <Show when={props.result.modifiedAt}>
                    {` · ${formatDate(new Date(props.result.modifiedAt!).toISOString())}`}
                  </Show>
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  class="rounded-[6px] border border-v2-border-border-muted px-3 py-1.5 text-[12px] text-v2-text-text-base"
                  onClick={() => props.onOpenFile?.(props.result.filePath)}
                >
                  用本机应用打开
                </button>
                <button
                  type="button"
                  aria-label="关闭"
                  class="flex size-8 items-center justify-center rounded-[6px] text-[20px] text-v2-text-text-muted hover:bg-v2-background-bg-layer-02"
                  onClick={() => setOpen(false)}
                >
                  ×
                </button>
              </div>
            </header>
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-v2-border-border-muted px-5 py-2">
              <div class="flex gap-2" aria-label="预览内容">
                <button
                  type="button"
                  aria-pressed={view() === "document"}
                  class={`rounded-[6px] px-3 py-1.5 text-[12px] ${view() === "document" ? "bg-v2-background-bg-layer-02 text-v2-text-text-base" : "text-v2-text-text-muted"}`}
                  onClick={() => setView("document")}
                >
                  正文
                </button>
                <button
                  type="button"
                  aria-pressed={view() === "annotations"}
                  class={`rounded-[6px] px-3 py-1.5 text-[12px] ${view() === "annotations" ? "bg-v2-background-bg-layer-02 text-v2-text-text-base" : "text-v2-text-text-muted"}`}
                  onClick={() => setView("annotations")}
                >
                  批注（{props.result.annotations.length}）
                </button>
              </div>
              <span class="text-[11px] text-v2-text-text-muted">完整排版和图片请用本机应用打开</span>
            </div>
            <div
              class="min-w-0 truncate border-b border-v2-border-border-muted px-5 py-2 text-[11px] text-v2-text-text-muted"
              title={props.result.filePath}
            >
              保存位置：{props.result.filePath}
            </div>
            <div class="min-h-0 flex-1 overflow-y-auto bg-v2-background-bg-layer-02 px-4 py-5 sm:px-7">
              <Show when={props.result.truncated}>
                <div class="mb-3 rounded-[6px] border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-3 py-2 text-[11px] text-v2-text-text-muted">
                  文件较大，当前快照仅显示部分内容；完整内容和原始排版请打开原文件。
                </div>
              </Show>
              <Show
                when={view() === "document"}
                fallback={
                  <div class="mx-auto flex max-w-[794px] flex-col gap-3">
                    <For
                      each={props.result.annotations}
                      fallback={
                        <div class="rounded-[8px] bg-white p-6 text-[13px] text-slate-600">
                          此文档没有可提取的批注。
                        </div>
                      }
                    >
                      {(annotation) => (
                        <article class="rounded-[8px] border border-v2-border-border-muted bg-white p-5 text-slate-900">
                          <div class="mb-2 text-[12px] text-slate-500">
                            {annotation.author || "未知作者"}
                            <Show when={annotation.date}> · {formatDate(annotation.date!)}</Show>
                          </div>
                          <Show when={annotation.anchor}>
                            <div class="mb-2 border-l-2 border-slate-300 pl-3 text-[12px] text-slate-600">
                              标注原文：{annotation.anchor}
                            </div>
                          </Show>
                          <div class="whitespace-pre-wrap break-words text-[14px] leading-6">{annotation.comment}</div>
                        </article>
                      )}
                    </For>
                  </div>
                }
              >
                <article
                  class="mx-auto min-h-[900px] max-w-[794px] bg-white px-6 py-10 text-slate-900 shadow-sm sm:px-12 sm:py-14"
                  aria-label="提取的文档正文"
                >
                  <For each={props.result.paragraphs} fallback={<EmptyPreview />}>
                    {(paragraph) => (
                      <Show
                        when={paragraph.headingLevel}
                        fallback={
                          <p
                            class="mb-4 whitespace-pre-wrap break-words text-[15px] leading-[1.9]"
                            title={paragraph.location}
                          >
                            {paragraph.text}
                          </p>
                        }
                      >
                        <h2
                          class={`mb-5 mt-8 break-words font-semibold leading-[1.5] ${paragraph.headingLevel === 1 ? "text-[22px]" : "text-[18px]"}`}
                          title={paragraph.location}
                        >
                          {paragraph.text}
                        </h2>
                      </Show>
                    )}
                  </For>
                  <For each={props.result.tables}>
                    {(table) => (
                      <section class="mb-6 overflow-x-auto">
                        <div class="mb-2 text-[12px] text-slate-500">{table.location}</div>
                        <table class="w-full border-collapse text-[12px] text-slate-900">
                          <tbody>
                            <For each={table.rows}>
                              {(row) => (
                                <tr>
                                  <For each={row}>
                                    {(cell) => <td class="border border-slate-300 px-2 py-1.5">{cell}</td>}
                                  </For>
                                </tr>
                              )}
                            </For>
                          </tbody>
                        </table>
                      </section>
                    )}
                  </For>
                </article>
              </Show>
            </div>
          </aside>
        </Portal>
      </Show>
    </>
  )
}

function EmptyPreview() {
  return (
    <div class="rounded-[8px] border border-v2-border-border-muted p-4 text-[12px] text-v2-text-text-muted">
      该文件没有可提取的文本段落；此处不是原版式渲染，请打开原文件查看完整排版和媒体内容。
    </div>
  )
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("zh-CN", { hour12: false })
}
