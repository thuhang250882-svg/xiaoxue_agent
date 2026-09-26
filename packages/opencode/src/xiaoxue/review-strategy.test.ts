import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { strategyStore, type StrategyDraft } from "./review-strategy"

const draft: StrategyDraft = {
  title: "井深口径统一",
  problem: "正文与附表井深口径不一致",
  before: "终孔井深 5000 m",
  after: "终孔井深 5001 m",
  rationale: "核对原始记录后统一到测深口径",
  basis: "人工审核记录第 3 条",
  reportType: "录井报告",
  section: "",
  region: "",
  scenario: "终孔井深跨正文附表不一致时",
  exception: "若附表标注垂深则不得直接替换",
  sourceFile: "测试井录井报告.docx",
  sourceHash: "a".repeat(64),
  sourceLocation: "第一章 1.2",
  revisedFile: "测试井录井报告-人工定稿.docx",
  revisedHash: "b".repeat(64),
  evidenceStatus: "verified",
}

describe("review strategy store", () => {
  test("personal preview stays hidden until saved, then supports correction and undo", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "review-strategy-"))
    try {
      const store = await strategyStore(directory)
      try {
        const preview = store.propose(draft)
        expect(store.propose(draft).id).toBe(preview.id)
        const corrected = store.propose({ ...draft, exception: "仅适用于测深，垂深另行核对" })
        expect(corrected.id).not.toBe(preview.id)
        expect(corrected.exception).toBe("仅适用于测深，垂深另行核对")
        expect(store.search({ reportType: "录井报告" })).toEqual([])
        const first = store.decide(preview.id, "approved", "本机用户")
        expect(store.decide(preview.id, "approved", "本机用户").id).toBe(first.id)
        expect(first.status).toBe("approved")
        expect(store.search({ reportType: "录井报告" }).map((card) => card.id)).toEqual([first.id])
        const revision = store.propose({ ...draft, after: "终孔井深 5002 m", supersedes: first.id })
        const revised = store.decide(revision.id, "approved", "本机用户")
        expect(revised.version).toBe(2)
        expect(store.read(first.id)?.status).toBe("superseded")
        expect(store.search({ reportType: "录井报告" }).map((card) => card.id)).toEqual([revised.id])
        store.retire(revised.id, "本机用户")
        expect(store.retire(revised.id, "本机用户").status).toBe("retired")
        expect(store.search({ reportType: "录井报告" })).toEqual([])
      } finally {
        store.close()
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("only approved cards are recalled and scoped fields must match", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "review-strategy-"))
    try {
      const store = await strategyStore(directory)
      try {
        const pending = store.propose({ ...draft, region: "准噶尔盆地" })
        expect(store.search({ reportType: "录井报告", region: "准噶尔盆地" })).toEqual([])
        expect(store.search({ reportType: "录井报告" })).toEqual([])
        const approved = store.decide(pending.id, "approved", "审核员甲")
        expect(approved.version).toBe(1)
        expect(store.search({ reportType: "录井报告" })).toEqual([])
        expect(store.search({ reportType: "录井报告", region: "准噶尔盆地" }).map((card) => card.id)).toEqual([
          pending.id,
        ])
        expect(store.search({ reportType: "完井报告", region: "准噶尔盆地" })).toEqual([])
      } finally {
        store.close()
      }
      const reopened = await strategyStore(directory)
      try {
        expect(reopened.list("approved")).toHaveLength(1)
      } finally {
        reopened.close()
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("replacement requires approval and supersedes the old version atomically", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "review-strategy-"))
    try {
      const store = await strategyStore(directory)
      try {
        const first = store.propose(draft)
        expect(() => store.propose({ ...draft, supersedes: first.id })).toThrow()
        store.decide(first.id, "approved", "审核员甲")
        const replacement = store.propose({ ...draft, after: "终孔井深 5002 m", supersedes: first.id })
        expect(replacement.version).toBe(2)
        expect(store.search({ reportType: "录井报告" }).map((card) => card.id)).toEqual([first.id])
        store.decide(replacement.id, "approved", "审核员乙")
        expect(store.read(first.id)?.status).toBe("superseded")
        expect(store.search({ reportType: "录井报告" }).map((card) => card.id)).toEqual([replacement.id])
        expect(store.decide(replacement.id, "approved", "审核员乙").status).toBe("approved")
        store.retire(replacement.id, "审核员乙")
        expect(store.search({ reportType: "录井报告" })).toEqual([])
      } finally {
        store.close()
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("rejects incomplete evidence and keeps rejected cards out of recall", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "review-strategy-"))
    try {
      const store = await strategyStore(directory)
      try {
        expect(() => store.propose({ ...draft, basis: "" })).toThrow()
        expect(() => store.propose({ ...draft, reportType: "" })).toThrow()
        expect(() => store.propose({ ...draft, sourceHash: "wrong" })).toThrow()
        expect(() => store.propose({ ...draft, before: "x".repeat(501) })).toThrow()
        const uncertain = store.propose({ ...draft, evidenceStatus: "needs-location-review" })
        expect(() => store.decide(uncertain.id, "approved", "本机用户")).toThrow("位置关联")
        const pending = store.propose(draft)
        store.decide(pending.id, "rejected", "审核员甲")
        expect(store.search({ reportType: "录井报告" })).toEqual([])
      } finally {
        store.close()
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
