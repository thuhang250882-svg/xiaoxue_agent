import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { createSignal, For, onMount, Show } from "solid-js"
import { ReportReviewResult } from "@/components/xiaoxue/ReportReviewResult"
import { useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import { packReviewResultToDocxBlob } from "../../../../document_engine/exporters/review_docx_exporter"
import type { ReviewResult } from "../../../../document_engine/review_result"

const BUSINESS_TASKS_METADATA_KEY = "xiaoxue_business_tasks"

type BusinessTask = {
  id: string
  sessionId: string
  taskType: string
  agent: string
  title: string
  status: "running" | "completed" | "failed"
  wellName?: string
  createdAt: string
  completedAt?: string
  sourceFiles: Array<{
    fileName: string
    mime?: string
    sourcePath?: string
    size?: number
    modifiedAt?: number
    sha256?: string
  }>
  resultType?: string
  result?: unknown
  score?: unknown
  exportedFiles: Array<{ fileName: string; filePath: string; format: string; size?: number }>
  error?: { message: string }
}

type HistoryRecord = { task: BusinessTask; metadata: Record<string, unknown> }

export default function ReviewHistoryPage() {
  const sdk = useServerSDK()
  const layout = useLayout()
  const platform = usePlatform()
  const [history, setHistory] = createSignal<HistoryRecord[]>([])
  const [selected, setSelected] = createSignal<ReviewResult>()
  const [loading, setLoading] = createSignal(true)

  const load = async () => {
    setLoading(true)
    try {
      const response = await sdk().client.session.list({
        directory: layout.home.selection().directory,
        roots: true,
        limit: 200,
      })
      const records = (response.data ?? [])
        .flatMap((session) =>
          readBusinessTasks(session.metadata).map((task) => ({
            task,
            metadata: session.metadata ?? {},
          })),
        )
        .filter((record) => record.task.status !== "failed")
        .sort((a, b) => Date.parse(b.task.createdAt) - Date.parse(a.task.createdAt))
        .slice(0, 50)
      setHistory(records)
    } catch (error) {
      showToast({
        variant: "error",
        title: "无法读取审核记录",
        description: error instanceof Error ? error.message : "桌面数据服务返回了未知错误。",
      })
    } finally {
      setLoading(false)
    }
  }

  onMount(() => void load())

  const viewResult = (task: BusinessTask) => {
    if (!isReviewResult(task.result)) {
      showToast({ title: "审核结果不可用", description: "该记录没有可重新打开的结构化 ReviewResult。" })
      return
    }
    setSelected(task.result)
  }

  const openSource = async (task: BusinessTask) => {
    const source = task.sourceFiles.find((file) => file.sourcePath)?.sourcePath
    if (!source || !platform.openPath) {
      showToast({ title: "原文件位置不可用", description: "记录中没有可访问的本地源文件路径。" })
      return
    }
    await platform.openPath(source)
  }

  const openExport = async (task: BusinessTask) => {
    const exported = task.exportedFiles.find((file) => file.format === "docx") ?? task.exportedFiles[0]
    if (!exported || !platform.openPath) {
      showToast({ title: "导出文件不存在", description: "该记录尚未保存导出文件，请从审核结果重新导出。" })
      return
    }
    await platform.openPath(exported.filePath)
  }

  // 历史附件重新授权：服务端不会静默信任历史路径，用户必须通过原生选择器
  // 重新选择源文件；登记新凭证后即可在会话中重新审核。Hash 不一致时提示文件已变化
  const reauthorize = async (task: BusinessTask) => {
    if (!platform.reauthorizeTrustedAttachment) {
      showToast({ title: "需要桌面环境", description: "重新授权只能在桌面应用中通过原生文件选择器完成。" })
      return
    }
    const sources = task.sourceFiles.filter((file) => !!file.sourcePath || !!file.fileName)
    if (sources.length === 0) {
      showToast({ title: "原文件信息缺失", description: "该记录没有可重新授权的源文件。" })
      return
    }
    let authorized = 0
    let changed = 0
    for (const source of sources) {
      const result = await platform
        .reauthorizeTrustedAttachment({
          fileName: source.fileName,
          originalPath: source.sourcePath,
          expectedSha256: source.sha256,
          extensions: extensionOf(source.fileName),
        })
        .catch(() => null)
      if (!result) continue
      authorized += 1
      if (result.unchanged === false) changed += 1
    }
    if (authorized === 0) return
    if (changed > 0) {
      showToast({
        title: "重新授权完成，但文件内容已变化",
        description: `${authorized} 个文件已重新授权。其中 ${changed} 个文件的 SHA-256 与审核时不一致，历史审核结果可能已过时，建议重新审核。`,
      })
      return
    }
    showToast({
      title: "重新授权完成",
      description: `${authorized} 个文件已重新授权，内容与审核时一致。现在可以在会话中重新发起审核。`,
    })
  }

  const reexport = async (record: HistoryRecord) => {
    if (!isReviewResult(record.task.result)) {
      showToast({ title: "无法重新导出", description: "该记录没有有效的结构化审核结果。" })
      return
    }
    try {
      const exported = await packReviewResultToDocxBlob(record.task.result)
      const url = URL.createObjectURL(exported.blob)
      const link = document.createElement("a")
      link.href = url
      link.download = exported.fileName
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      showToast({
        variant: "error",
        title: "重新导出 DOCX 失败",
        description: error instanceof Error ? error.message : "DOCX 打包过程返回了未知错误。",
      })
    }
  }
  const remove = async (record: HistoryRecord) => {
    if (!window.confirm(`确认删除“${record.task.title}”的审核历史记录吗？原始业务文件不会被删除。`)) return
    const tasks = readBusinessTasks(record.metadata).filter((task) => task.id !== record.task.id)
    try {
      await sdk().client.session.update({
        sessionID: record.task.sessionId,
        metadata: { ...record.metadata, [BUSINESS_TASKS_METADATA_KEY]: tasks },
      })
      setHistory((items) => items.filter((item) => item.task.id !== record.task.id))
      if (selected() === record.task.result) setSelected(undefined)
    } catch (error) {
      showToast({
        variant: "error",
        title: "删除审核记录失败",
        description: error instanceof Error ? error.message : "桌面数据服务返回了未知错误。",
      })
    }
  }

  return (
    <main class="m-2 min-h-0 flex-1 overflow-auto rounded-[8px] bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]">
      <div class="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-5 py-6 lg:px-8 lg:py-10">
        <header class="flex flex-wrap items-start justify-between gap-4 border-b border-v2-border-border-muted pb-5">
          <div>
            <h1 class="m-0 text-[18px] leading-6 text-v2-text-text-base [font-weight:600]">审核记录</h1>
            <p class="m-0 mt-1 text-[13px] leading-5 text-v2-text-text-muted">最近 50 条持久化记录，按审核时间倒序。</p>
          </div>
          <ButtonV2 variant="ghost-muted" size="normal" icon="reset" onClick={() => window.history.back()}>
            返回
          </ButtonV2>
        </header>

        <Show when={!loading()} fallback={<div class="py-10 text-center text-v2-text-text-muted">正在读取审核记录...</div>}>
          <Show when={history().length > 0} fallback={<EmptyState />}>
            <div class="flex flex-col gap-2">
              <For each={history()}>
                {(record) => (
                  <article class="rounded-[8px] border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-4">
                    <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div class="min-w-0">
                        <div class="truncate text-[14px] leading-5 text-v2-text-text-base [font-weight:560]">{record.task.title}</div>
                        <div class="mt-1 text-[12px] leading-5 text-v2-text-text-muted">
                          {formatDate(record.task.createdAt)} · {taskTypeLabel(record.task.taskType)}
                          {record.task.wellName ? ` · ${record.task.wellName}` : ""}
                        </div>
                      </div>
                      <div class="flex flex-wrap items-center gap-2">
                        <RiskCounts task={record.task} />
                        <ButtonV2 variant="neutral" size="small" icon="review" onClick={() => viewResult(record.task)}>查看结果</ButtonV2>
                        <ButtonV2 variant="neutral" size="small" icon="reset" onClick={() => void reauthorize(record.task)}>重新审核</ButtonV2>
                        <ButtonV2 variant="neutral" size="small" icon="folder" onClick={() => void openSource(record.task)}>打开原文件</ButtonV2>
                        <ButtonV2 variant="neutral" size="small" icon="outline-square-arrow" onClick={() => void openExport(record.task)}>打开导出文件</ButtonV2>
                        <ButtonV2 variant="neutral" size="small" icon="download" onClick={() => void reexport(record)}>重新导出 DOCX</ButtonV2>
                        <ButtonV2 variant="ghost-muted" size="small" icon="trash" onClick={() => void remove(record)}>删除记录</ButtonV2>
                      </div>
                    </div>
                    <Show when={record.task.status === "running"}>
                      <div class="mt-3 text-[12px] text-v2-text-text-muted">任务仍在执行中</div>
                    </Show>
                  </article>
                )}
              </For>
            </div>
          </Show>
        </Show>

        <Show when={selected()}>{(result) => <ReportReviewResult result={result()} />}</Show>
      </div>
    </main>
  )
}

function RiskCounts(props: { task: BusinessTask }) {
  const summary = isRecord(props.task.score) ? props.task.score : {}
  const total = numberValue(summary.totalIssues)
  const high = numberValue(summary.highRiskCount)
  const medium = numberValue(summary.mediumRiskCount)
  const low = numberValue(summary.lowRiskCount)
  return (
    <>
      <Count label="问题" value={total} />
      <Count label="高" value={high} />
      <Count label="中" value={medium} />
      <Count label="低" value={low} />
    </>
  )
}

function Count(props: { label: string; value: number }) {
  return <span class="rounded-[999px] border border-v2-border-border-muted px-2 py-1 text-[12px] leading-4 text-v2-text-text-muted">{props.label} {props.value}</span>
}

function EmptyState() {
  return <div class="rounded-[8px] border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-8 text-center text-v2-text-text-muted">暂无审核记录。完成地质录井报告审核后，记录会保存在这里。</div>
}

function readBusinessTasks(metadata: unknown): BusinessTask[] {
  if (!isRecord(metadata)) return []
  const tasks = metadata[BUSINESS_TASKS_METADATA_KEY]
  if (!Array.isArray(tasks)) return []
  return tasks.filter(isBusinessTask)
}

function isBusinessTask(value: unknown): value is BusinessTask {
  if (!isRecord(value)) return false
  return typeof value.id === "string" && typeof value.sessionId === "string" && typeof value.taskType === "string" && typeof value.title === "string" && typeof value.status === "string" && typeof value.createdAt === "string" && Array.isArray(value.sourceFiles) && Array.isArray(value.exportedFiles)
}

function isReviewResult(value: unknown): value is ReviewResult {
  if (!isRecord(value) || !isRecord(value.summary)) return false
  return typeof value.taskId === "string" && typeof value.fileName === "string" && Array.isArray(value.issues)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function taskTypeLabel(value: string) {
  return ({ geology_report_review: "地质报告审核", tender_review: "标书审核", contract_review: "合同审核", office_document: "办公材料" } as Record<string, string>)[value] ?? value
}

function extensionOf(fileName: string) {
  const index = fileName.lastIndexOf(".")
  return index === -1 ? undefined : [fileName.slice(index + 1).toLowerCase()]
}
