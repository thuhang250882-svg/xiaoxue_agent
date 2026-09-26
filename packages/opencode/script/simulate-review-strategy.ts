import { strict as assert } from "node:assert"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { Document, Packer, Paragraph } from "docx"
import { executeReviewStrategy } from "../src/tool/review-strategy"
import type { StrategyCard } from "../src/xiaoxue/review-strategy"

// Fabricated files only: no real report, network service, or model call.
async function docx(text: string) {
  return new Uint8Array(await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph(text)] }] })))
}

function userMessage(text: string, files: Array<{ name: string; data: Uint8Array }> = []) {
  return {
    info: { role: "user", sessionID: "simulated-session" },
    parts: [
      { type: "text", text },
      ...files.map((file) => ({
        type: "file",
        filename: file.name,
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        url: `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${Buffer.from(file.data).toString("base64")}`,
      })),
    ],
  } as unknown as SessionV1.WithParts
}

const directory = await mkdtemp(path.join(tmpdir(), "xiaoxue-personal-strategy-"))
try {
  const original = await docx("模拟井终孔井深 5000 m，正文与附表采用同一口径。")
  const revised = await docx("模拟井终孔井深 5001 m，正文与附表采用同一口径。")
  const files = [
    { name: "模拟原稿.docx", data: original },
    { name: "模拟人工定稿.docx", data: revised },
  ]
  const draft = {
    title: "模拟井深口径修订",
    problem: "终孔井深与核实记录不一致",
    before: "5000 m",
    after: "5001 m",
    rationale: "模拟人工复核后的修改",
    basis: "模拟审核记录第 1 条",
    reportType: "录井报告",
    section: "",
    region: "",
    scenario: "核对记录证明井深口径错误时",
    exception: "测深与垂深口径不同须另行复核",
    sourceFile: "模拟原稿.docx",
    sourceLocation: "模拟第一章",
  }

  const preview = await executeReviewStrategy(
    directory,
    {
      action: "preview",
      originalFileName: files[0].name,
      revisedFileName: files[1].name,
      draft,
    },
    [userMessage("请整理这次人工改稿的经验供我确认。", files)],
  )
  const candidate = preview.value as StrategyCard
  assert.equal(candidate.status, "proposed")
  const beforeConfirmation = await executeReviewStrategy(directory, { action: "search", reportType: "录井报告" }, [])
  assert.equal((beforeConfirmation.value as StrategyCard[]).length, 0)
  const pendingList = await executeReviewStrategy(directory, { action: "list" }, [])
  assert.equal((pendingList.value as StrategyCard[]).length, 0)

  let implicitSaveDenied = false
  try {
    await executeReviewStrategy(directory, { action: "save", id: candidate.id }, [
      userMessage("请先帮我看看修改是否正确。"),
    ])
  } catch {
    implicitSaveDenied = true
  }
  assert.equal(implicitSaveDenied, true)

  let attachedSaveDenied = false
  try {
    await executeReviewStrategy(directory, { action: "save", id: candidate.id }, [
      userMessage(`保存为审核经验 ${candidate.id}`, files),
    ])
  } catch {
    attachedSaveDenied = true
  }
  assert.equal(attachedSaveDenied, true)

  const saved = await executeReviewStrategy(directory, { action: "save", id: candidate.id }, [
    userMessage(`保存为审核经验 ${candidate.id}`),
  ])
  const card = saved.value as StrategyCard
  assert.equal(card.status, "approved")

  const found = await executeReviewStrategy(directory, { action: "search", reportType: "录井报告" }, [])
  assert.equal((found.value as StrategyCard[]).length, 1)
  const wrongType = await executeReviewStrategy(directory, { action: "search", reportType: "完井报告" }, [])
  assert.equal((wrongType.value as StrategyCard[]).length, 0)

  let implicitRemovalDenied = false
  try {
    await executeReviewStrategy(directory, { action: "remove", id: card.id }, [userMessage("这条经验要不要撤销？")])
  } catch {
    implicitRemovalDenied = true
  }
  assert.equal(implicitRemovalDenied, true)
  await executeReviewStrategy(directory, { action: "remove", id: card.id }, [userMessage(`撤销审核经验 ${card.id}`)])
  const afterRemoval = await executeReviewStrategy(directory, { action: "search", reportType: "录井报告" }, [])
  assert.equal((afterRemoval.value as StrategyCard[]).length, 0)

  process.stdout.write(
    JSON.stringify(
      {
        type: "personal_review_strategy_simulation",
        data: "synthetic-docx-only",
        candidateHiddenBeforeConfirmation: true,
        implicitSaveDenied,
        attachedSaveDenied,
        explicitSaveRecallable: true,
        wrongReportTypeExcluded: true,
        implicitRemovalDenied,
        explicitRemovalStopsRecall: true,
        modelCalls: 0,
        networkCalls: 0,
      },
      null,
      2,
    ) + "\n",
  )
} finally {
  await rm(directory, { recursive: true, force: true })
}
