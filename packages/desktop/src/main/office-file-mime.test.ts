import { describe, expect, test } from "bun:test"
import { officeFileMime } from "./office-file-mime"

describe("desktop Office file MIME", () => {
  test("derives MIME from the full Windows path", () => {
    expect(officeFileMime("G:\\智能雪狼业务平台测试数据\\呼北2\\呼北2井录井报告.doc")).toBe(
      "application/msword",
    )
    expect(officeFileMime("G:\\data\\套管记录.docx")).toContain("wordprocessingml")
    expect(officeFileMime("G:\\data\\完井卡片.XLS")).toBe("application/vnd.ms-excel")
  })
})
