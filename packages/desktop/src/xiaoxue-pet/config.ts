export type PetWindowMode = "avatar" | "expanded" | "hidden"

export const XIAOXUE_PET_WINDOW = {
  width: 360,
  height: 520,
  minWidth: 240,
  minHeight: 300,
  maxWidth: 600,
  maxHeight: 900,
  margin: 16,
  alwaysOnTop: true,
  mousePassthrough: false,
  openOnStartup: true,
  avatar: {
    size: 88,
    borderRadius: 44,
    cameraFOV: 35,
    cameraOffsetY: 0.8,
    cameraDistance: 2.0,
  },
} as const
