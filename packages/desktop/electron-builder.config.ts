import { execFile } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import type { Configuration } from "electron-builder"

const execFileAsync = promisify(execFile)
const packageDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(packageDir, "../..")
const signScript = path.join(rootDir, "script", "sign-windows.ps1")
// The Electron 42 packaging update briefly installed Linux launchers/icons under
// "opencode-desktop". Keep that hidden desktop entry around so existing GNOME/KDE
// pins still resolve after the canonical Xiaoxue app id.
const legacyDesktopEntry = path.join(packageDir, "resources", "linux", "opencode-desktop.desktop")
const legacyDesktopEntryFpm = `${legacyDesktopEntry}=/usr/share/applications/opencode-desktop.desktop`

async function signWindows(configuration: { path: string }) {
  if (process.platform !== "win32") return
  if (process.env.GITHUB_ACTIONS !== "true") return

  await execFileAsync(
    "pwsh",
    ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", signScript, configuration.path],
    { cwd: rootDir },
  )
}

const channel = (() => {
  const raw = process.env.OPENCODE_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "dev"
})()

const APP_IDS = {
  dev: "cn.xbzty.xiaoxue.dev",
  beta: "cn.xbzty.xiaoxue.beta",
  prod: "cn.xbzty.xiaoxue",
} as const

const getBase = (appId: string): Configuration => ({
  artifactName: "xiaoxue-desktop-${os}-${arch}.${ext}",
  directories: {
    output: "dist",
    buildResources: "resources",
  },
  // Linux launchers are .desktop files, so this is the desktop file name,
  // not just the app id. For prod, app id "ai.opencode.desktop" becomes
  // "ai.opencode.desktop.desktop".
  // https://developer.gnome.org/documentation/guidelines/maintainer/integrating.html
  // https://www.electron.build/docs/linux/
  extraMetadata: {
    desktopName: `${appId}.desktop`,
  },
  files: ["out/**/*", "resources/**/*"],
  extraResources: [
    {
      from: "native/",
      to: "native/",
      filter: ["index.js", "index.d.ts", "build/Release/mac_window.node", "swift-build/**"],
    },
    // Bundle the preset xiaoxue skills so any install location can load them
    // at runtime via process.resourcesPath (see main/skills.ts).
    {
      from: "../../.opencode/skills/",
      to: "skills/",
      filter: ["**/*"],
    },
    {
      from: "resources/obsidian-plugin/",
      to: "obsidian-plugin/",
      filter: ["manifest.json", "main.js", "styles.css"],
    },
  ],
  mac: {
    category: "public.app-category.developer-tools",
    icon: `resources/icons/icon.icns`,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "resources/entitlements.plist",
    entitlementsInherit: "resources/entitlements.plist",
    notarize: true,
    target: ["dmg", "zip"],
  },
  dmg: {
    sign: true,
  },
  protocols: {
    name: "XiaoXue",
    schemes: ["xiaoxue", "opencode"],
  },
  win: {
    icon: `resources/icons/icon.ico`,
    extraResources: [
      {
        from: "resources/python/",
        to: "python/",
        filter: ["**/*"],
      },
    ],
    signtoolOptions: {
      sign: signWindows,
    },
    target: ["nsis"],
    verifyUpdateCodeSignature: true,
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    installerIcon: `resources/icons/icon.ico`,
    installerHeaderIcon: `resources/icons/icon.ico`,
  },
  linux: {
    icon: `resources/icons`,
    category: "Development",
    executableName: appId,
    desktop: {
      entry: {
        // Match the installed .desktop file and hicolor icon basename so
        // Linux shells can associate the running Electron window with its launcher.
        StartupWMClass: appId,
      },
    },
    target: ["AppImage", "deb", "rpm"],
  },
})

function getConfig() {
  const appId = APP_IDS[channel]
  const base = getBase(appId)

  switch (channel) {
    case "dev": {
      return {
        ...base,
        appId,
        productName: "录井小雪 Dev",
        rpm: { packageName: "xiaoxue-dev" },
      }
    }
    case "beta": {
      return {
        ...base,
        appId,
        productName: "录井小雪 Beta",
        protocols: { name: "XiaoXue Beta", schemes: ["xiaoxue", "opencode"] },
        rpm: { packageName: "xiaoxue-beta" },
      }
    }
    case "prod": {
      return {
        ...base,
        appId,
        productName: "录井小雪",
        protocols: { name: "XiaoXue", schemes: ["xiaoxue", "opencode"] },
        publish: {
          provider: "github",
          owner: "thuhang250882-svg",
          repo: "xiaoxue_agent",
          channel: "latest",
        },
        deb: { fpm: [legacyDesktopEntryFpm] },
        rpm: { packageName: "xiaoxue", fpm: [legacyDesktopEntryFpm] },
      }
    }
  }
}

export default getConfig()
