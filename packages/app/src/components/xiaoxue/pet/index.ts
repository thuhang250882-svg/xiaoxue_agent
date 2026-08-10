/**
 * Xiaoxue Pet Module
 *
 * Desktop pet system for the 录井小雪 (Xiaoxue) enterprise agent.
 * Provides the floating pet overlay, state management, event bridge,
 * and animation system.
 *
 * Usage:
 * ```tsx
 * import { XiaoxuePetOverlay } from "@/components/xiaoxue/pet"
 *
 * // Add to app root for global pet overlay:
 * <XiaoxuePetOverlay />
 * ```
 */

export { XiaoxuePetOverlay } from "./XiaoxuePetOverlay"
export { ParticleCanvas } from "./ParticleCanvas"
export { XiaoxueWebP, XIAOXUE_WEBP_VIEWS } from "./XiaoxueWebP"
export { usePetState, useLocalPetState } from "./usePetState"
export { createPetEventBridge } from "./PetEventBridge"
export { PET_ANIMATION_STYLES } from "./animations"
export { XIAOXUE_POSE_ASSETS, getPoseAsset, getPoseAssetByFile } from "./asset-manifest"
export { getPoseForState, getAssetFileForState, samePose } from "./XiaoxuePoseMapper"
export type { XiaoxuePoseAsset, XiaoxuePoseOrientation } from "./asset-manifest"
export type { PoseMapping } from "./XiaoxuePoseMapper"
export {
  PET_VISUAL_MAP,
  PET_CLICK_MENU_ITEMS,
  PET_DEFAULT_MESSAGES,
  STATE_AUTO_IDLE_MS,
  type PetVisualConfig,
  type PetMenuItem,
} from "./state"
export type { XiaoxueState } from "./state"
