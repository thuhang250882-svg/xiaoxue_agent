import { expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect } from "effect"
import { ModelsDev } from "@opencode-ai/core/models-dev"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Auth } from "@/auth"
import { Config } from "@/config/config"
import { Env } from "@/env"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { testEffect } from "../lib/effect"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([
      Provider.node,
      FSUtil.node,
      Env.node,
      Config.node,
      Auth.node,
      Plugin.node,
      ModelsDev.node,
      RuntimeFlags.node,
    ]),
  ),
)

it.instance(
  "stale_default_model_is_detected.test.ts",
  Effect.gen(function* () {
    const error = yield* Provider.use.defaultModel().pipe(Effect.flip)
    expect(error).toBeInstanceOf(Provider.DefaultModelUnresolvedError)
    expect(error._tag).toBe("ProviderDefaultModelUnresolvedError")
    expect(error.message).toBe("MODEL_DEFAULT_UNRESOLVED: 当前默认模型已失效，请重新选择可用模型。")
  }),
  {
    config: {
      model: "test/deleted-model",
      provider: {
        test: {
          name: "Test",
          npm: "@ai-sdk/openai-compatible",
          env: [],
          models: { live: { name: "Live" } },
          options: { apiKey: "test-key", baseURL: "https://example.test/v1" },
        },
      },
    },
  },
)
