import { afterEach, describe, expect, test } from "bun:test"
import { createServer, type Server } from "node:http"
import { ModelRegistry } from "@/provider/model-registry"
import { modelFixture } from "./_helper"

const servers: Server[] = []

afterEach(() => {
  servers.splice(0).forEach((server) => server.close())
})

async function endpoint(status = 200) {
  const requests: Array<{ authorization?: string; model?: string }> = []
  const server = createServer((request, response) => {
    let body = ""
    request.on("data", (chunk) => (body += chunk))
    request.on("end", () => {
      const parsed = JSON.parse(body) as { model?: string }
      requests.push({ authorization: request.headers.authorization, model: parsed.model })
      response.writeHead(status, { "content-type": "application/json" })
      response.end(status === 200 ? "{}" : '{"error":"unauthorized"}')
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("test server did not bind")
  return { requests, url: `http://127.0.0.1:${address.port}/v1` }
}

describe("model registry connection test", () => {
  test("uses the current model id and omits Authorization when no key is configured", async () => {
    const server = await endpoint()
    const result = await ModelRegistry.testModel(modelFixture({ modelId: "current-model" }) as never, {
      baseUrl: server.url,
    })

    expect(result.ok).toBeTrue()
    expect(server.requests).toEqual([{ authorization: undefined, model: "current-model" }])
  })

  test("uses the configured key and classifies an authentication rejection", async () => {
    const server = await endpoint(401)
    const result = await ModelRegistry.testModel(modelFixture({ modelId: "secured-model" }) as never, {
      baseUrl: server.url,
      apiKey: "test-key",
    })

    expect(result).toMatchObject({ ok: false, error: "MODEL_PROVIDER_UNAVAILABLE" })
    expect(server.requests).toEqual([{ authorization: "Bearer test-key", model: "secured-model" }])
  })
})

