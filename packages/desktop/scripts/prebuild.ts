#!/usr/bin/env bun
import { $ } from "bun"

import { resolveChannel } from "./utils"

const channel = resolveChannel()
if (process.env.XIAOXUE_RELEASE_PROFILE === "rc") await $`bun ./scripts/materialize-xiaoxue-rc-skills.ts`
else await $`bun ./scripts/generate-resource-integrity.ts`
await $`bun ./scripts/copy-icons.ts ${channel}`
await $`bun ./scripts/copy-metainfo.ts ${channel}`

await $`cd ../opencode && bun script/build-node.ts`
