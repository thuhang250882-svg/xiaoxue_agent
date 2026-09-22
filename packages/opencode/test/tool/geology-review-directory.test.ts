import { expect, test } from "bun:test"
import { symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "../fixture/fixture"
import { resolveReviewDirectory } from "../../src/tool/geology-review-directory"

function messages(text: string, synthetic = false) {
  return [{ info: { role: "user" }, parts: [{ type: "text", text, synthetic }] }] as unknown as Parameters<
    typeof resolveReviewDirectory
  >[0]["messages"]
}

test("explicit directory chooses unique MDB and main report without mixing neighboring attachments", async () => {
  await using tmp = await tmpdir()
  for (const name of ["本井.mdb", "本井录井报告.docx", "邻井.xls"])
    await writeFile(path.join(tmp.path, name), "fixture")
  const result = await resolveReviewDirectory({
    directory: tmp.path,
    messages: messages(`审核 "${tmp.path}"`),
    loadReports: true,
  })
  expect(result.database?.name).toBe("本井.mdb")
  expect(result.reports.map((item) => item.name)).toEqual(["本井录井报告.docx"])
})

test("missing and synthetic user paths cannot authorize directory access", async () => {
  await using tmp = await tmpdir()
  for (const history of [
    messages("审核报告"),
    messages(`审核 "${tmp.path}"`, true),
    messages(`审核 "${tmp.path}-other"`),
  ]) {
    await expect(
      resolveReviewDirectory({ directory: tmp.path, messages: history, loadReports: false }),
    ).rejects.toThrow("用户")
  }
})

test("multiple MDBs require explicit selection and paths cannot escape the directory", async () => {
  await using tmp = await tmpdir()
  for (const name of ["a.mdb", "b.mdb"]) await writeFile(path.join(tmp.path, name), "fixture")
  const input = { directory: tmp.path, messages: messages(`审核 "${tmp.path}"`), loadReports: false }
  await expect(resolveReviewDirectory(input)).rejects.toThrow("明确选择")
  expect((await resolveReviewDirectory({ ...input, mdbFile: "b.mdb" })).database?.name).toBe("b.mdb")
  await expect(resolveReviewDirectory({ ...input, mdbFile: "../a.mdb" })).rejects.toThrow("明确选择")
})

test("multiple main report versions require a primary selection", async () => {
  await using tmp = await tmpdir()
  for (const name of ["a.mdb", "一版录井报告.docx", "二版录井报告.docx"])
    await writeFile(path.join(tmp.path, name), "fixture")
  const input = { directory: tmp.path, messages: messages(`审核 "${tmp.path}"`), loadReports: true }
  await expect(resolveReviewDirectory(input)).rejects.toThrow("明确指定")
  expect((await resolveReviewDirectory({ ...input, primaryReport: "二版录井报告.docx" })).reports).toHaveLength(1)
})

test("directory review remains available when no MDB is present", async () => {
  await using tmp = await tmpdir()
  await writeFile(path.join(tmp.path, "本井录井报告.docx"), "fixture")
  const result = await resolveReviewDirectory({
    directory: tmp.path,
    messages: messages(`审核 "${tmp.path}"`),
    loadReports: true,
  })
  expect(result.database).toBeUndefined()
  expect(result.reports.map((item) => item.name)).toEqual(["本井录井报告.docx"])
})

test("symlinked MDB cannot read outside the authorized directory", async () => {
  await using tmp = await tmpdir()
  await using outside = await tmpdir()
  const file = path.join(outside.path, "outside.mdb")
  await writeFile(file, "fixture")
  await symlink(outside.path, path.join(tmp.path, "link.mdb"), "junction")
  await expect(
    resolveReviewDirectory({ directory: tmp.path, messages: messages(`审核 "${tmp.path}"`), loadReports: false }),
  ).rejects.toThrow("目录外")
})
