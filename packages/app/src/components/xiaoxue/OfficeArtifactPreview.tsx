import { For, Show, createEffect, createResource, createSignal, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { Portal } from "solid-js/web"
import { usePlatform } from "@/context/platform"
import { useLanguage } from "@/context/language"
import { showToast } from "@/utils/toast"

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
  const language = useLanguage()
  const [open, setOpen] = createSignal(false)
  const [view, setView] = createSignal<"document" | "annotations" | "edit">("document")
  const label = () => ({ docx: "Word", xlsx: "Excel", pptx: "PowerPoint", pdf: "PDF" })[props.result.fileType]
  const [file] = createResource(
    () => open() && view() === "document" && platform.readArtifactFile ? props.result.filePath : undefined,
    (path) => platform.readArtifactFile!(path),
  )
  const [pdfURL, setPdfURL] = createSignal<string>()
  const [sheets, setSheets] = createSignal<{ name: string; rows: string[][] }[]>([])
  const [sheetIndex, setSheetIndex] = createSignal(0)
  const [slides, setSlides] = createSignal<{ number: number; text: string[] }[]>([])
  let docxContainer: HTMLDivElement | undefined
  const [rendered, setRendered] = createSignal(false)
  createEffect(() => {
    const data = file()
    if (!data || props.result.fileType !== "pdf") return
    const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: "application/pdf" }))
    setPdfURL(url)
    onCleanup(() => {
      URL.revokeObjectURL(url)
      setPdfURL(undefined)
    })
  })
  createEffect(() => {
    const data = file()
    if (!data || props.result.fileType !== "docx" || !docxContainer) return
    setRendered(false)
    void import("docx-preview")
      .then((module) => module.renderAsync(data, docxContainer!, undefined, { breakPages: true, renderComments: true }))
      .then(() => setRendered(true))
      .catch((error: unknown) => showToast({
        title: language.t("office.preview.loadFailed"),
        description: error instanceof Error ? error.message : String(error),
      }))
  })
  createEffect(() => {
    const data = file()
    if (!data || props.result.fileType !== "xlsx") return
    void import("xlsx").then((module) => {
      const workbook = module.read(data, { type: "array" })
      setSheets(workbook.SheetNames.map((name) => ({
        name,
        rows: (module.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "" }) as unknown[][])
          .slice(0, 500)
          .map((row) => row.slice(0, 50).map(String)),
      })))
    }).catch((error: unknown) => showToast({
      title: language.t("office.preview.loadFailed"),
      description: error instanceof Error ? error.message : String(error),
    }))
  })
  createEffect(() => {
    const data = file()
    if (!data || props.result.fileType !== "pptx") return
    void import("jszip").then((module) => module.default.loadAsync(data)).then(async (zip) => {
      const pages = Object.keys(zip.files)
        .map((name) => ({ name, number: Number(name.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1]) }))
        .filter((page) => Number.isFinite(page.number))
        .sort((a, b) => a.number - b.number)
      setSlides(await Promise.all(pages.map(async (page) => ({
        number: page.number,
        text: [...(await zip.file(page.name)!.async("string")).matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
          .map((match) => decodeOfficeText(match[1])),
      }))))
    }).catch((error: unknown) => showToast({
      title: language.t("office.preview.loadFailed"),
      description: error instanceof Error ? error.message : String(error),
    }))
  })

  return (
    <>
      <section class="flex min-w-0 items-center justify-between gap-3 rounded-[8px] border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-4">
        <div class="min-w-0">
          <div class="truncate text-[14px] text-v2-text-text-base [font-weight:560]">{props.result.fileName}</div>
          <div class="text-[12px] text-v2-text-text-muted">
            {label()} {language.t("office.preview.artifact")} · {formatSize(props.result.size)}
          </div>
        </div>
        <div class="flex shrink-0 gap-2">
          <Show when={platform.revealPath}>
            <button
              type="button"
              class="rounded-[6px] border border-v2-border-border-muted px-3 py-1.5 text-[12px] text-v2-text-text-base hover:bg-v2-background-bg-layer-02"
              onClick={() => void platform.revealPath?.(props.result.filePath)}
            >
              {language.t("office.preview.reveal")}
            </button>
          </Show>
          <button
            type="button"
            class="rounded-[6px] border border-v2-border-border-muted px-3 py-1.5 text-[12px] text-v2-text-text-base hover:bg-v2-background-bg-layer-02"
            onClick={() => setOpen(true)}
          >
            {language.t("office.preview.open")}
          </button>
          <button
            type="button"
            class="rounded-[6px] border border-v2-border-border-muted px-3 py-1.5 text-[12px] text-v2-text-text-base hover:bg-v2-background-bg-layer-02"
            onClick={() => props.onOpenFile?.(props.result.filePath)}
          >
            {language.t("office.preview.openLocal")}
          </button>
        </div>
      </section>

      <Show when={open()}>
        <Portal>
          <button
            type="button"
            aria-label={language.t("office.preview.close")}
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
                  {language.t("office.preview.openLocal")}
                </button>
                <button
                  type="button"
                  aria-label={language.t("office.preview.close")}
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
                  {language.t("office.preview.document")}
                </button>
                <button
                  type="button"
                  aria-pressed={view() === "annotations"}
                  class={`rounded-[6px] px-3 py-1.5 text-[12px] ${view() === "annotations" ? "bg-v2-background-bg-layer-02 text-v2-text-text-base" : "text-v2-text-text-muted"}`}
                  onClick={() => setView("annotations")}
                >
                  {language.t("office.preview.annotations", { count: props.result.annotations.length })}
                </button>
                <Show when={props.result.fileType === "docx" && platform.readEditableDocx && platform.saveEditableDocx}>
                  <button
                    type="button"
                    aria-pressed={view() === "edit"}
                    class={`rounded-[6px] px-3 py-1.5 text-[12px] ${view() === "edit" ? "bg-v2-background-bg-layer-02 text-v2-text-text-base" : "text-v2-text-text-muted"}`}
                    onClick={() => setView("edit")}
                  >
                    {language.t("office.preview.editText")}
                  </button>
                </Show>
              </div>
              <span class="text-[11px] text-v2-text-text-muted">{language.t("office.preview.layoutHint")}</span>
            </div>
            <div
              class="min-w-0 truncate border-b border-v2-border-border-muted px-5 py-2 text-[11px] text-v2-text-text-muted"
              title={props.result.filePath}
            >
              {language.t("office.preview.location", { path: props.result.filePath })}
            </div>
            <div class="min-h-0 flex-1 overflow-y-auto bg-v2-background-bg-layer-02 px-4 py-5 sm:px-7">
              <Show when={props.result.truncated}>
                <div class="mb-3 rounded-[6px] border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-3 py-2 text-[11px] text-v2-text-text-muted">
                  文件较大，当前快照仅显示部分内容；完整内容和原始排版请打开原文件。
                </div>
              </Show>
              <Show when={view() === "edit"}>
                <DocxLocalEditor filePath={props.result.filePath} />
              </Show>
              <Show when={view() === "annotations"}>
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
              </Show>
              <Show when={view() === "document"}>
                <Show when={props.result.fileType === "pdf" && pdfURL()}>
                  <iframe src={pdfURL()} title={props.result.fileName} class="h-full min-h-[720px] w-full bg-white" />
                </Show>
                <Show when={props.result.fileType === "docx" && platform.readArtifactFile}>
                  <div ref={docxContainer} class="min-h-[720px] overflow-x-auto" classList={{ hidden: !rendered() }} />
                </Show>
                <Show when={props.result.fileType === "xlsx" && sheets().length > 0}>
                  <div class="overflow-auto rounded-lg bg-white text-slate-900">
                    <div class="sticky top-0 flex gap-1 border-b border-slate-200 bg-white p-2">
                      <For each={sheets()}>
                        {(sheet, index) => (
                          <button type="button" aria-pressed={sheetIndex() === index()} onClick={() => setSheetIndex(index())}
                            class="rounded px-2 py-1 text-[12px]" classList={{ "bg-blue-100 text-blue-800": sheetIndex() === index() }}>
                            {sheet.name}
                          </button>
                        )}
                      </For>
                    </div>
                    <table class="border-collapse text-[12px]">
                      <tbody><For each={sheets()[sheetIndex()]?.rows}>
                        {(row, index) => <tr><th class="sticky left-0 border border-slate-200 bg-slate-100 px-2 text-slate-500">{index() + 1}</th>
                          <For each={row}>{(cell) => <td class="min-w-20 border border-slate-200 px-2 py-1 whitespace-nowrap">{cell}</td>}</For>
                        </tr>}
                      </For></tbody>
                    </table>
                  </div>
                </Show>
                <Show when={props.result.fileType === "pptx" && slides().length > 0}>
                  <div class="mx-auto flex max-w-[860px] flex-col gap-5">
                    <For each={slides()}>{(slide) => (
                      <section class="aspect-video rounded-lg bg-white p-10 text-slate-900 shadow-sm">
                        <div class="mb-5 text-[11px] text-slate-500">{language.t("office.preview.slide", { index: slide.number })}</div>
                        <For each={slide.text}>{(line, index) => <p class={index() === 0 ? "mb-5 text-[24px] font-semibold" : "mb-3 text-[16px]"}>{line}</p>}</For>
                      </section>
                    )}</For>
                  </div>
                </Show>
                <Show when={
                  (props.result.fileType === "pdf" && !pdfURL()) ||
                  (props.result.fileType === "docx" && !rendered()) ||
                  (props.result.fileType === "xlsx" && sheets().length === 0) ||
                  (props.result.fileType === "pptx" && slides().length === 0)
                }>
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
              </Show>
            </div>
          </aside>
        </Portal>
      </Show>
    </>
  )
}

