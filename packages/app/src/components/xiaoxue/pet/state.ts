/**
 * Pet Animation State System
 *
 * Defines animation states, visual mappings, and configuration for the
 * Xiaoxue desktop pet. Maps agent states to visual animations.
 */

import type { XiaoxueState } from "../../../../../../avatar/xiaoxue_pet/state"
export type { XiaoxueState } from "../../../../../../avatar/xiaoxue_pet/state"

// ─── Animation State ───────────────────────────────────────────────────────────

export type PetAnimationState = XiaoxueState

export type PetVisualConfig = {
  /** CSS animation class applied to the avatar */
  animation: string
  /** Particle color (hex) for canvas effects */
  particleColor: string
  /** Particle count multiplier */
  particleIntensity: number
  /** Badge color variant */
  badgeVariant: "default" | "active" | "success" | "error"
  /** Avatar scale during this state */
  scale: number
  /** Glow ring color */
  glowColor: string
  /** Status message shown on hover tooltip */
  tooltip: string
}

// ─── Visual Configuration Map ─────────────────────────────────────────────────

export const PET_VISUAL_MAP: Record<XiaoxueState, PetVisualConfig> = {
  idle: {
    animation: "pet-idle",
    particleColor: "#60a5fa",
    particleIntensity: 0.3,
    badgeVariant: "default",
    scale: 1,
    glowColor: "rgba(96, 165, 250, 0.15)",
    tooltip: "待命中 — 随时为您服务",
  },
  waiting: {
    animation: "pet-idle",
    particleColor: "#64748b",
    particleIntensity: 0.35,
    badgeVariant: "active",
    scale: 1,
    glowColor: "rgba(100, 116, 139, 0.18)",
    tooltip: "正在等待外部结果或您的后续输入…",
  },
  listen: {
    animation: "pet-listen",
    particleColor: "#a78bfa",
    particleIntensity: 0.6,
    badgeVariant: "active",
    scale: 1.05,
    glowColor: "rgba(167, 139, 250, 0.2)",
    tooltip: "正在倾听您的需求…",
  },
  speaking: {
    animation: "pet-listen",
    particleColor: "#8b5cf6",
    particleIntensity: 0.7,
    badgeVariant: "active",
    scale: 1.05,
    glowColor: "rgba(139, 92, 246, 0.22)",
    tooltip: "正在向您说明结果…",
  },
  thinking: {
    animation: "pet-thinking",
    particleColor: "#f59e0b",
    particleIntensity: 0.8,
    badgeVariant: "active",
    scale: 1.02,
    glowColor: "rgba(245, 158, 11, 0.2)",
    tooltip: "正在分析和整理思路…",
  },
  searching: {
    animation: "pet-searching",
    particleColor: "#06b6d4",
    particleIntensity: 0.7,
    badgeVariant: "active",
    scale: 1,
    glowColor: "rgba(6, 182, 212, 0.2)",
    tooltip: "正在检索专业资料…",
  },
  reading: {
    animation: "pet-reading",
    particleColor: "#8b5cf6",
    particleIntensity: 0.5,
    badgeVariant: "active",
    scale: 1,
    glowColor: "rgba(139, 92, 246, 0.2)",
    tooltip: "正在读取文档内容…",
  },
  writing: {
    animation: "pet-writing",
    particleColor: "#10b981",
    particleIntensity: 0.6,
    badgeVariant: "active",
    scale: 1,
    glowColor: "rgba(16, 185, 129, 0.2)",
    tooltip: "正在撰写文档材料…",
  },
  reviewing: {
    animation: "pet-reviewing",
    particleColor: "#f97316",
    particleIntensity: 0.9,
    badgeVariant: "active",
    scale: 1.03,
    glowColor: "rgba(249, 115, 22, 0.2)",
    tooltip: "正在审核报告内容…",
  },
  success: {
    animation: "pet-success",
    particleColor: "#22c55e",
    particleIntensity: 1.2,
    badgeVariant: "success",
    scale: 1.1,
    glowColor: "rgba(34, 197, 94, 0.3)",
    tooltip: "当前任务或普通步骤已完成！",
  },
  celebrate: {
    animation: "pet-success",
    particleColor: "#f59e0b",
    particleIntensity: 1.4,
    badgeVariant: "success",
    scale: 1.1,
    glowColor: "rgba(245, 158, 11, 0.35)",
    tooltip: "项目交付或关键里程碑已完成！",
  },
  warning: {
    animation: "pet-warning",
    particleColor: "#eab308",
    particleIntensity: 0.7,
    badgeVariant: "error",
    scale: 1,
    glowColor: "rgba(234, 179, 8, 0.25)",
    tooltip: "需要您的确认…",
  },
  error: {
    animation: "pet-error",
    particleColor: "#ef4444",
    particleIntensity: 1,
    badgeVariant: "error",
    scale: 0.98,
    glowColor: "rgba(239, 68, 68, 0.25)",
    tooltip: "处理遇到问题，请检查输入",
  },
}

// ─── State Duration (ms) ──────────────────────────────────────────────────────
// Auto-return to idle after this duration (0 = manual)

export const STATE_AUTO_IDLE_MS: Partial<Record<XiaoxueState, number>> = {
  success: 5000,
  celebrate: 5000,
  error: 8000,
  warning: 0,
}

// ─── Click Menu Items ─────────────────────────────────────────────────────────

export type PetMenuItem = {
  id: string
  label: string
  icon: string
  action: string
  agent?: string
  prompt?: string
}

export const PET_CLICK_MENU_ITEMS: PetMenuItem[] = [
  {
    id: "review-report",
    label: "审核报告",
    icon: "review",
    action: "session",
    agent: "report",
    prompt: "请使用 report agent 进行地质录井报告审核。",
  },
  {
    id: "write-doc",
    label: "写材料",
    icon: "edit",
    action: "session",
    agent: "office",
    prompt: "请使用 office agent 处理企业办公任务。",
  },
  {
    id: "query-knowledge",
    label: "查知识",
    icon: "magnifying-glass",
    action: "session",
    agent: "knowledge",
    prompt: "请使用 knowledge agent 查询企业知识库。",
  },
  {
    id: "review-tender",
    label: "审核标书",
    icon: "filetree",
    action: "session",
    agent: "tender",
    prompt: "请使用 tender agent 进行标书智能审核。",
  },
  {
    id: "new-session",
    label: "新对话",
    icon: "edit",
    action: "session",
  },
]

// ─── Default Messages ─────────────────────────────────────────────────────────

export const PET_DEFAULT_MESSAGES: Record<XiaoxueState, string> = {
  idle: "选择一个任务开始。",
  waiting: "正在等待外部结果或您的后续输入。",
  listen: "收到，正在理解您的需求。",
  speaking: "正在向您说明结果和下一步建议。",
  thinking: "正在汇总问题等级和修改建议。",
  searching: "正在检索制度、标准和历史样例。",
  reading: "正在读取报告文本、段落和表格。",
  writing: "正在组织公司常用文档结构。",
  reviewing: "正在检查报告结构、井号、层位、岩性和油气显示。",
  success: "当前任务或普通步骤已完成。",
  celebrate: "项目交付或关键里程碑已完成，值得庆祝！",
  warning: "当前任务需要确认。",
  error: "当前任务未完成，需要检查输入资料。",
}
