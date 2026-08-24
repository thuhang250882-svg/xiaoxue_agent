import { createHash } from "node:crypto"
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs"
import path from "node:path"
import type { DirectoryClassification, FingerprintManifest } from "./types"

/**
 * Compute a deterministic fingerprint manifest for a directory.
 *
 * Walks the directory tree recursively, hashing each file's content with SHA-256.
 * Returns a map of relative paths (using forward slashes) to hex digests.
 * Directories are traversed but not included in the manifest.
 * Symlinks are followed (same as readdirSync with followSymlinks).
 */
export function computeFingerprint(dirPath: string): FingerprintManifest {
  const manifest: Record<string, string> = {}
  walkDir(dirPath, dirPath, manifest)
  return manifest
}

function walkDir(root: string, current: string, out: Record<string, string>): void {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const fullPath = path.join(current, entry.name)
    if (entry.isDirectory()) {
      walkDir(root, fullPath, out)
    } else if (entry.isFile()) {
      const rel = path.relative(root, fullPath).split(path.sep).join("/")
      const content = readFileSync(fullPath)
      out[rel] = createHash("sha256").update(content).digest("hex")
    }
  }
}

/**
 * Compare two fingerprint manifests.
 * Returns true if they contain exactly the same set of paths with the same hashes.
 */
export function fingerprintsMatch(a: FingerprintManifest, b: FingerprintManifest): boolean {
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (a[key] !== b[key]) return false
  }
  return true
}

/**
 * Classify a target directory against an expected fingerprint.
 *
 * - ABSENT: directory does not exist
 * - EXACT_KNOWN_LEGACY_ASSET: directory exists and fingerprint matches exactly
 * - MODIFIED_LEGACY_ASSET: directory exists, has the expected files but with different hashes
 * - UNKNOWN_SAME_NAME_ASSET: directory exists but has no overlap with expected files
 */
export function classifyTarget(targetPath: string, expected: FingerprintManifest): DirectoryClassification {
  if (!existsSync(targetPath)) return "ABSENT"

  const stat = statSync(targetPath)
  if (!stat.isDirectory()) return "UNKNOWN_SAME_NAME_ASSET"

  const actual = computeFingerprint(targetPath)
  if (fingerprintsMatch(actual, expected)) return "EXACT_KNOWN_LEGACY_ASSET"

  // Check overlap: if at least one expected file exists (even with different hash), it's modified
  const expectedPaths = Object.keys(expected)
  const actualPaths = Object.keys(actual)
  const hasOverlap = expectedPaths.some((p) => actualPaths.includes(p))

  if (hasOverlap) return "MODIFIED_LEGACY_ASSET"
  return "UNKNOWN_SAME_NAME_ASSET"
}
