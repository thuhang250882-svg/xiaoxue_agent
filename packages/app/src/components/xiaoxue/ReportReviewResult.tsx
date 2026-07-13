import { For, Show, createSignal } from "solid-js"
import { Icon } from "@opencode-ai/ui/v2/icon"

export type XiaoxueReviewSeverity = "高" | "中" | "低"

export type XiaoxueReviewIssue = {
  id: string
  type: string
  location: string
  originalText: string
  issue: string
  severity: XiaoxueReviewSeverity
  suggestion: string
  basis: string
  needHumanConfirm: boolean
}

export type XiaoxueReviewResult = {
  taskId: string
  fileName: string
  summary: {
    totalIssues: number
    highRiskCount: number
    mediumRiskCount: number
    lowRiskCount: number
    conclusion: string
  }
  issues: XiaoxueReviewIssue[]
}

export function ReportReviewResult(props: { result: XiaoxueReviewResult }) {
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({})
  const toggle = (id: string) => setExpanded((current) => ({ ...current, [id]: !current[id] }))

  return (
    <section class="flex min-w-0 flex-col gap-3 rounded-[8px] border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-4">
      <div class="flex min-w-0 flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div class="min-w-0 flex flex-col gap-1">
          <div class="text-[14px] leading-5 text-v2-text-text-base [font-weight:560]">报告审核结果</div>
          <div class="min-w-0 text-[12px] leading-5 text-v2-text-text-muted [font-weight:440]">
            {props.result.fileName} · {props.result.taskId}
          </div>
          <p class="m-0 text-[13px] leading-5 text-v2-text-text-base [font-weight:440]">
            {props.result.summary.conclusion}
          </p>
        </div>
        <div class="grid shrink-0 grid-cols-4 gap-2">
          <RiskCounter label="问题" value={props.result.summary.totalIssues} />
          <RiskCounter label="高" value={props.result.summary.highRiskCount} />
          <RiskCounter label="中" value={props.result.summary.mediumRiskCount} />
          <RiskCounter label="低" value={props.result.summary.lowRiskCount} />
        </div>
      </div>

      <div class="min-w-0 overflow-x-auto rounded-[8px] border border-v2-border-border-muted">
        <table class="w-full min-w-[760px] border-collapse text-left">
          <thead class="bg-v2-background-bg-layer-02 text-[12px] leading-4 text-v2-text-text-muted [font-weight:530]">
            <tr>
              <th class="px-3 py-2">编号</th>
              <th class="px-3 py-2">类型</th>
              <th class="px-3 py-2">位置</th>
              <th class="px-3 py-2">风险</th>
              <th class="px-3 py-2">问题</th>
              <th class="px-3 py-2">人工确认</th>
              <th class="w-10 px-3 py-2"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-v2-border-border-muted text-[12px] leading-5 text-v2-text-text-base [font-weight:440]">
            <For
              each={props.result.issues}
              fallback={
                <tr>
                  <td class="px-3 py-4 text-v2-text-text-muted" colSpan={7}>
                    未发现基础规则问题。
                  </td>
                </tr>
              }
            >
              {(issue) => (
                <>
                  <tr>
                    <td class="whitespace-nowrap px-3 py-2">{issue.id}</td>
                    <td class="whitespace-nowrap px-3 py-2">{issue.type}</td>
                    <td class="whitespace-nowrap px-3 py-2">{issue.location}</td>
                    <td class="whitespace-nowrap px-3 py-2">
                      <SeverityPill severity={issue.severity} />
                    </td>
                    <td class="max-w-[280px] px-3 py-2">{issue.issue}</td>
                    <td class="whitespace-nowrap px-3 py-2">{issue.needHumanConfirm ? "需要" : "不需要"}</td>
                    <td class="px-3 py-2">
                      <button
                        type="button"
                        class="flex size-7 items-center justify-center rounded-[6px] text-v2-icon-icon-muted hover:bg-v2-background-bg-layer-03 hover:text-v2-icon-icon-base"
                        aria-label="展开问题详情"
                        onClick={() => toggle(issue.id)}
                      >
                        <Icon name={expanded()[issue.id] ? "chevron-down" : "outline-chevron-down"} />
                      </button>
                    </td>
                  </tr>
                  <Show when={expanded()[issue.id]}>
                    <tr class="bg-v2-background-bg-layer-02">
                      <td class="px-3 py-3" colSpan={7}>
                        <IssueDetail issue={issue} />
                      </td>
                    </tr>
                  </Show>
                </>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </section>
  )
}

function RiskCounter(props: { label: string; value: number }) {
  return (
    <div class="min-w-[56px] rounded-[8px] border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-2 py-1.5 text-center">
      <div class="text-[14px] leading-5 text-v2-text-text-base [font-weight:620]">{props.value}</div>
      <div class="text-[11px] leading-4 text-v2-text-text-muted [font-weight:440]">{props.label}</div>
    </div>
  )
}

function SeverityPill(props: { severity: XiaoxueReviewSeverity }) {
  return (
    <span class="rounded-[999px] border border-v2-border-border-muted px-2 py-0.5 text-[11px] leading-4 text-v2-text-text-muted [font-weight:530]">
      {props.severity}
    </span>
  )
}

function IssueDetail(props: { issue: XiaoxueReviewIssue }) {
  return (
    <div class="grid min-w-0 gap-3 md:grid-cols-2">
      <DetailBlock title="原文" text={props.issue.originalText || "未定位到具体原文"} />
      <DetailBlock title="问题说明" text={props.issue.issue} />
      <DetailBlock title="修改建议" text={props.issue.suggestion} />
      <DetailBlock title="依据来源" text={props.issue.basis} />
    </div>
  )
}

function DetailBlock(props: { title: string; text: string }) {
  return (
    <div class="min-w-0 rounded-[6px] border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-3">
      <div class="mb-1 text-[11px] leading-4 text-v2-text-text-muted [font-weight:530]">{props.title}</div>
      <div class="whitespace-pre-wrap break-words text-[12px] leading-5 text-v2-text-text-base [font-weight:440]">{props.text}</div>
    </div>
  )
}