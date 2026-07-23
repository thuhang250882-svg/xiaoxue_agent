import { exportOfficeMaterialToDocx } from "../../document_engine"
import type { OfficeMaterialExportOptions } from "../../document_engine"
import type { OfficeTaskResult, OfficeTaskType } from "./types"

const TASK_TITLES: Record<OfficeTaskType, string> = {
  work_summary: "工作总结",
  work_report: "工作汇报",
  meeting_minutes: "会议纪要",
  rectification_list: "整改清单",
  work_plan: "工作计划",
  technical_plan: "技术方案",
  project_application: "项目申报材料",
  document_polish: "上报材料",
  table_summary: "数据汇总",
}
export type OfficeTaskDocxOptions = OfficeMaterialExportOptions & {
  title?: string
  recipient?: string
  author?: string
  date?: string
}

export function exportOfficeTaskResultToDocx(result: OfficeTaskResult, options?: OfficeTaskDocxOptions) {
  return exportOfficeMaterialToDocx(
    {
      title: options?.title ?? TASK_TITLES[result.taskType],
      content: result.content,
      recipient: options?.recipient,
      author: options?.author,
      date: options?.date,
    },
    options,
  )
}
