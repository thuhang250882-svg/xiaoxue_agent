import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Effect, Schema } from "effect"
import { reviewUploadedAttachments } from "../../../../domains/geology_report"
import type { ReviewAttachmentInput, XiaoxueRuntimeStateEvent } from "../../../../domains/geology_report"
import { Session } from "../session/session"
import { XiaoxueTrustedAttachments } from "../xiaoxue/trusted-attachments"
import { documentAttachments } from "../xiaoxue/document-attachments"
import { strategyStore } from "../xiaoxue/review-strategy"
import { upsertBusinessTask, type BusinessTask } from "./business-task"
import { exportPersistedGeologyReview } from "./geology-review-export"
import { Tool } from "./tool"
import { loadReviewDirectory, resolveReviewDirectory } from "./geology-review-directory"
import { xiaoxueOutputDirectory } from "./xiaoxue-output-directory"

const Parameters = Schema.Struct({
  filenames: Schema.optional(Schema.Array(Schema.String)),
  primaryReport: Schema.optional(Schema.String),
  directory: Schema.optional(Schema.String),
  mdbFile: Schema.optional(Schema.String),
})

export const GeologyReportReviewTool = Tool.define(
  "geology_report_review",
  Effect.gen(function* () {
    const sessions = yield* Session.Service

    return {
      description:
        "分别执行报告质量审核和数据质量审核，返回结构化 ReviewResult 与 qualityTracks，并将审核意见 DOCX 保存到当前工作目录的“小雪交付文件”。用户指定本地录井目录时传 directory（用户提供的完整路径）：有 MDB 则按 Q/SY XJ 0222-2009（2014年确认）核查原始数据结构、完井基础字段和值约束，并与报告交叉核对；没有 MDB 仍完成报告质量审核，同时将数据质量标为未执行。多个 MDB 时必须明确 mdbFile 文件名。无上传附件时从目录读取 primaryReport 主报告和 filenames 指定的附表；多个主报告不得猜测。只读取目录第一层，不自动混用邻井资料。",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) => {
        const taskId = `review-${Date.now()}`
        const createdAt = new Date().toISOString()
        const attachments = latestUserAttachments(ctx.messages)
        const persist = (task: BusinessTask) =>
          Effect.gen(function* () {
            const current = yield* sessions.get(ctx.sessionID)
            yield* sessions.setMetadata({
              sessionID: ctx.sessionID,
              metadata: upsertBusinessTask(current.metadata, task),
            })
          })
        const base: BusinessTask = {
          id: taskId,
          sessionId: ctx.sessionID,
          taskType: "geology_report_review",
          agent: ctx.agent,
          title: params.primaryReport ?? attachments[0]?.filename ?? "地质录井报告审核",
          status: "running",
          createdAt,
          sourceFiles: attachments.map((item) => ({
            fileName: item.filename ?? "unnamed-file",
            mime: item.mime,
            sourcePath: item.sourcePath,
          })),
          exportedFiles: [],
        }

        return Effect.gen(function* () {
          yield* persist(base)
          if (params.mdbFile && !params.directory)
            return yield* Effect.fail(new Error("指定 mdbFile 时必须同时提供 directory。"))
          if (params.directory)
            yield* ctx.ask({
              permission: "read",
              patterns: [`${params.directory}/*`],
              always: [`${params.directory}/*`],
              metadata: { purpose: "读取主报告及 MDB 基础数据，仅操作副本" },
            })
          const local = params.directory
            ? yield* Effect.tryPromise({
                try: async () =>
                  loadReviewDirectory(
                    await resolveReviewDirectory({
                      directory: params.directory!,
                      messages: ctx.messages,
                      primaryReport: params.primaryReport,
                      filenames: params.filenames,
                      mdbFile: params.mdbFile,
                      loadReports: attachments.length === 0,
                    }),
                    ctx.sessionID,
                    ctx.abort,
                  ),
                catch: (error) => (error instanceof Error ? error : new Error(String(error))),
              })
            : undefined
          const strategyLookup = yield* Effect.promise(async () => {
            try {
              const store = await strategyStore(path.join(Global.Path.data, "review-strategies"))
              try {
                // Without verified region/section metadata, only generally applicable cards can match.
                return { references: store.search({ reportType: "录井报告" }), warning: undefined }
              } finally {
                store.close()
              }
            } catch (error) {
              return {
                references: [],
                warning: `审核策略检索失败：${error instanceof Error ? error.message : String(error)}`,
              }
            }
          })
          const envelope = yield* Effect.tryPromise({
            try: () =>
              reviewUploadedAttachments({
                sessionId: ctx.sessionID,
                taskId,
                attachments: attachments.length ? attachments : (local?.attachments ?? []),
                filenames: attachments.length && params.filenames ? [...params.filenames] : undefined,
                primaryReport: params.primaryReport ?? local?.primaryReport,
                mdb: local?.mdb,
                reviewStrategies: strategyLookup.references,
                // 审核读取必须经过可信附件登记表：凭证消费 + 未登记路径拒绝
                trustedAttachments: {
                  readStored: (url) => documentAttachments.read(ctx.sessionID, url),
                  consumeUrl: (url) => XiaoxueTrustedAttachments.consumeUrl(url),
                  consumeByPath: (path) => XiaoxueTrustedAttachments.consumeByPath(path),
                },
                onState: (event) => Effect.runPromise(ctx.metadata({ title: "地质录井报告审核", metadata: event })),
              }),
            catch: (error) => (error instanceof Error ? error : new Error(String(error))),
          })
          const current = yield* sessions.get(ctx.sessionID)
          const outputPath = xiaoxueOutputDirectory(current.directory)
          yield* ctx.ask({
            permission: "edit",
            patterns: [path.join(outputPath, "*")],
            always: [path.join(outputPath, "*")],
            metadata: { purpose: "在当前工作目录保存录井报告审核意见书，保留原稿" },
          })
          const exported = yield* Effect.tryPromise({
            try: () => exportPersistedGeologyReview(envelope.result, outputPath),
            catch: (error) => (error instanceof Error ? error : new Error(String(error))),
          })
          const exportedFiles = [exported]
          yield* persist({
            ...base,
            sourceFiles: mergeResolvedSources(base.sourceFiles, envelope.resolvedSources),
            title: envelope.result.fileName,
            status: "completed",
            completedAt: new Date().toISOString(),
            wellName: extractWellName(envelope.result.fileName),
            resultType: "review_result",
            result: {
              ...envelope.result,
              qualityTracks: envelope.qualityTracks,
              mdbAudit: envelope.mdbAudit,
              strategyHints: envelope.strategyHints,
              strategyWarning: strategyLookup.warning,
            },
            score: envelope.result.summary,
            exportedFiles,
          })
          return {
            title: "地质录井报告审核",
            output: JSON.stringify({
              ...envelope,
              result: {
                ...envelope.result,
                strategyHints: envelope.strategyHints,
                strategyWarning: strategyLookup.warning,
              },
              exportedFiles,
              strategyWarning: strategyLookup.warning,
            }),
            metadata: {
              type: "xiaoxue.agent.state" as const,
              taskId,
              sessionId: ctx.sessionID,
              state: "success" as const,
              message: `审核完成，共发现 ${envelope.result.summary.totalIssues} 项问题。`,
              reviewResult: {
                ...envelope.result,
                qualityTracks: envelope.qualityTracks,
                mdbAudit: envelope.mdbAudit,
                strategyHints: envelope.strategyHints,
                strategyWarning: strategyLookup.warning,
                exportedFiles,
              },
            },
          }
        })
          .pipe(
            Effect.catch((error) => {
              const failure = error instanceof Error ? error : new Error(String(error))
              const metadata: XiaoxueRuntimeStateEvent = {
                type: "xiaoxue.agent.state",
                taskId,
                sessionId: ctx.sessionID,
                state: "error",
                message: failure.message,
              }
              return persist({
                ...base,
                status: "failed",
                completedAt: new Date().toISOString(),
                error: { message: failure.message },
              }).pipe(
                Effect.andThen(ctx.metadata({ title: "地质录井报告审核失败", metadata })),
                Effect.map(() => ({
                  title: "地质录井报告审核失败",
                  output: JSON.stringify({ type: "geology_report_review_error", taskId, error: failure.message }),
                  metadata,
                })),
              )
            }),
          )
          .pipe(Effect.orDie)
      },
    }
  }),
)

