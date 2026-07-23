import { For, Show, createSignal, type JSX } from "solid-js"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { KnowledgeManageResult, type KnowledgeManageResultData } from "./KnowledgeManageResult"

type Severity = "high" | "medium" | "low"

export type KnowledgeSearchResultData = {
  type: "knowledge_search_result"
  query: string
  searchedFiles: number
  warnings: string[]
  hits: Array<{
    sourceId: string
    title: string
    category: string
    filePath: string
    location: string
    excerpt: string
    score: number
  }>
}

export type TenderReviewResultData = {
  type: "tender_review_result"
  taskId: string
  files: string[]
  summary: Record<"total" | Severity, number>
  requirements: Array<{
    id: string
    category: string
    location: string
    originalText: string
    severity: Severity
    responseSuggestion: string
    needHumanConfirm: boolean
  }>
  missingMaterials: string[]
  disclaimer: string
  exportedFile?: ExportedFile
}

export type ContractReviewResultData = {
  type: "contract_review_result"
  taskId: string
  fileName: string
  stance: "party_a" | "party_b" | "balanced"
  contractType?: string
  summary: Record<"total" | Severity, number>
  issues: Array<{
    id: string
    category: string
    location: string
    originalClause: string
    risk: string
    severity: Severity
    suggestion: string
    basis: string
    needHumanConfirm: boolean
  }>
  negotiation: { must: string[]; important: string[]; optional: string[] }
  disclaimer: string
  exportedFile?: ExportedFile
}

type ExportedFile = { filePath: string; fileName: string; format: "docx"; size: number }
export type XiaoxueBusinessResult =
  | KnowledgeSearchResultData
  | KnowledgeManageResultData
  | TenderReviewResultData
  | ContractReviewResultData

export function BusinessReviewResult(props: {
  result: XiaoxueBusinessResult
  onOpenFile?: (path: string) => void
}) {
  if (props.result.type === "knowledge_search_result") {
    return <KnowledgeResult result={props.result} onOpenFile={props.onOpenFile} />
  }
  if (props.result.type === "knowledge_manage_result") {
    return <KnowledgeManageResult result={props.result} onOpenFile={props.onOpenFile} />
  }
  if (props.result.type === "tender_review_result") {
    return <TenderResult result={props.result} onOpenFile={props.onOpenFile} />
  }
  return <ContractResult result={props.result} onOpenFile={props.onOpenFile} />
}

function KnowledgeResult(props: { result: KnowledgeSearchResultData; onOpenFile?: (path: string) => void }) {
  return (
    <ResultFrame title="企业知识查询" subtitle={`检索 ${props.result.searchedFiles} 个真实文件`}>
      <div class="text-[13px] leading-5 text-v2-text-text-base">查询：{props.result.query}</div>
      <div class="divide-y divide-v2-border-border-muted rounded-[8px] border border-v2-border-border-muted">
        <For
          each={props.result.hits}
          fallback={<div class="p-4 text-[12px] text-v2-text-text-muted">当前本地知识库中未找到可靠来源。</div>}
        >
          {(hit) => (
            <div class="flex min-w-0 flex-col gap-1.5 p-3">
              <div class="flex min-w-0 items-start justify-between gap-3">
                <button
                  type="button"
                  class="min-w-0 truncate text-left text-[13px] text-v2-text-text-base hover:underline [font-weight:560]"
                  onClick={() => props.onOpenFile?.(hit.filePath)}
                >
                  {hit.title}
                </button>
                <span class="shrink-0 text-[11px] text-v2-text-text-muted">{hit.location}</span>
              </div>
              <div class="break-words text-[12px] leading-5 text-v2-text-text-muted">{hit.excerpt}</div>
              <div class="truncate text-[11px] text-v2-text-text-muted">{hit.filePath}</div>
            </div>
          )}
        </For>
      </div>
      <For each={props.result.warnings}>{(warning) => <div class="text-[11px] text-v2-text-text-muted">{warning}</div>}</For>
    </ResultFrame>
  )
}

function TenderResult(props: { result: TenderReviewResultData; onOpenFile?: (path: string) => void }) {
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({})
  return (
    <ResultFrame title="标书审核结果" subtitle={props.result.files.join("、")} exportedFile={props.result.exportedFile} onOpenFile={props.onOpenFile}>
      <RiskSummary summary={props.result.summary} />
      <IssueTable
        rows={props.result.requirements.map((item) => ({
          id: item.id,
          category: item.category,
          location: item.location,
          severity: item.severity,
          summary: item.originalText,
          details: [["响应建议", item.responseSuggestion], ["人工确认", item.needHumanConfirm ? "需要" : "不需要"]],
        }))}
        expanded={expanded()}
        onToggle={(id) => setExpanded((current) => ({ ...current, [id]: !current[id] }))}
      />
      <Show when={props.result.missingMaterials.length}>
        <div class="text-[12px] leading-5 text-v2-text-text-muted">待补充：{props.result.missingMaterials.join("；")}</div>
      </Show>
      <Disclaimer text={props.result.disclaimer} />
    </ResultFrame>
  )
}

