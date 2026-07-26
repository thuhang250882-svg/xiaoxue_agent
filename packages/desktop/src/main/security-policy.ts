import path from "node:path"
import { enterprisePolicy } from "./enterprise-policy"

const APPROVED_APP_NAMES = new Set([
  "Visual Studio Code",
  "Cursor",
  "Zed",
  "TextMate",
  "Antigravity",
  "Terminal",
  "iTerm",
  "Ghostty",
  "Warp",
  "Xcode",
  "Android Studio",
  "Sublime Text",
  "code",
  "cursor",
  "zed",
  "powershell",
])

export function isApprovedAppName(appName: string) {
  const managed = enterprisePolicy().allowedApplications
  return APPROVED_APP_NAMES.has(appName) && (!managed.length || managed.includes(appName))
}

export function allowedExternalURL(value: string, approvedHosts = managedExternalHosts()) {
  const url = new URL(value)
  if (!["https:", "http:", "mailto:"].includes(url.protocol)) {
    throw new Error(`不允许打开外部协议：${url.protocol}`)
  }
  if (url.username || url.password) throw new Error("外部链接不能包含嵌入式凭据。")
  if (
    enterprisePolicy().offline &&
    ["https:", "http:"].includes(url.protocol) &&
    !["127.0.0.1", "localhost", "::1"].includes(url.hostname)
  ) {
    throw new Error("企业离线策略禁止访问外部网络。")
  }
  if (
    approvedHosts.length &&
    ["https:", "http:"].includes(url.protocol) &&
    !approvedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  ) {
    throw new Error(`外部链接域名未获企业策略批准：${url.hostname}`)
  }
  return url
}

export function allowedLocalPath(value: string) {
  if (!path.isAbsolute(value)) throw new Error("只能打开绝对路径。")
  const roots = [...enterprisePolicy().projectRoots, ...enterprisePolicy().knowledgeRoots].map((root) =>
    path.resolve(root),
  )
  const target = path.resolve(value)
  if (
    roots.length &&
    !roots.some((root) => {
      const relative = path.relative(root, target)
      return !relative.startsWith("..") && !path.isAbsolute(relative)
    })
  ) {
    throw new Error("该路径不在企业策略批准的项目或知识目录中。")
  }
  return target
}

function managedExternalHosts() {
  const configured = (process.env.XIAOXUE_EXTERNAL_URL_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
  return configured.length ? configured : enterprisePolicy().allowedExternalHosts
}
