import { For, Show, createMemo, createSignal } from "solid-js"
import { Portal } from "solid-js/web"

export type OfficeArtifactResultData = {
  type: "office_artifact_result"
  filePath: string
  fileName: string
  fileType: "docx" | "xlsx" | "pptx" | "pdf"
  size: number
  modifiedAt?: number
  sha256?: string
  metadata: Record<string, unknown>
  paragraphs: Array<{ location: string; text: string }>
  tables: Array<{ location: string; rows: string[][] }>
  annotations: Array<{ id: string; author: string; anchor: string; comment: string; date?: string }>
  truncated: boolean
}

export function OfficeArtifactPreview(props: {
  result: OfficeArtifactResultData
  onOpenFile?: (path: string) => void
}) {
  const [open, setOpen] = createSignal(false)
  const sections = createMemo(() => {
    const grouped = new Map<string, string[]>()
    props.result.paragraphs.forEach((paragraph) => {
      grouped.set(paragraph.location, [...(grouped.get(paragraph.location) ?? []), paragraph.text])
    })
    return [...grouped].map(([location, paragraphs]) => ({ location, paragraphs }))
  })
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
          <button
            type="button"
            class="rounded-[6px] border border-v2-border-border-muted px-3 py-1.5 text-[12px] text-v2-text-text-base hover:bg-v2-background-bg-layer-02"
            onClick={() => setOpen(true)}
          >
            查看内容快照
          </button>
          <button
            type="button"
            class="rounded-[6px] border border-v2-border-border-muted px-3 py-1.5 text-[12px] text-v2-text-text-base hover:bg-v2-background-bg-layer-02"
            onClick={() => props.onOpenFile?.(props.result.filePath)}
          >
            打开原文件
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
          <aside class="fixed inset-y-0 right-0 z-[100] flex w-[min(680px,94vw)] flex-col border-l border-v2-border-border-muted bg-v2-background-bg-base shadow-2xl">
            <header class="flex items-start justify-between gap-4 border-b border-v2-border-border-muted px-5 py-4">
              <div class="min-w-0">
                <div class="truncate text-[15px] text-v2-text-text-base [font-weight:620]">{props.result.fileName}</div>
                <div class="mt-1 text-[12px] text-v2-text-text-muted">
                  {label()} 结构化内容快照 · 非原版式
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
            <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <Show when={props.result.truncated}>
                <div class="mb-3 rounded-[6px] border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-3 py-2 text-[11px] text-v2-text-text-muted">
                  文件较大，当前快照仅显示部分内容；完整内容和原始排版请打开原文件。
                </div>
              </Show>
              <div class="flex flex-col gap-3">
                <Show when={props.result.annotations.length > 0}>
                  <section class="rounded-[8px] border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-4">
                    <div class="mb-3 flex items-center justify-between gap-3">
                      <div class="text-[13px] text-v2-text-text-base [font-weight:620]">批注信息</div>
                      <div class="text-[11px] text-v2-text-text-muted">共 {props.result.annotations.length} 条</div>
                    </div>
                    <div class="flex flex-col gap-3">
                      <For each={props.result.annotations}>
                        {(annotation) => (
                          <article class="rounded-[6px] border border-v2-border-border-muted bg-v2-background-bg-layer-02 p-3">
                            <div class="mb-1 text-[11px] text-v2-text-text-muted">
                              {annotation.author || "未知作者"}
                              <Show when={annotation.date}> · {formatDate(annotation.date!)}</Show>
                            </div>
                            <Show when={annotation.anchor}>
                              <div class="mb-1 break-words text-[12px] text-v2-text-text-muted">
                                标注原文：{annotation.anchor}
                              </div>
                            </Show>
                            <div class="whitespace-pre-wrap break-words text-[13px] leading-5 text-v2-text-text-base">
                              {annotation.comment}
                            </div>
                          </article>
                        )}
                      </For>
                    </div>
                  </section>
                </Show>
                <For each={sections()} fallback={<EmptyPreview />}>
                  {(section) => (
                    <section class="rounded-[8px] border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-4">
                      <div class="mb-2 text-[12px] text-v2-text-text-muted [font-weight:560]">{section.location}</div>
                      <For each={section.paragraphs}>
                        {(paragraph) => (
                          <p class="m-0 mb-2 whitespace-pre-wrap break-words text-[13px] leading-6 text-v2-text-text-base last:mb-0">
                            {paragraph}
                          </p>
                        )}
                      </For>
                    </section>
                  )}
                </For>
                <For each={props.result.tables}>
                  {(table) => (
                    <section class="rounded-[8px] border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-4">
                      <div class="mb-2 text-[12px] text-v2-text-text-muted [font-weight:560]">{table.location}</div>
                      <div class="overflow-x-auto">
                        <table class="w-full border-collapse text-[12px] text-v2-text-text-base">
                          <tbody>
                            <For each={table.rows}>
                              {(row) => (
                                <tr>
                                  <For each={row}>
                                    {(cell) => <td class="border border-v2-border-border-muted px-2 py-1.5">{cell}</td>}
                                  </For>
                                </tr>
                              )}
                            </For>
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}
                </For>
              </div>
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