function DocxLocalEditor(props: { filePath: string }) {
  const platform = usePlatform()
  const language = useLanguage()
  const [document] = createResource(() => props.filePath, (path) => platform.readEditableDocx!(path))
  const [state, setState] = createStore({ edits: {} as Record<number, string>, saving: false, savedPath: "" })
  const changed = () => document()?.paragraphs.flatMap((paragraph) => {
    const text = state.edits[paragraph.index]
    return text !== undefined && text !== paragraph.text ? [{ index: paragraph.index, text }] : []
  }) ?? []
  const save = async () => {
    const source = document()
    const edits = changed()
    if (!source || !edits.length || state.saving) return
    setState("saving", true)
    await platform.saveEditableDocx!({ filePath: source.filePath, expectedSha256: source.sha256, edits })
      .then((result) => {
        setState("savedPath", result.filePath)
        window.dispatchEvent(new CustomEvent("xiaoxue:artifact-saved", { detail: result }))
        showToast({ title: language.t("office.preview.saved") })
      })
      .catch((error: unknown) => showToast({
        title: language.t("office.preview.saveFailed"),
        description: error instanceof Error ? error.message : String(error),
      }))
      .finally(() => setState("saving", false))
  }

  return (
    <div class="mx-auto flex max-w-[794px] flex-col gap-3">
      <div class="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-3 shadow-sm">
        <div class="text-[12px] leading-5 text-v2-text-text-muted">{language.t("office.preview.editLimit")}</div>
        <button
          type="button"
          disabled={!changed().length || state.saving}
          onClick={() => void save()}
          class="rounded-md bg-v2-background-bg-button-primary px-3 py-1.5 text-[12px] text-v2-text-text-on-primary disabled:opacity-40"
        >
          {state.saving ? language.t("office.preview.saving") : language.t("office.preview.saveCopy")}
        </button>
      </div>
      <Show when={state.savedPath}>
        <div class="flex flex-wrap items-center gap-3 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-3 text-[12px]">
          <span class="min-w-0 flex-1 truncate" title={state.savedPath}>{state.savedPath}</span>
          <button type="button" onClick={() => void platform.openPath?.(state.savedPath)}>{language.t("office.preview.openSaved")}</button>
          <button type="button" onClick={() => void platform.revealPath?.(state.savedPath)}>{language.t("office.preview.revealSaved")}</button>
        </div>
      </Show>
      <Show when={document.loading}>
        <div class="rounded-lg bg-white p-6 text-[12px] text-slate-500">{language.t("office.preview.loading")}</div>
      </Show>
      <Show when={document.error}>
        <div class="rounded-lg bg-white p-6 text-[12px] text-red-700">{String(document.error)}</div>
      </Show>
      <Show when={document()}>
        {(source) => (
          <article class="min-h-[900px] bg-white px-8 py-12 text-slate-900 shadow-sm sm:px-14">
            <For each={source().paragraphs}>
              {(paragraph) => (
                <textarea
                  rows={Math.max(1, Math.ceil(paragraph.text.length / 65))}
                  value={state.edits[paragraph.index] ?? paragraph.text}
                  onInput={(event) => setState("edits", paragraph.index, event.currentTarget.value)}
                  aria-label={language.t("office.preview.paragraph", { index: paragraph.index + 1 })}
                  class="mb-3 block w-full resize-y overflow-hidden border-b border-transparent bg-transparent py-1 text-[15px] leading-[1.9] outline-none hover:border-slate-200 focus:border-blue-500"
                />
              )}
            </For>
          </article>
        )}
      </Show>
    </div>
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

function decodeOfficeText(value: string) {
  return value.replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) =>
    ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" } as Record<string, string>)[entity] ?? entity,
  )
}
