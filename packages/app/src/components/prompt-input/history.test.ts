import { describe, expect, test } from "bun:test"
import type { Prompt } from "@/context/prompt"
import {
  canNavigateHistoryAtCursor,
  clonePromptParts,
  migratePromptHistory,
  normalizePromptHistoryEntry,
  navigatePromptHistory,
  prependHistoryEntry,
  promptLength,
  type PromptHistoryComment,
} from "./history"

const DEFAULT_PROMPT: Prompt = [{ type: "text", content: "", start: 0, end: 0 }]

const text = (value: string): Prompt => [{ type: "text", content: value, start: 0, end: value.length }]
const comment = (id: string, value = "note"): PromptHistoryComment => ({
  id,
  path: "src/a.ts",
  selection: { start: 2, end: 4 },
  comment: value,
  time: 1,
  origin: "review",
  preview: "const a = 1",
})

describe("prompt-input history", () => {
  test("prependHistoryEntry skips empty prompt and deduplicates consecutive entries", () => {
    const first = prependHistoryEntry([], DEFAULT_PROMPT)
    expect(first).toEqual([])

    const commentsOnly = prependHistoryEntry([], DEFAULT_PROMPT, [comment("c1")])
    expect(commentsOnly).toHaveLength(1)

    const withOne = prependHistoryEntry([], text("hello"))
    expect(withOne).toHaveLength(1)

    const deduped = prependHistoryEntry(withOne, text("hello"))
    expect(deduped).toBe(withOne)

    const dedupedComments = prependHistoryEntry(commentsOnly, DEFAULT_PROMPT, [comment("c1")])
    expect(dedupedComments).toBe(commentsOnly)
  })

  test("prependHistoryEntry moves duplicate entry to front instead of duplicating", () => {
    const entries = prependHistoryEntry(prependHistoryEntry([], text("first")), text("second"))
    const resubmit = prependHistoryEntry(entries, text("first"))
    expect(resubmit).toHaveLength(2)
    expect(resubmit[0]).not.toBe(entries[1])
    const first = normalizePromptHistoryEntry(resubmit[0])
    expect(first.prompt[0]?.type === "text" ? first.prompt[0].content : "").toBe("first")
    const second = normalizePromptHistoryEntry(resubmit[1])
    expect(second.prompt[0]?.type === "text" ? second.prompt[0].content : "").toBe("second")
  })

  test("prependHistoryEntry strips oversized dataUrl from persisted attachments", () => {
    const large = "data:application/msword;base64," + "A".repeat(600 * 1024)
    const docPrompt: Prompt = [
      { type: "text", content: "审核报告", start: 0, end: 4 },
      {
        type: "image",
        id: "doc1",
        filename: "report.doc",
        mime: "application/msword",
        sourcePath: "C:/reports/report.doc",
        dataUrl: large,
      },
    ]
    const docEntries = prependHistoryEntry([], docPrompt)
    const docEntry = normalizePromptHistoryEntry(docEntries[0])
    expect(docEntry.prompt[1]?.type === "image" ? docEntry.prompt[1].dataUrl : "missing").toBe("")
    expect(docEntry.prompt[1]?.type === "image" ? docEntry.prompt[1].sourcePath : "missing").toBe(
      "C:/reports/report.doc",
    )

    // 需要内联的小图片保持 dataUrl，超限且没有本地路径的内联图片也保持（否则无法重发）
    const smallImage: Prompt = [
      {
        type: "image",
        id: "img1",
        filename: "small.png",
        mime: "image/png",
        dataUrl: "data:image/png;base64,abc",
      },
    ]
    const smallEntries = prependHistoryEntry([], smallImage)
    const smallEntry = normalizePromptHistoryEntry(smallEntries[0])
    expect(smallEntry.prompt[0]?.type === "image" ? smallEntry.prompt[0].dataUrl : "missing").toBe(
      "data:image/png;base64,abc",
    )

    const largeInline: Prompt = [
      {
        type: "image",
        id: "img2",
        filename: "huge.png",
        mime: "image/png",
        dataUrl: "data:image/png;base64," + "B".repeat(600 * 1024),
      },
    ]
    const inlineEntries = prependHistoryEntry([], largeInline)
    const inlineEntry = normalizePromptHistoryEntry(inlineEntries[0])
    expect(inlineEntry.prompt[0]?.type === "image" ? inlineEntry.prompt[0].dataUrl.length : 0).toBe(
      largeInline[0]!.type === "image" ? largeInline[0].dataUrl.length : 0,
    )
  })

  test("migratePromptHistory cleans oversized dataUrl from stored entries", () => {
    const large = "data:application/msword;base64," + "C".repeat(600 * 1024)
    const stored = {
      entries: [
        {
          prompt: [
            { type: "text", content: "审核", start: 0, end: 2 },
            {
              type: "image",
              id: "doc1",
              filename: "report.doc",
              mime: "application/msword",
              sourcePath: "C:/reports/report.doc",
              dataUrl: large,
            },
          ],
          comments: [],
        },
        text("plain"),
      ],
    }

    const migrated = migratePromptHistory(stored) as typeof stored
    expect(migrated).not.toBe(stored)
    const first = migrated.entries[0] as { prompt: Prompt }
    expect(first.prompt[1]?.type === "image" ? first.prompt[1].dataUrl : "missing").toBe("")

    // 无关数据原样返回
    expect(migratePromptHistory(null)).toBe(null)
    expect(migratePromptHistory({ other: 1 })).toEqual({ other: 1 })
  })

  test("navigatePromptHistory restores saved prompt when moving down from newest", () => {
    const entries = [text("third"), text("second"), text("first")]
    const up = navigatePromptHistory({
      direction: "up",
      entries,
      historyIndex: -1,
      currentPrompt: text("draft"),
      currentComments: [comment("draft")],
      savedPrompt: null,
    })
    expect(up.handled).toBe(true)
    if (!up.handled) throw new Error("expected handled")
    expect(up.historyIndex).toBe(0)
    expect(up.cursor).toBe("start")
    expect(up.entry.comments).toEqual([])

    const down = navigatePromptHistory({
      direction: "down",
      entries,
      historyIndex: up.historyIndex,
      currentPrompt: text("ignored"),
      currentComments: [],
      savedPrompt: up.savedPrompt,
    })
    expect(down.handled).toBe(true)
    if (!down.handled) throw new Error("expected handled")
    expect(down.historyIndex).toBe(-1)
    expect(down.entry.prompt[0]?.type === "text" ? down.entry.prompt[0].content : "").toBe("draft")
    expect(down.entry.comments).toEqual([comment("draft")])
  })

  test("navigatePromptHistory keeps entry comments when moving through history", () => {
    const entries = [
      {
        prompt: text("with comment"),
        comments: [comment("c1")],
      },
    ]

    const up = navigatePromptHistory({
      direction: "up",
      entries,
      historyIndex: -1,
      currentPrompt: text("draft"),
      currentComments: [],
      savedPrompt: null,
    })

    expect(up.handled).toBe(true)
    if (!up.handled) throw new Error("expected handled")
    expect(up.entry.prompt[0]?.type === "text" ? up.entry.prompt[0].content : "").toBe("with comment")
    expect(up.entry.comments).toEqual([comment("c1")])
  })

  test("normalizePromptHistoryEntry supports legacy prompt arrays", () => {
    const entry = normalizePromptHistoryEntry(text("legacy"))
    expect(entry.prompt[0]?.type === "text" ? entry.prompt[0].content : "").toBe("legacy")
    expect(entry.comments).toEqual([])
  })

  test("helpers clone prompt and count text content length", () => {
    const original: Prompt = [
      { type: "text", content: "one", start: 0, end: 3 },
      {
        type: "file",
        path: "src/a.ts",
        content: "@src/a.ts",
        start: 3,
        end: 12,
        selection: { startLine: 1, startChar: 1, endLine: 2, endChar: 1 },
      },
      { type: "image", id: "1", filename: "img.png", mime: "image/png", dataUrl: "data:image/png;base64,abc" },
    ]
    const copy = clonePromptParts(original)
    expect(copy).not.toBe(original)
    expect(promptLength(copy)).toBe(12)
    if (copy[1]?.type !== "file") throw new Error("expected file")
    copy[1].selection!.startLine = 9
    if (original[1]?.type !== "file") throw new Error("expected file")
    expect(original[1].selection?.startLine).toBe(1)
  })

  test("canNavigateHistoryAtCursor only allows prompt boundaries", () => {
    const value = "a\nb\nc"

    expect(canNavigateHistoryAtCursor("up", value, 0)).toBe(false)
    expect(canNavigateHistoryAtCursor("down", value, 0)).toBe(false)

    expect(canNavigateHistoryAtCursor("up", value, 2)).toBe(false)
    expect(canNavigateHistoryAtCursor("down", value, 2)).toBe(false)

    expect(canNavigateHistoryAtCursor("up", value, 5)).toBe(false)
    expect(canNavigateHistoryAtCursor("down", value, 5)).toBe(true)

    expect(canNavigateHistoryAtCursor("up", "abc", 0)).toBe(false)
    expect(canNavigateHistoryAtCursor("down", "abc", 3)).toBe(true)
    expect(canNavigateHistoryAtCursor("up", "abc", 1)).toBe(false)
    expect(canNavigateHistoryAtCursor("down", "abc", 1)).toBe(false)

    expect(canNavigateHistoryAtCursor("up", "", 0)).toBe(true)
    expect(canNavigateHistoryAtCursor("down", "", 0)).toBe(true)

    expect(canNavigateHistoryAtCursor("up", "abc", 0, true)).toBe(true)
    expect(canNavigateHistoryAtCursor("up", "abc", 3, true)).toBe(true)
    expect(canNavigateHistoryAtCursor("down", "abc", 0, true)).toBe(true)
    expect(canNavigateHistoryAtCursor("down", "abc", 3, true)).toBe(true)
    expect(canNavigateHistoryAtCursor("up", "abc", 1, true)).toBe(false)
    expect(canNavigateHistoryAtCursor("down", "abc", 1, true)).toBe(false)
  })
})
