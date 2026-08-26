import { homedir, tmpdir } from "node:os"
import path from "node:path"
import { StorageHealthScanner } from "@opencode-ai/core/storage-health"

export function storageHealthTargets(userDataPath: string): StorageHealthScanner.Target[] {
  const data = path.join(process.env.XDG_DATA_HOME ?? path.join(homedir(), ".local", "share"), "opencode")
  const cache = path.join(process.env.XDG_CACHE_HOME ?? path.join(homedir(), ".cache"), "opencode")
  const logs = [path.join(userDataPath, "logs"), path.join(data, "log"), path.join(userDataPath, "opencode", "log")]

  return [
    {
      id: "session-database",
      category: "SQLITE",
      path: data,
      include: /^opencode(?:-[^/\\]+)?\.db(?:-(?:wal|shm))?$/,
      maxDepth: 0,
      maxItems: 100,
    },
    {
      id: "governance-database",
      category: "SQLITE",
      path: path.join(userDataPath, "xiaoxue", "governance.sqlite"),
      maxItems: 1,
    },
    {
      id: "global-state",
      category: "GLOBAL_STATE",
      path: userDataPath,
      include: /^opencode\.global\.dat(?:\.(?:bak|tmp))?$/,
      maxDepth: 0,
      maxItems: 2_000,
    },
    {
      id: "workspace-state",
      category: "WORKSPACE_STATE",
      path: userDataPath,
      include: /^opencode\.workspace\..+\.dat(?:\.(?:bak|tmp))?$/,
      maxDepth: 0,
      maxItems: 2_000,
    },
    {
      id: "draft-state",
      category: "DRAFT",
      path: userDataPath,
      include: /^opencode\.draft\..+\.dat(?:\.(?:bak|tmp))?$/,
      maxDepth: 0,
      maxItems: 2_000,
    },
    {
      id: "trusted-attachment-registry",
      category: "ATTACHMENT",
      path: path.join(userDataPath, "xiaoxue", "trusted-attachments"),
      maxDepth: 2,
      maxItems: 10_000,
    },
    ...[...new Set(logs)].map(
      (root, index): StorageHealthScanner.Target => ({
        id: `logs-${index + 1}`,
        category: "LOG",
        path: root,
        maxDepth: 3,
        maxItems: 10_000,
      }),
    ),
    {
      id: "runtime-cache",
      category: "CACHE",
      path: cache,
      maxDepth: 4,
      maxItems: 25_000,
    },
    {
      id: "tool-output-cache",
      category: "CACHE",
      path: path.join(data, "tool-output"),
      maxDepth: 1,
      maxItems: 25_000,
    },
    {
      id: "runtime-temp",
      category: "TEMP",
      path: path.join(tmpdir(), "opencode"),
      maxDepth: 3,
      maxItems: 25_000,
    },
    {
      id: "document-extraction-cache",
      category: "DOCUMENT_EXTRACTION_CACHE",
      path: "",
      discoveryStatus: "NOT_APPLICABLE",
      reason: "No dedicated document extraction cache is owned by the current runtime.",
    },
    {
      id: "ocr-cache",
      category: "OCR_CACHE",
      path: "",
      discoveryStatus: "NOT_APPLICABLE",
      reason: "No dedicated OCR cache is owned by the current runtime.",
    },
    {
      id: "vector-index",
      category: "VECTOR_INDEX",
      path: "",
      discoveryStatus: "NOT_APPLICABLE",
      reason: "No dedicated vector index storage is owned by the current runtime.",
    },
  ]
}

export function scanDesktopStorageHealth(userDataPath: string) {
  return StorageHealthScanner.scan(storageHealthTargets(userDataPath))
}
