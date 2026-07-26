import { existsSync, readFileSync, realpathSync } from "node:fs"
import path from "node:path"
import { enterprisePolicy } from "./enterprise-policy"

const connectors = [
  { id: "local-files", label: "本地文件与项目目录", capabilities: ["search", "read"] },
  { id: "smb", label: "SMB 企业文件服务器", capabilities: ["search", "read"] },
  { id: "wps", label: "WPS 协作与文档", capabilities: [] },
  { id: "wecom", label: "企业微信", capabilities: [] },
  { id: "dingtalk", label: "钉钉", capabilities: [] },
  { id: "feishu", label: "飞书", capabilities: [] },
  { id: "outlook-sharepoint", label: "Outlook / SharePoint", capabilities: [] },
  { id: "oa-contract", label: "OA / 合同系统", capabilities: [] },
] as const

export function enterpriseConnectors() {
  const policy = enterprisePolicy()
  return connectors.map((connector) => {
    const enabled = policy.allowedConnectors.includes(connector.id)
    const roots = connectorRoots(connector.id)
    const status = !enabled
      ? ("blocked_by_policy" as const)
      : connector.id === "local-files"
        ? ("ready" as const)
        : connector.id === "smb" && roots.some(existsSync)
          ? ("ready" as const)
          : connector.id === "smb" && roots.length
            ? ("unavailable" as const)
            : ("requires_configuration" as const)
    return { ...connector, enabled, status, roots }
  })
}

export function connectorRoots(connector: string) {
  const roots = [...enterprisePolicy().projectRoots, ...enterprisePolicy().knowledgeRoots]
  if (connector === "local-files") return roots.filter((root) => !isNetworkPath(root))
  if (connector === "smb") return roots.filter(isNetworkPath)
  return []
}

export function readConnectorFile(connector: "local-files" | "smb", root: string, relativePath: string) {
  if (!enterprisePolicy().allowedConnectors.includes(connector)) throw new Error(`连接器已被企业策略禁止：${connector}`)
  if (!connectorRoots(connector).some((entry) => samePath(entry, root))) throw new Error("目录不在连接器授权范围内。")
  const base = realpathSync(root)
  const target = realpathSync(path.resolve(base, relativePath))
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) throw new Error("禁止访问授权目录之外的文件。")
  return readFileSync(target)
}

function isNetworkPath(value: string) {
  return value.startsWith("\\\\") || value.startsWith("//")
}

function samePath(left: string, right: string) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
}
