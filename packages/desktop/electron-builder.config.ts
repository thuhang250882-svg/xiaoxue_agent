import { execFile } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import type { Configuration } from "electron-builder"

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)
const packageDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(packageDir, "../..")
// Use the installed Electron package's distribution instead of downloading the
// release zip on every package run — required for reproducible offline builds.
const electronDist = path.join(path.dirname(require.resolve("electron/package.json")), "dist")
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

const updateChannel = (() => {
  // Only validate XIAOXUE_UPDATE_CHANNEL in production builds (enterprise releases).
  if (process.env.OPENCODE_CHANNEL !== "prod") return undefined
  const raw = process.env.XIAOXUE_UPDATE_CHANNEL
  if (raw === "latest" || raw === "internal" || raw === "beta") return raw
  throw new Error(`Invalid update channel "${raw}"; must be one of: latest, internal, beta`)
})()

const requireSigning = process.env.XIAOXUE_REQUIRE_SIGNING === "true"
const releaseProfile = (() => {
  const raw = process.env.XIAOXUE_RELEASE_PROFILE
  if (!raw || raw === "platform") return "platform"
  if (raw === "rc") return raw
  throw new Error(`Invalid XIAOXUE_RELEASE_PROFILE "${raw}"; must be platform or rc`)
})()

// 产品版本独立于 package.json 中的上游内核版本（如 1.18.6）：设置
// XIAOXUE_PRODUCT_VERSION 后安装器按"录井小雪-产品版本"命名，避免试用人员
// 把内核版本误认为产品版本。正式发布必须显式指定，缺失时直接失败。
const productVersion = process.env.XIAOXUE_PRODUCT_VERSION
if (!productVersion && channel === "prod")
  throw new Error("XIAOXUE_PRODUCT_VERSION is required for prod builds, e.g. 0.8.0-rc.2")

const artifactName = productVersion
  ? `录井小雪-${productVersion}-\${os}-\${arch}.\${ext}`
  : "xiaoxue-desktop-${version}-${os}-${arch}.${ext}"

const APP_IDS = {
  dev: "cn.xbzty.xiaoxue.dev",
  beta: "cn.xbzty.xiaoxue.beta",
  prod: "cn.xbzty.xiaoxue",
} as const

const getBase = (appId: string): Configuration => ({
  artifactName,
  forceCodeSigning: requireSigning,
  electronDist,
  directories: {
    output: "dist/xiaoxue-output",
    buildResources: "resources",
  },
  // Linux launchers are .desktop files, so this is the desktop file name,
  // not just the app id. For prod, app id "ai.opencode.desktop" becomes
  // "ai.opencode.desktop.desktop".
  // https://developer.gnome.org/documentation/guidelines/maintainer/integrating.html
  // https://www.electron.build/docs/linux/
  extraMetadata: {
    // electron-builder derives the updater-safe asset name from package name.
    // Keep it unscoped so GitHub Release assets never contain a slash.
    name: "xiaoxue-desktop",
    desktopName: `${appId}.desktop`,
  },
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    grantFileProtocolExtraPrivileges: false,
  },
  files:
    releaseProfile === "rc"
      ? [
          "out/**/*",
          "resources/**/*",
          "!resources/integrity.json",
          "!resources/staging/**",
          { from: "resources/staging/integrity.json", to: "resources/integrity.json" },
        ]
      : ["out/**/*", "resources/**/*", "!resources/staging/**"],
  extraResources: [
    {
      from: "native/",
      to: "native/",
      filter: ["index.js", "index.d.ts", "build/Release/mac_window.node", "swift-build/**"],
    },
    // Bundle the preset xiaoxue skills so any install location can load them
    // at runtime via process.resourcesPath (see main/skills.ts).
    {
      from: releaseProfile === "rc" ? "resources/staging/skills/" : "../../.opencode/skills/",
      to: "skills/",
      filter: ["**/*", "!**/.DS_Store", "!**/Thumbs.db", "!**/desktop.ini"],
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
    signExts: requireSigning ? [".exe", ".dll", ".node", ".pyd"] : [],
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
    // NSIS 安装器：一键安装到用户目录并创建桌面/开始菜单快捷方式。
    // portable 目标只会生成免安装单文件，双击直接运行、没有安装过程。
    target: ["nsis"],
    verifyUpdateCodeSignature: true,
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    createDesktopShortcut: "always",
    createStartMenuShortcut: true,
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
          channel: updateChannel,
        },
        deb: { fpm: [legacyDesktopEntryFpm] },
        rpm: { packageName: "xiaoxue", fpm: [legacyDesktopEntryFpm] },
      }
    }
  }
}

export default getConfig()
