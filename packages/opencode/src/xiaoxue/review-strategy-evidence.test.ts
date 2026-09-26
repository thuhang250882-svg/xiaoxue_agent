import { createHash } from "node:crypto"
import { describe, expect, test } from "bun:test"
import { Document, Packer, Paragraph } from "docx"
import { verifyRevisionEvidence } from "./review-strategy-evidence"

async function document(text: string) {
  return new Uint8Array(await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph(text)] }] })))
}

describe("review strategy revision evidence", () => {
  test("checks real DOCX bytes and unique before/after excerpts", async () => {
    const original = await document("本井终孔井深为 5000 m。")
    const revised = await document("本井终孔井深为 5001 m。")
    const sourceHash = createHash("sha256").update(original).digest("hex")
    const result = await verifyRevisionEvidence({
      draft: { sourceFile: "原稿.docx", sourceHash, before: "5000 m", after: "5001 m" },
      original: { name: "原稿.docx", data: original },
      revised: { name: "人工定稿.docx", data: revised },
    })
    expect(result.sourceHash).toBe(sourceHash)
    expect(result.revisedHash).toBe(createHash("sha256").update(revised).digest("hex"))
    expect(result.revisedFile).toBe("人工定稿.docx")
    expect(result.evidenceStatus).toBe("verified")
  })

  test("keeps a card pending when unique excerpts are in different contexts", async () => {
    const original = await document("第一段记录：本井终孔井深为 5000 m。第二段为储层解释。")
    const revised = await document("第一段记录：本井终孔井深已核对。第二段为储层解释，新增参考值 5001 m。")
    const result = await verifyRevisionEvidence({
      draft: { sourceFile: "原稿.docx", before: "5000 m", after: "5001 m" },
      original: { name: "原稿.docx", data: original },
      revised: { name: "人工定稿.docx", data: revised },
    })
    expect(result.evidenceStatus).toBe("needs-location-review")
  })

  test("rejects missing, ambiguous and forged evidence", async () => {
    const original = await document("5000 m，5000 m")
    const revised = await document("5001 m")
    const input = {
      draft: { sourceFile: "原稿.docx", before: "5000 m", after: "5001 m" },
      original: { name: "原稿.docx", data: original },
      revised: { name: "人工定稿.docx", data: revised },
    }
    await expect(verifyRevisionEvidence(input)).rejects.toThrow("恰好出现一次")
    await expect(verifyRevisionEvidence({ ...input, draft: { ...input.draft, before: "不存在" } })).rejects.toThrow()
    await expect(
      verifyRevisionEvidence({ ...input, draft: { ...input.draft, sourceHash: "a".repeat(64) } }),
    ).rejects.toThrow("SHA-256")
    await expect(
      verifyRevisionEvidence({ ...input, revised: { name: "人工定稿.docx", data: original } }),
    ).rejects.toThrow("内容相同")
    const alsoOriginal = await document("5000 m；5001 m")
    await expect(
      verifyRevisionEvidence({ ...input, original: { name: "原稿.docx", data: alsoOriginal } }),
    ).rejects.toThrow("未形成明确替换")
  })
})