function ContractResult(props: { result: ContractReviewResultData; onOpenFile?: (path: string) => void }) {
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({})
  const stance = { party_a: "甲方", party_b: "乙方", balanced: "平衡审查" }[props.result.stance]
  return (
    <ResultFrame title="合同审核结果" subtitle={`${props.result.fileName} · 我方立场：${stance}`} exportedFile={props.result.exportedFile} onOpenFile={props.onOpenFile}>
      <RiskSummary summary={props.result.summary} />
      <IssueTable
        rows={props.result.issues.map((item) => ({
          id: item.id,
          category: item.category,
          location: item.location,
          severity: item.severity,
          summary: item.risk,
          details: [["合同原文", item.originalClause || "未识别到对应条款"], ["修改建议", item.suggestion], ["依据", item.basis]],
        }))}
        expanded={expanded()}
        onToggle={(id) => setExpanded((current) => ({ ...current, [id]: !current[id] }))}
      />
      <div class="text-[12px] leading-5 text-v2-text-text-muted">必须争取 {props.result.negotiation.must.length} 项，重点争取 {props.result.negotiation.important.length} 项。</div>
      <Disclaimer text={props.result.disclaimer} />
    </ResultFrame>
  )
}

function ResultFrame(props: {
  title: string
  subtitle: string
  children: JSX.Element
  exportedFile?: ExportedFile
  onOpenFile?: (path: string) => void
}) {
  return (
    <section class="flex min-w-0 flex-col gap-3 rounded-[8px] border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-4">
      <div class="flex min-w-0 items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-[14px] leading-5 text-v2-text-text-base [font-weight:560]">{props.title}</div>
          <div class="truncate text-[12px] leading-5 text-v2-text-text-muted">{props.subtitle}</div>
        </div>
        <Show when={props.exportedFile}>
          {(file) => (
            <button type="button" class="shrink-0 text-[12px] text-v2-text-text-base hover:underline" onClick={() => props.onOpenFile?.(file().filePath)}>
              打开 DOCX
            </button>
          )}
        </Show>
      </div>
      {props.children}
    </section>
  )
}

function RiskSummary(props: { summary: Record<"total" | Severity, number> }) {
  return (
    <div class="grid grid-cols-4 gap-2">
      <RiskCounter label="总计" value={props.summary.total} />
      <RiskCounter label="高" value={props.summary.high} />
      <RiskCounter label="中" value={props.summary.medium} />
      <RiskCounter label="低" value={props.summary.low} />
    </div>
  )
}

function RiskCounter(props: { label: string; value: number }) {
  return <div class="rounded-[8px] border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-2 py-1.5 text-center"><div class="text-[14px] text-v2-text-text-base [font-weight:620]">{props.value}</div><div class="text-[11px] text-v2-text-text-muted">{props.label}</div></div>
}

function IssueTable(props: {
  rows: Array<{ id: string; category: string; location: string; severity: Severity; summary: string; details: string[][] }>
  expanded: Record<string, boolean>
  onToggle: (id: string) => void
}) {
  return (
    <div class="overflow-x-auto rounded-[8px] border border-v2-border-border-muted">
      <table class="w-full min-w-[720px] border-collapse text-left text-[12px]">
        <thead class="bg-v2-background-bg-layer-02 text-v2-text-text-muted"><tr><th class="px-3 py-2">编号</th><th class="px-3 py-2">类型</th><th class="px-3 py-2">位置</th><th class="px-3 py-2">风险</th><th class="px-3 py-2">说明</th><th class="w-10 px-3 py-2"></th></tr></thead>
        <tbody class="divide-y divide-v2-border-border-muted text-v2-text-text-base">
          <For each={props.rows} fallback={<tr><td colSpan={6} class="px-3 py-4 text-v2-text-text-muted">未发现结构化问题。</td></tr>}>
            {(row) => <><tr><td class="whitespace-nowrap px-3 py-2">{row.id}</td><td class="whitespace-nowrap px-3 py-2">{row.category}</td><td class="px-3 py-2">{row.location}</td><td class="whitespace-nowrap px-3 py-2"><SeverityPill severity={row.severity} /></td><td class="max-w-[300px] px-3 py-2">{row.summary}</td><td class="px-3 py-2"><button type="button" class="flex size-7 items-center justify-center" aria-label="展开详情" onClick={() => props.onToggle(row.id)}><Icon name="outline-chevron-down" /></button></td></tr><Show when={props.expanded[row.id]}><tr class="bg-v2-background-bg-layer-02"><td colSpan={6} class="px-3 py-3"><div class="grid gap-3 md:grid-cols-2"><For each={row.details}>{(detail) => <div><div class="text-[11px] text-v2-text-text-muted">{detail[0]}</div><div class="whitespace-pre-wrap break-words text-[12px] leading-5">{detail[1]}</div></div>}</For></div></td></tr></Show></>}
          </For>
        </tbody>
      </table>
    </div>
  )
}

function SeverityPill(props: { severity: Severity }) {
  const label = { high: "高", medium: "中", low: "低" }[props.severity]
  return <span class="rounded-[999px] border border-v2-border-border-muted px-2 py-0.5 text-[11px] text-v2-text-text-muted">{label}</span>
}

function Disclaimer(props: { text: string }) {
  return <div class="border-t border-v2-border-border-muted pt-2 text-[11px] leading-5 text-v2-text-text-muted">{props.text}</div>
}
