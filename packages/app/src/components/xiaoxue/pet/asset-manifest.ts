/**
 * Asset Manifest — 录井小雪 2.5D Pose Assets
 *
 * 10张AI生成姿态图片的正式清单。
 * 每张图片经过人工审查：朝向、手势、是否持岩、身体姿势、适合状态。
 */

export type XiaoxuePoseOrientation =
  | "portrait-front"
  | "front"
  | "front-left"
  | "front-right"
  | "left"
  | "right"
  | "right-profile"
  | "back"
  | "top-down"
  | "hero-low-angle"

export type XiaoxuePoseAsset = {
  id: string
  file: string
  orientation: XiaoxuePoseOrientation
  holdsRock: boolean
  /** 面部是否可见 */
  faceVisible: boolean
  /** 身体完整度 */
  framing: "portrait" | "full-body"
  suitableStates: readonly string[]
  /** 渲染锚点（人物脚底中心归一化坐标） */
  anchor: { x: number; y: number }
  /** 默认缩放 */
  scale: number
}

export const XIAOXUE_POSE_ASSETS: XiaoxuePoseAsset[] = [
  {
    id: "portrait-front",
    file: "/assets/pet/xiaoxue-portrait-front.png",
    orientation: "portrait-front",
    holdsRock: true,
    faceVisible: true,
    framing: "portrait",
    suitableStates: ["idle", "listen", "success"],
    anchor: { x: 0.5, y: 0.85 },
    scale: 1.0,
  },
  {
    id: "front-rock",
    file: "/assets/pet/xiaoxue-front-rock.png",
    orientation: "front",
    holdsRock: true,
    faceVisible: true,
    framing: "full-body",
    suitableStates: ["reviewing"],
    anchor: { x: 0.5, y: 0.95 },
    scale: 1.0,
  },
  {
    id: "left-rock",
    file: "/assets/pet/xiaoxue-left-rock.png",
    orientation: "left",
    holdsRock: true,
    faceVisible: true,
    framing: "full-body",
    suitableStates: ["searching"],
    anchor: { x: 0.5, y: 0.95 },
    scale: 1.0,
  },
  {
    id: "back-rock",
    file: "/assets/pet/xiaoxue-back-rock.png",
    orientation: "back",
    holdsRock: true,
    faceVisible: false,
    framing: "full-body",
    suitableStates: ["writing"],
    anchor: { x: 0.5, y: 0.95 },
    scale: 1.0,
  },
  {
    id: "front-left-rock",
    file: "/assets/pet/xiaoxue-front-left-rock.png",
    orientation: "front-left",
    holdsRock: true,
    faceVisible: true,
    framing: "full-body",
    suitableStates: ["thinking"],
    anchor: { x: 0.5, y: 0.95 },
    scale: 1.0,
  },
  {
    id: "front-right-rock",
    file: "/assets/pet/xiaoxue-front-right-rock.png",
    orientation: "front-right",
    holdsRock: true,
    faceVisible: true,
    framing: "full-body",
    suitableStates: ["reading"],
    anchor: { x: 0.5, y: 0.95 },
    scale: 1.0,
  },
  {
    id: "right-rock",
    file: "/assets/pet/xiaoxue-right-rock.png",
    orientation: "right",
    holdsRock: true,
    faceVisible: true,
    framing: "full-body",
    suitableStates: ["warning"],
    anchor: { x: 0.5, y: 0.95 },
    scale: 1.0,
  },
  {
    id: "right-profile-rock",
    file: "/assets/pet/xiaoxue-right-profile-rock.png",
    orientation: "right-profile",
    holdsRock: true,
    faceVisible: true,
    framing: "full-body",
    suitableStates: ["error"],
    anchor: { x: 0.5, y: 0.95 },
    scale: 1.0,
  },
  {
    id: "top-down-rock",
    file: "/assets/pet/xiaoxue-top-down-rock.png",
    orientation: "top-down",
    holdsRock: true,
    faceVisible: false,
    framing: "full-body",
    suitableStates: ["thinking"],
    anchor: { x: 0.5, y: 0.9 },
    scale: 1.0,
  },
  {
    id: "hero-low-angle",
    file: "/assets/pet/xiaoxue-hero-low-angle.png",
    orientation: "hero-low-angle",
    holdsRock: true,
    faceVisible: true,
    framing: "full-body",
    suitableStates: ["success", "celebrate"],
    anchor: { x: 0.5, y: 0.95 },
    scale: 1.0,
  },
]

/** 获取指定ID的资产 */
export function getPoseAsset(id: string): XiaoxuePoseAsset | undefined {
  return XIAOXUE_POSE_ASSETS.find((a) => a.id === id)
}

/** 获取指定文件路径的资产 */
export function getPoseAssetByFile(file: string): XiaoxuePoseAsset | undefined {
  return XIAOXUE_POSE_ASSETS.find((a) => a.file === file)
}
