/// <reference path="../pdfjs-worker.d.ts" />
import { createParsedDocument, normalizeBinaryContent, splitParagraphs } from "../types"
import type { DocumentParagraph, DocumentParser } from "../types"
import { DocumentParseError } from "../../domains/shared"

// pdfjs-dist v6 在模块顶层求值 `new DOMMatrix()`（canvas 渲染常量），且渲染
// 代码里存在 `path instanceof Path2D`。Node 运行时没有这两个浏览器 API，
// 导入即抛 "DOMMatrix is not defined" / "Right-hand side of 'instanceof' is
// not an object"。文本提取（getTextContent）完全不经过 canvas 渲染路径，
// 在动态导入前注入最小桩即可；桩不实现真实变换语义——服务端从不渲染
// 页面到 canvas，桩方法只保证"被意外触及时不崩溃"。
function ensurePdfjsWebApiStubs() {
  const globals = globalThis as typeof globalThis & {
    DOMMatrix?: unknown
    Path2D?: unknown
  }
  if (!globals.DOMMatrix) {
    class DOMMatrixStub {
      readonly is2D = true
      constructor(init?: unknown) {
        void init
      }
      static fromFloat32Array() {
        return new DOMMatrixStub()
      }
      static fromFloat64Array() {
        return new DOMMatrixStub()
      }
      static fromMatrix() {
        return new DOMMatrixStub()
      }
      multiply() {
        return new DOMMatrixStub()
      }
      multiplySelf() {
        return this
      }
      preMultiplySelf() {
        return this
      }
      translate() {
        return new DOMMatrixStub()
      }
      scale() {
        return new DOMMatrixStub()
      }
      rotate() {
        return new DOMMatrixStub()
      }
      invertSelf() {
        return this
      }
      inverse() {
        return new DOMMatrixStub()
      }
    }
    // 类型断言：桩只保证模块加载与运行时不崩，无需实现完整 DOMMatrix 类型。
    globals.DOMMatrix = DOMMatrixStub as unknown as typeof globalThis extends { DOMMatrix: infer T } ? T : never
  }
  if (!globals.Path2D) {
    class Path2DStub {
      constructor(path?: unknown) {
        void path
      }
      addPath() {}
      moveTo() {}
      lineTo() {}
      bezierCurveTo() {}
      quadraticCurveTo() {}
      arc() {}
      arcTo() {}
      ellipse() {}
      roundRect() {}
      closePath() {}
      rect() {}
    }
    globals.Path2D = Path2DStub as unknown as typeof globalThis extends { Path2D: infer T } ? T : never
  }
}

// pdfjs 以 isNodeJS 判定运行环境（process.versions.electron && process.type!=="browser"
// 时视为浏览器）。Electron utilityProcess 里 process.type === "utility"，被误判为
// 浏览器 → 尝试 spawn 真实 Worker → 抛 "No GlobalWorkerOptions.workerSrc specified"。
// 注入主线程 WorkerMessageHandler（globalThis.pdfjsWorker）后，PDFWorker 走
// setupFakeWorker 路径，既不需要 workerSrc 也不依赖磁盘上的 worker 文件，
// 打包环境（worker 被 bundle 内联）同样可靠。
let pdfjsWorkerReady = false
async function ensurePdfjsMainThreadWorker() {
  if (pdfjsWorkerReady) return
  const globals = globalThis as typeof globalThis & { pdfjsWorker?: { WorkerMessageHandler?: unknown } }
  if (!globals.pdfjsWorker?.WorkerMessageHandler) {
    const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs")
    globals.pdfjsWorker = worker as { WorkerMessageHandler?: unknown }
  }
  pdfjsWorkerReady = true
}

