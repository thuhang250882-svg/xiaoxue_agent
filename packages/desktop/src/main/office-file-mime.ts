import { extname } from "node:path"

const OFFICE_MIME = new Map([
  [".doc", "application/msword"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".xls", "application/vnd.ms-excel"],
  [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
])

export function officeFileMime(path: string) {
  return OFFICE_MIME.get(extname(path).toLowerCase())
}
