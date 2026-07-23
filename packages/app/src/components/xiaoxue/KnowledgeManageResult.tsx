import { For } from "solid-js"

export type KnowledgeManageResultData = {
  type: "knowledge_manage_result"
  action: "import" | "update" | "list" | "remove"
  message: string
  records: Array<{
    id: string
    title: string
    category: string
    filePath: string
    fileType: string
    size: number
    paragraphCount: number
    tableCount: number
    version: number
    active: boolean
  }>
}

export function KnowledgeManageResult(props: {
  result: KnowledgeManageResultData
  onOpenFile?: (path: string) => void
}) {
  const action = { import: "导入结果", update: "更新结果", list: "资料清单", remove: "删除结果" }[props.result.action]
  return (
    <section class="flex min-w-0 flex-col gap-3 rounded-[8px] border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-4">
      <div>
        <div class="text-[14px] leading-5 text-v2-text-text-base [font-weight:560]">知识资料{action}</div>
        <div class="text-[12px] leading-5 text-v2-text-text-muted">{props.result.message}</div>
      </div>
      <div class="overflow-x-auto rounded-[8px] border border-v2-border-border-muted">
        <table class="w-full min-w-[680px] border-collapse text-left text-[12px]">
          <thead class="bg-v2-background-bg-layer-02 text-v2-text-text-muted">
            <tr><th class="px-3 py-2">资料 ID</th><th class="px-3 py-2">名称</th><th class="px-3 py-2">版本</th><th class="px-3 py-2">分类</th><th class="px-3 py-2">格式</th><th class="px-3 py-2">解析内容</th><th class="px-3 py-2">大小</th></tr>
          </thead>
          <tbody class="divide-y divide-v2-border-border-muted text-v2-text-text-base">
            <For each={props.result.records} fallback={<tr><td colSpan={7} class="px-3 py-4 text-v2-text-text-muted">知识库暂无已索引资料。</td></tr>}>
              {(record) => (
                <tr>
                  <td class="whitespace-nowrap px-3 py-2">{record.id}</td>
                  <td class="max-w-[240px] px-3 py-2"><button type="button" class="truncate text-left hover:underline" onClick={() => props.onOpenFile?.(record.filePath)}>{record.title}</button></td>
                  <td class="whitespace-nowrap px-3 py-2">V{record.version}{record.active ? "" : "（归档）"}</td>
                  <td class="whitespace-nowrap px-3 py-2">{record.category}</td>
                  <td class="whitespace-nowrap px-3 py-2">{record.fileType}</td>
                  <td class="whitespace-nowrap px-3 py-2">{record.paragraphCount} 段 / {record.tableCount} 表</td>
                  <td class="whitespace-nowrap px-3 py-2">{formatBytes(record.size)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </section>
  )
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
