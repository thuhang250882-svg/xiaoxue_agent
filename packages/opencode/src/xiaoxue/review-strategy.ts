import { randomUUID } from "node:crypto"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { XiaoxueSqlite } from "#xiaoxue-sqlite"

export type StrategyDraft = {
  title: string
  problem: string
  before: string
  after: string
  rationale: string
  basis: string
  reportType: string
  section: string
  region: string
  scenario: string
  exception: string
  sourceFile: string
  sourceHash: string
  sourceLocation: string
  revisedFile: string
  revisedHash: string
  evidenceStatus?: "verified" | "needs-location-review"
  supersedes?: string
}

export type StrategyCard = StrategyDraft & {
  evidenceStatus: "verified" | "needs-location-review"
  id: string
  status: "proposed" | "approved" | "rejected" | "superseded" | "retired"
  version: number
  decidedBy?: string
  createdAt: number
  updatedAt: number
}

type Row = { payload: string }

export async function strategyStore(directory: string) {
  await mkdir(directory, { recursive: true })
  const db = XiaoxueSqlite.open(path.join(directory, "review-strategies.sqlite"))
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA busy_timeout = 5000")
  db.exec(`CREATE TABLE IF NOT EXISTS strategy_card (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('proposed', 'approved', 'rejected', 'superseded', 'retired')),
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)
  db.exec("CREATE INDEX IF NOT EXISTS strategy_card_status_updated_idx ON strategy_card(status, updated_at)")

  const read = (id: string): StrategyCard | undefined => {
    const row = db.prepare("SELECT payload FROM strategy_card WHERE id = ?").get(id) as Row | undefined
    return row ? (JSON.parse(row.payload) as StrategyCard) : undefined
  }
  const list = (status?: StrategyCard["status"]): StrategyCard[] =>
    (status
      ? db.prepare("SELECT payload FROM strategy_card WHERE status = ? ORDER BY updated_at DESC").all(status)
      : db.prepare("SELECT payload FROM strategy_card ORDER BY updated_at DESC").all()
    ).map((row) => JSON.parse((row as Row).payload) as StrategyCard)

  return {
    close: () => db.close(),
    read,
    list,
    propose(draft: StrategyDraft) {
      validateDraft(draft)
      const existing = list("proposed").find(
        (card) =>
          card.supersedes === draft.supersedes &&
          Object.entries(draft).every(([key, value]) => card[key as keyof StrategyDraft] === value),
      )
      if (existing) return existing
      const now = Date.now()
      const prior = draft.supersedes ? read(draft.supersedes) : undefined
      if (draft.supersedes && prior?.status !== "approved") throw new Error("只能修订已批准的策略。")
      const card: StrategyCard = {
        ...draft,
        evidenceStatus: draft.evidenceStatus ?? "needs-location-review",
        id: randomUUID(),
        status: "proposed",
        version: prior ? prior.version + 1 : 1,
        createdAt: now,
        updatedAt: now,
      }
      db.prepare("INSERT INTO strategy_card (id, status, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
        card.id,
        card.status,
        JSON.stringify(card),
        now,
        now,
      )
      return card
    },
    decide(id: string, decision: "approved" | "rejected", reviewer: string) {
      if (!reviewer.trim()) throw new Error("需要填写审核人。")
      db.exec("BEGIN IMMEDIATE")
      try {
        const card = read(id)
        if (card?.status === decision) {
          db.exec("COMMIT")
          return card
        }
        if (!card || card.status !== "proposed") throw new Error("候选策略不存在或已处理。")
        if (decision === "approved" && card.evidenceStatus !== "verified")
          throw new Error("前后片段的位置关联尚未核实，不能一键保存为有效经验。")
        const prior = card.supersedes ? read(card.supersedes) : undefined
        if (card.supersedes && prior?.status !== "approved") throw new Error("原策略已变化，请重新核对修订。")
        const now = Date.now()
        const updated: StrategyCard = { ...card, status: decision, decidedBy: reviewer.trim(), updatedAt: now }
        db.prepare(
          "UPDATE strategy_card SET status = ?, payload = ?, updated_at = ? WHERE id = ? AND status = 'proposed'",
        ).run(decision, JSON.stringify(updated), now, id)
        if (decision === "approved" && prior) {
          const superseded: StrategyCard = { ...prior, status: "superseded", updatedAt: now }
          db.prepare(
            "UPDATE strategy_card SET status = 'superseded', payload = ?, updated_at = ? WHERE id = ? AND status = 'approved'",
          ).run(JSON.stringify(superseded), now, prior.id)
        }
        db.exec("COMMIT")
        return updated
      } catch (error) {
        db.exec("ROLLBACK")
        throw error
      }
    },
    retire(id: string, reviewer: string) {
      if (!reviewer.trim()) throw new Error("需要填写撤销人。")
      db.exec("BEGIN IMMEDIATE")
      try {
        const card = read(id)
        if (card?.status === "retired") {
          db.exec("COMMIT")
          return card
        }
        if (!card || card.status !== "approved") throw new Error("只能撤销已批准且仍有效的策略。")
        const now = Date.now()
        const retired: StrategyCard = { ...card, status: "retired", decidedBy: reviewer.trim(), updatedAt: now }
        db.prepare(
          "UPDATE strategy_card SET status = 'retired', payload = ?, updated_at = ? WHERE id = ? AND status = 'approved'",
        ).run(JSON.stringify(retired), now, id)
        db.exec("COMMIT")
        return retired
      } catch (error) {
        db.exec("ROLLBACK")
        throw error
      }
    },
    search(context: { reportType?: string; section?: string; region?: string; query?: string }, limit = 10) {
      const words = (context.query ?? "").toLowerCase().split(/\s+/).filter(Boolean)
      return list("approved")
        .filter(
          (card) =>
            matches(card.reportType, context.reportType) &&
            matches(card.section, context.section) &&
            matches(card.region, context.region) &&
            words.every((word) => `${card.title} ${card.problem} ${card.scenario}`.toLowerCase().includes(word)),
        )
        .slice(0, Math.max(0, Math.min(limit, 20)))
    },
  }
}

function matches(rule: string, actual?: string) {
  return !rule || (!!actual && rule.trim().toLowerCase() === actual.trim().toLowerCase())
}

function validateDraft(draft: StrategyDraft) {
  const required = [
    "title",
    "problem",
    "before",
    "after",
    "rationale",
    "basis",
    "reportType",
    "scenario",
    "exception",
    "sourceFile",
    "sourceHash",
    "sourceLocation",
    "revisedFile",
    "revisedHash",
  ] as const
  for (const key of required) if (!draft[key]?.trim()) throw new Error(`缺少策略字段：${key}`)
  for (const [key, value] of Object.entries(draft)) {
    if (value && value.length > (key === "before" || key === "after" ? 500 : 1000))
      throw new Error(`策略字段过长：${key}`)
  }
  if (!/^[a-f0-9]{64}$/i.test(draft.sourceHash)) throw new Error("sourceHash 必须是原报告 SHA-256。")
  if (!/^[a-f0-9]{64}$/i.test(draft.revisedHash)) throw new Error("revisedHash 必须是人工定稿 SHA-256。")
  if (draft.sourceHash.toLowerCase() === draft.revisedHash.toLowerCase())
    throw new Error("原稿与人工定稿哈希不能相同。")
}
