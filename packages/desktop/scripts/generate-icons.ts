import { $ } from "bun"
import { mkdir, readdir, writeFile, copyFile } from "node:fs/promises"
import { join, basename } from "node:path"

const SOURCE_ICON = "./app-icon.png"
const CHANNELS = ["dev", "beta", "prod"] as const

// Windows icons sizes
const WINDOWS_SIZES = [
  "30x30",
  "44x44",
  "71x71",
  "89x89",
  "107x107",
  "142x142",
  "150x150",
  "284x284",
  "310x310",
]

// Main icon sizes for different platforms
const ICON_SIZES = [
  { size: 32, name: "32x32" },
  { size: 64, name: "64x64" },
  { size: 128, name: "128x128" },
  { size: 256, name: "128x128@2x" },
  { size: 512, name: "512@2x" },
]

async function generateIcons() {
  console.log("Generating icons from app-icon.png...")

  for (const channel of CHANNELS) {
    const channelDir = `./icons/${channel}`
    await mkdir(channelDir, { recursive: true })

    // Copy main icon
    await copyFile(SOURCE_ICON, join(channelDir, "icon.png"))
    console.log(`Copied icon to ${channelDir}/icon.png`)

    // Generate different sizes using ImageMagick or similar
    // For now, we'll copy the source icon and let electron-builder handle resizing
    for (const { name } of ICON_SIZES) {
      await copyFile(SOURCE_ICON, join(channelDir, `${name}.png`))
    }

    // Copy for Windows Square logos
    for (const size of WINDOWS_SIZES) {
      await copyFile(SOURCE_ICON, join(channelDir, `Square${size}Logo.png`))
    }

    // Copy dock icon for macOS
    await copyFile(SOURCE_ICON, join(channelDir, "dock.png"))

    console.log(`Generated icons for channel: ${channel}`)
  }

  console.log("Icon generation complete!")
  console.log("Note: For production, use proper icon generation tools like:")
  console.log("- electron-icon-maker")
  console.log("- @electron-forge/maker-squirrel")
  console.log("- Or use ImageMagick/Sharp for precise resizing")
}

generateIcons().catch(console.error)
