import { Agent } from "@/agent/agent"
import { Command } from "@/command"
import { Format } from "@/format"
import { LSP } from "@/lsp/lsp"
import { Vcs } from "@/project/vcs"
import { Skill, SkillName, SkillPatch, SkillCreate, SkillImport, SkillImportPreview, SkillImportPreviewInput, SkillDiagnostic, SkillHealth, SkillConflict } from "@/skill"
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import {
  WorkspaceRoutingMiddleware,
  WorkspaceRoutingQuery,
  WorkspaceRoutingQueryFields,
} from "../middleware/workspace-routing"
import { described } from "./metadata"

const PathInfo = Schema.Struct({
  home: Schema.String,
  tmp: Schema.String,
  state: Schema.String,
  config: Schema.String,
  worktree: Schema.String,
  directory: Schema.String,
}).annotate({ identifier: "Path" })

export const VcsDiffQuery = Schema.Struct({
  ...WorkspaceRoutingQueryFields,
  mode: Vcs.Mode,
  context: Schema.optional(Schema.NumberFromString.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
})

export class ApiVcsApplyError extends Schema.ErrorClass<ApiVcsApplyError>("VcsApplyError")(
  {
    name: Schema.Literal("VcsApplyError"),
    data: Schema.Struct({
      message: Schema.String,
      reason: Schema.Literals(["non-git", "not-clean"]),
    }),
  },
  { httpApiStatus: 400 },
) {}

const SkillErrorDetails = Schema.Record(Schema.String, Schema.Unknown)

export class ApiSkillInvalidNameError extends Schema.ErrorClass<ApiSkillInvalidNameError>("SkillInvalidNameError")(
  {
    code: Schema.Literal("SKILL_INVALID_NAME"),
    message: Schema.String,
    details: SkillErrorDetails,
  },
  { httpApiStatus: 400 },
) {}

export class ApiSkillReadOnlyError extends Schema.ErrorClass<ApiSkillReadOnlyError>("SkillReadOnlyError")(
  {
    code: Schema.Literal("SKILL_READ_ONLY"),
    message: Schema.String,
    details: SkillErrorDetails,
  },
  { httpApiStatus: 403 },
) {}

export class ApiSkillNotFoundError extends Schema.ErrorClass<ApiSkillNotFoundError>("SkillNotFoundError")(
  {
    code: Schema.Literal("SKILL_NOT_FOUND"),
    message: Schema.String,
    details: SkillErrorDetails,
  },
  { httpApiStatus: 404 },
) {}

export class ApiSkillConflictError extends Schema.ErrorClass<ApiSkillConflictError>("SkillConflictError")(
  {
    code: Schema.Literal("SKILL_NAME_CONFLICT"),
    message: Schema.String,
    details: SkillErrorDetails,
  },
  { httpApiStatus: 409 },
) {}

export class ApiSkillValidationError extends Schema.ErrorClass<ApiSkillValidationError>("SkillValidationError")(
  {
    code: Schema.Literal("SKILL_VALIDATION_FAILED"),
    message: Schema.String,
    details: SkillErrorDetails,
  },
  { httpApiStatus: 422 },
) {}

export class ApiSkillFilesystemError extends Schema.ErrorClass<ApiSkillFilesystemError>("SkillFilesystemError")(
  {
    code: Schema.Literal("SKILL_FILESYSTEM_ERROR"),
    message: Schema.String,
    details: SkillErrorDetails,
  },
  { httpApiStatus: 500 },
) {}

export const ApiSkillError = [
  ApiSkillInvalidNameError,
  ApiSkillReadOnlyError,
  ApiSkillNotFoundError,
  ApiSkillConflictError,
  ApiSkillValidationError,
  ApiSkillFilesystemError,
] as const

export const InstancePaths = {
  dispose: "/instance/dispose",
  path: "/path",
  vcs: "/vcs",
  vcsStatus: "/vcs/status",
  vcsDiff: "/vcs/diff",
  vcsDiffRaw: "/vcs/diff/raw",
  vcsApply: "/vcs/apply",
  command: "/command",
  agent: "/agent",
  skill: "/skill",
  skillItem: "/skill/:name",
  skillCreate: "/skill",
  skillImportPreview: "/skill/import/preview",
  skillImport: "/skill/import",
  skillEnable: "/skill/:name/enable",
  skillDisable: "/skill/:name/disable",
  skillValidate: "/skill/:name/validate",
  skillHealth: "/skill/:name/health",
  skillConflicts: "/skill/conflicts",
  lsp: "/lsp",
  formatter: "/formatter",
} as const

export const InstanceApi = HttpApi.make("instance")
  .add(
    HttpApiGroup.make("instance")
      .add(
        HttpApiEndpoint.post("dispose", InstancePaths.dispose, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Boolean, "Instance disposed"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "instance.dispose",
            summary: "Dispose instance",
            description: "Clean up and dispose the current OpenCode instance, releasing all resources.",
          }),
        ),
        HttpApiEndpoint.get("path", InstancePaths.path, {
          query: WorkspaceRoutingQuery,
          success: PathInfo,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "path.get",
            summary: "Get paths",
            description:
              "Retrieve the current working directory and related path information for the OpenCode instance.",
          }),
        ),
        HttpApiEndpoint.get("vcs", InstancePaths.vcs, {
          query: WorkspaceRoutingQuery,
          success: described(Vcs.Info, "VCS info"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "vcs.get",
            summary: "Get VCS info",
            description:
              "Retrieve version control system (VCS) information for the current project, such as git branch.",
          }),
        ),
        HttpApiEndpoint.get("vcsStatus", InstancePaths.vcsStatus, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(Vcs.FileStatus), "VCS status"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "vcs.status",
            summary: "Get VCS status",
            description: "Retrieve changed files in the current working tree without patches.",
          }),
        ),
        HttpApiEndpoint.get("vcsDiff", InstancePaths.vcsDiff, {
          query: VcsDiffQuery,
          success: described(Schema.Array(Vcs.FileDiff), "VCS diff"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "vcs.diff",
            summary: "Get VCS diff",
            description: "Retrieve the current git diff for the working tree or against the default branch.",
          }),
        ),
        HttpApiEndpoint.get("vcsDiffRaw", InstancePaths.vcsDiffRaw, {
          query: WorkspaceRoutingQuery,
          success: described(
            Schema.String.pipe(HttpApiSchema.asText({ contentType: "text/x-diff; charset=utf-8" })),
            "Raw VCS diff",
          ),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "vcs.diff.raw",
            summary: "Get raw VCS diff",
            description: "Retrieve a raw patch for current uncommitted changes.",
          }),
        ),
        HttpApiEndpoint.post("vcsApply", InstancePaths.vcsApply, {
          query: WorkspaceRoutingQuery,
          payload: Vcs.ApplyInput,
          success: described(Vcs.ApplyResult, "VCS patch applied"),
          error: ApiVcsApplyError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "vcs.apply",
            summary: "Apply VCS patch",
            description: "Apply a raw patch to the current working tree.",
          }),
        ),
        HttpApiEndpoint.get("command", InstancePaths.command, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(Command.Info), "List of commands"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "command.list",
            summary: "List commands",
            description: "Get a list of all available commands in the OpenCode system.",
          }),
        ),
        HttpApiEndpoint.get("agent", InstancePaths.agent, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(Agent.Info), "List of agents"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "app.agents",
            summary: "List agents",
            description: "Get a list of all available AI agents in the OpenCode system.",
          }),
        ),
        HttpApiEndpoint.get("skill", InstancePaths.skill, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(Skill.Info), "List of skills"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "app.skills",
            summary: "List skills",
            description: "Get a list of all available skills in the OpenCode system.",
          }),
        ),
        HttpApiEndpoint.patch("skillUpdate", InstancePaths.skillItem, {
          params: { name: SkillName },
          payload: SkillPatch,
          success: described(Skill.Info, "Updated skill"),
          error: ApiSkillError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "app.skills.update",
            summary: "Update skill",
            description: "Update the frontmatter name or description of a user-owned skill.",
          }),
        ),
        HttpApiEndpoint.delete("skillRemove", InstancePaths.skillItem, {
          params: { name: SkillName },
          success: described(Schema.Boolean, "Skill removed"),
          error: ApiSkillError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "app.skills.remove",
            summary: "Remove skill",
            description: "Delete a user-owned skill file from disk and invalidate the in-memory cache.",
          }),
        ),
        HttpApiEndpoint.post("skillCreate", InstancePaths.skillCreate, {
          payload: SkillCreate,
          success: described(Skill.Info, "Created skill"),
          error: ApiSkillError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "app.skills.create",
            summary: "Create skill",
            description: "Create a new user skill with the given name, description, and optional content.",
          }),
        ),
        HttpApiEndpoint.post("skillImport", InstancePaths.skillImport, {
          payload: SkillImport,
          success: described(Skill.Info, "Imported skill"),
          error: ApiSkillError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "app.skills.import",
            summary: "Import skill",
            description: "Confirm a previously quarantined local Skill import using its short-lived preview token.",
          }),
        ),
        HttpApiEndpoint.post("skillImportPreview", InstancePaths.skillImportPreview, {
          payload: SkillImportPreviewInput,
          success: described(SkillImportPreview, "Skill import security preview"),
          error: ApiSkillError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "app.skills.importPreview",
            summary: "Preview local Skill import",
            description: "Quarantine and statically inspect a local .skill file, SKILL.md, or Skill directory without executing its contents.",
          }),
        ),
        HttpApiEndpoint.post("skillEnable", InstancePaths.skillEnable, {
          params: { name: SkillName },
          success: described(Skill.Info, "Skill enabled"),
          error: ApiSkillError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "app.skills.enable",
            summary: "Enable skill",
            description: "Re-enable a skill that the user had previously disabled.",
          }),
        ),
        HttpApiEndpoint.post("skillDisable", InstancePaths.skillDisable, {
          params: { name: SkillName },
          success: described(Skill.Info, "Skill disabled"),
          error: ApiSkillError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "app.skills.disable",
            summary: "Disable skill",
            description:
              "Disable a skill without deleting its files. Disabled skills are excluded from agent prompts and tool calls until re-enabled.",
          }),
        ),
        HttpApiEndpoint.get("skillValidate", InstancePaths.skillValidate, {
          params: { name: SkillName },
          success: described(Schema.Array(SkillDiagnostic), "Skill diagnostics"),
          error: ApiSkillError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "app.skills.validate",
            summary: "Validate skill",
            description: "Run diagnostics on a skill and return health issues.",
          }),
        ),
        HttpApiEndpoint.get("skillHealth", InstancePaths.skillHealth, {
          params: { name: SkillName },
          success: described(SkillHealth, "Skill health status"),
          error: ApiSkillError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "app.skills.health",
            summary: "Get skill health",
            description: "Get the health status of a skill.",
          }),
        ),
        HttpApiEndpoint.get("skillConflicts", InstancePaths.skillConflicts, {
          success: described(Schema.Array(SkillConflict), "Skill conflicts"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "app.skills.conflicts",
            summary: "List skill conflicts",
            description: "Get a list of skills that have name conflicts with each other.",
          }),
        ),
        HttpApiEndpoint.get("lsp", InstancePaths.lsp, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(LSP.Status), "LSP server status"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "lsp.status",
            summary: "Get LSP status",
            description: "Get LSP server status",
          }),
        ),
        HttpApiEndpoint.get("formatter", InstancePaths.formatter, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(Format.Status), "Formatter status"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "formatter.status",
            summary: "Get formatter status",
            description: "Get formatter status",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "instance",
          description: "Experimental HttpApi instance read routes.",
        }),
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "opencode experimental HttpApi",
      version: "0.0.1",
      description: "Experimental HttpApi surface for selected instance routes.",
    }),
  )
