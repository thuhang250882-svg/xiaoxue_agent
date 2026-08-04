import { Config } from "@/config/config"
import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { Provider } from "@/provider/provider"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { described } from "./metadata"
import { Schema } from "effect"

const root = "/config"

export const XiaoxueMemoryOverview = Schema.Struct({
  counts: Schema.Struct({
    user: Schema.Int,
    shared: Schema.Int,
    project: Schema.Int,
  }),
  entries: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      scope: Schema.Literals(["user", "shared", "project"]),
      content: Schema.String,
      source: Schema.String,
      confidence: Schema.Finite,
      version: Schema.Int,
      updatedAt: Schema.Finite,
    }),
  ),
  updatedAt: Schema.optional(Schema.Finite),
})

const XiaoxueMemoryHistoryEntry = Schema.Struct({
  id: Schema.String,
  content: Schema.String,
  source: Schema.String,
  confidence: Schema.Finite,
  version: Schema.Int,
  status: Schema.Literals(["active", "superseded", "deleted"]),
  updatedAt: Schema.Finite,
})

const XiaoxueMemoryUpdatePayload = Schema.Struct({
  content: Schema.String,
})

const XiaoxueMemoryManageResult = Schema.Struct({
  success: Schema.Boolean,
  message: Schema.String,
  id: Schema.optional(Schema.String),
})

export const ConfigApi = HttpApi.make("config")
  .add(
    HttpApiGroup.make("config")
      .add(
        HttpApiEndpoint.get("get", root, {
          query: WorkspaceRoutingQuery,
          success: described(ConfigV1.Info, "Get config info"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "config.get",
            summary: "Get configuration",
            description: "Retrieve the current OpenCode configuration settings and preferences.",
          }),
        ),
        HttpApiEndpoint.patch("update", root, {
          query: WorkspaceRoutingQuery,
          payload: ConfigV1.Info,
          success: described(ConfigV1.Info, "Successfully updated config"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "config.update",
            summary: "Update configuration",
            description: "Update OpenCode configuration settings and preferences.",
          }),
        ),
        HttpApiEndpoint.get("providers", `${root}/providers`, {
          query: WorkspaceRoutingQuery,
          success: described(Provider.ConfigProvidersResult, "List of providers"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "config.providers",
            summary: "List config providers",
            description: "Get a list of all configured AI providers and their default models.",
          }),
        ),
        HttpApiEndpoint.get("xiaoxueMemory", `${root}/xiaoxue/memory`, {
          query: WorkspaceRoutingQuery,
          success: described(XiaoxueMemoryOverview, "Xiaoxue memory overview"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "config.xiaoxueMemory",
            summary: "Get Xiaoxue memory overview",
            description: "Get active Xiaoxue memory counts and recent entries for the memory settings interface.",
          }),
        ),
        HttpApiEndpoint.patch("xiaoxueMemoryUpdate", `${root}/xiaoxue/memory/:id`, {
          params: { id: Schema.String },
          query: WorkspaceRoutingQuery,
          payload: XiaoxueMemoryUpdatePayload,
          success: described(XiaoxueMemoryManageResult, "Xiaoxue memory update result"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "config.xiaoxueMemoryUpdate",
            summary: "Correct a Xiaoxue memory",
            description: "Create a corrected active version while retaining the superseded memory relationship.",
          }),
        ),
        HttpApiEndpoint.get("xiaoxueMemoryHistory", `${root}/xiaoxue/memory/:id/history`, {
          params: { id: Schema.String },
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(XiaoxueMemoryHistoryEntry), "Xiaoxue memory version history"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "config.xiaoxueMemoryHistory",
            summary: "Get Xiaoxue memory history",
            description: "Get the current memory and the superseded versions that it descends from.",
          }),
        ),
        HttpApiEndpoint.delete("xiaoxueMemoryForget", `${root}/xiaoxue/memory/:id`, {
          params: { id: Schema.String },
          query: WorkspaceRoutingQuery,
          success: described(XiaoxueMemoryManageResult, "Xiaoxue memory forget result"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "config.xiaoxueMemoryForget",
            summary: "Forget a Xiaoxue memory",
            description: "Soft-delete one active Xiaoxue memory without physically erasing its audit history.",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "config",
          description: "Experimental HttpApi config routes.",
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