function latestUserAttachments(messages: SessionV1.WithParts[]) {
  const message = [...messages].reverse().find((item) => item.info.role === "user")
  if (!message) return []

  return message.parts
    .filter((part): part is SessionV1.FilePart => part.type === "file")
    .map(
      (part): ReviewAttachmentInput => ({
        filename: part.filename,
        mime: part.mime,
        url: part.url,
        sourcePath: part.source?.type === "file" ? part.source.path : undefined,
      }),
    )
}

function extractWellName(fileName: string) {
  return fileName.match(/([\u4e00-\u9fffA-Za-z0-9-]{1,24}\u4e95)/)?.[1]
}

// 审核过程中读取到的真实大小与 SHA-256 回填到业务历史，供重新授权时比对
function mergeResolvedSources(
  sources: BusinessTask["sourceFiles"],
  resolved?: Array<{ fileName: string; size: number; sha256: string }>,
): BusinessTask["sourceFiles"] {
  if (!resolved?.length) return sources
  const updated = sources.map((source) => {
    const match = resolved.find((item) => item.fileName === source.fileName)
    if (!match) return source
    return { ...source, size: match.size, sha256: match.sha256 }
  })
  return [
    ...updated,
    ...resolved
      .filter((source) => !sources.some((item) => item.fileName === source.fileName))
      .map((source) => ({
        fileName: source.fileName,
        mime: source.fileName.toLowerCase().endsWith(".mdb") ? "application/x-msaccess" : "application/octet-stream",
        size: source.size,
        sha256: source.sha256,
      })),
  ]
}