export const parsePdfDocument: DocumentParser = async (input) => {
  if (typeof input.content === "string") {
    const rawText = input.content.replace(/\r\n/g, "\n").trim()
    if (!rawText) throw pdfError("PDF_NO_EXTRACTABLE_TEXT", input.fileName, "PDF 文本内容为空。")
    return createParsedDocument({
      fileId: input.fileId,
      fileName: input.fileName,
      fileType: "pdf",
      rawText,
      metadata: { ...input.metadata, parser: "pdf_parser", extractionMode: "provided_text" },
    })
  }

  const bytes = normalizeBinaryContent(input.content)
  if (bytes.byteLength === 0) throw pdfError("EMPTY_PDF", input.fileName, "PDF 文件为空。")
  if (bytes.byteLength < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    throw pdfError("INVALID_PDF", input.fileName, "文件头不是有效的 %PDF-。")
  }

  if (/\/Encrypt\b/.test(new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.byteLength, 16_384))))) {
    throw pdfError("ENCRYPTED_PDF", input.fileName, "PDF 已加密，无法读取。")
  }

  ensurePdfjsWebApiStubs()
  await ensurePdfjsMainThreadWorker()
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
  // PDF.js transfers ownership to its worker. Callers still need the original
  // bytes for trusted-file hashing and knowledge storage after parsing.
  const loading = getDocument({ data: bytes.slice(), useWorkerFetch: false, useSystemFonts: true })

  try {
    const pdf = await loading.promise
    const pageCount = pdf.numPages
    const pages: string[] = []
    const paragraphs: DocumentParagraph[] = []
    let paragraphIndex = 1

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      // pdfjs 的 legacy 构建在 Node 中以主线程 fake worker 运行，逐页解析
      // 会持续占用事件循环——大 PDF 期间 server 的 SSE/HTTP 全部停摆，桌面
      // 界面表现为"卡死"。每页之间让出事件循环，把长阻塞切成间歇占用。
      await new Promise((resolve) => setImmediate(resolve))
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const pageText = content.items
        .flatMap((item) => typeof item === "object" && item !== null && "str" in item && typeof item.str === "string" ? [item.str] : [])
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
      if (!pageText) continue
      pages.push(pageText)
      for (const paragraph of splitParagraphs(pageText)) {
        paragraphs.push({
          ...paragraph,
          index: paragraphIndex++,
          location: `第 ${pageNumber} 页，第 ${paragraph.index} 段`,
          sourcePath: input.metadata?.sourcePath as string | undefined,
        })
      }
    }
    const rawText = pages.join("\n\n").trim()
    if (!rawText) {
      throw pdfError(
        "PDF_NO_EXTRACTABLE_TEXT",
        input.fileName,
        "当前 PDF 未检测到可提取文本，暂不支持扫描件 OCR，请上传 DOCX、XLSX 或可复制文字的 PDF。",
      )
    }

    return createParsedDocument({
      fileId: input.fileId,
      fileName: input.fileName,
      fileType: "pdf",
      rawText,
      paragraphs,
      metadata: {
        ...input.metadata,
        parser: "pdf_parser",
        extractionMode: "native_text",
        pageCount,
        sourcePath: input.metadata?.sourcePath,
      },
    })
  } catch (error) {
    if (error instanceof DocumentParseError) throw error
    const message = error instanceof Error ? error.message : String(error)
    if (/password|encrypted/i.test(message)) throw pdfError("ENCRYPTED_PDF", input.fileName, "PDF 已加密，无法读取。", error)
    throw pdfError("PDF_PARSE_FAILED", input.fileName, `PDF 解析失败：${message}`, error)
  } finally {
    await loading.destroy().catch(() => undefined)
  }
}

function pdfError(code: "INVALID_PDF" | "ENCRYPTED_PDF" | "EMPTY_PDF" | "PDF_PARSE_FAILED" | "PDF_NO_EXTRACTABLE_TEXT", fileName: string, message: string, cause?: unknown) {
  return new DocumentParseError(message, { fileName, parser: "pdf_parser", pdfCode: code, cause }, code)
}
