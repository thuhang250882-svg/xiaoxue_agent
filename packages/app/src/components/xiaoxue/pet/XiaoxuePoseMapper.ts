/**
 * PoseMapper — Maps XiaoxueState → PoseAsset
 *
 * Deterministic mapping from agent state to the best matching pose image.
 * Each state has a primary and optional fallback pose.
 */

import type { XiaoxueState } from "./state"
import { XIAOXUE_POSE_ASSETS, type XiaoxuePoseAsset } from "./asset-manifest"

export type PoseMapping = {
  asset: XiaoxuePoseAsset
  effect: "idle" | "listen" | "thinking" | "search" | "document" | "scan" | "success" | "warning" | "error"
}

// Asset lookup by ID for clarity (avoids fragile index numbers)
const A = Object.fromEntries(XIAOXUE_POSE_ASSETS.map((a) => [a.id, a])) as Record<string, XiaoxuePoseAsset>

const STATE_POSE_MAP: Record<XiaoxueState, PoseMapping> = {
  idle: {
    asset: A["portrait-front"],        // 正面特写微笑
    effect: "idle",
  },
  waiting: {
    asset: A["portrait-front"],        // 正面等待结果
    effect: "idle",
  },
  listen: {
    asset: A["portrait-front"],        // 正面微笑倾听
    effect: "listen",
  },
  speaking: {
    asset: A["portrait-front"],        // 正面说明结果
    effect: "listen",
  },
  thinking: {
    asset: A["top-down-rock"],         // 俯视 — 思考/审视
    effect: "thinking",
  },
  searching: {
    asset: A["left-rock"],             // 左侧检索
    effect: "search",
  },
  reading: {
    asset: A["front-right-rock"],      // 微侧阅读
    effect: "document",
  },
  writing: {
    asset: A["back-rock"],             // 背面书写
    effect: "document",
  },
  reviewing: {
    asset: A["front-rock"],            // 正面审核
    effect: "scan",
  },
  success: {
    asset: A["hero-low-angle"],        // 仰视英雄 — 庆祝
    effect: "success",
  },
  celebrate: {
    asset: A["hero-low-angle"],        // 仰视英雄 — 庆祝
    effect: "success",
  },
  warning: {
    asset: A["right-rock"],            // 右侧警告
    effect: "warning",
  },
  error: {
    asset: A["right-profile-rock"],    // 右侧profile — 错误
    effect: "error",
  },
}

/**
 * 获取状态对应的姿态映射
 */
export function getPoseForState(state: XiaoxueState): PoseMapping {
  return STATE_POSE_MAP[state] ?? STATE_POSE_MAP.idle
}

/**
 * 获取状态对应的资产文件路径
 */
export function getAssetFileForState(state: XiaoxueState): string {
  return getPoseForState(state).asset.file
}

/**
 * 检查两个状态是否使用同一张图片
 */
export function samePose(a: XiaoxueState, b: XiaoxueState): boolean {
  return getPoseForState(a).asset.id === getPoseForState(b).asset.id
}
