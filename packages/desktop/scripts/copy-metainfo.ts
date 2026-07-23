import { resolveChannel } from "./utils"

const arg = process.argv[2]
const channel = arg === "dev" || arg === "beta" || arg === "prod" ? arg : resolveChannel()

const appId = channel === "prod" ? "ai.xiaoxue.desktop" : `ai.xiaoxue.desktop.${channel}`
const productName = channel === "prod" ? "录井小雪" : `录井小雪 ${channel.charAt(0).toUpperCase() + channel.slice(1)}`
const summary = `地质录井报告审核和日常办公的本地化智能助手${channel !== "prod" ? ` (${channel})` : ""}`

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>${appId}</id>

  <metadata_license>CC0-1.0</metadata_license>
  <project_license>MIT</project_license>

  <name>${productName}</name>
  <summary>${summary}</summary>

  <developer id="xiaoxue.team">
    <name>xiaoxue_Agent Team</name>
  </developer>

  <description>
    <p>
      录井小雪是基于 AI 的地质录井报告审核和日常办公本地化智能助手。
    </p>
  </description>

  <launchable type="desktop-id">${appId}.desktop</launchable>

  <content_rating type="oars-1.1" />

  <screenshots>
    <screenshot type="default">
      <image></image>
    </screenshot>
  </screenshots>
</component>
`

await Bun.write(`resources/${appId}.metainfo.xml`, xml)
console.log(`Generated metainfo for ${channel} at resources/${appId}.metainfo.xml`)
