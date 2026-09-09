// Visible alpha bounds in the 720x960 source frames (not the padded canvas).
// A shared height and foot anchor prevent animation changes from resizing the pet.
const bounds: Record<string, readonly [number, number, number, number]> = {
  idle: [234, 61, 482, 899],
  "idle-random": [131, 66, 491, 930],
  listen: [79, 182, 352, 903],
  waiting: [236, 67, 479, 907],
  speaking: [160, 63, 519, 899],
  thinking: [210, 76, 488, 898],
  searching: [75, 217, 513, 916],
  reading: [235, 65, 489, 899],
  writing: [163, 62, 557, 901],
  success: [235, 104, 562, 914],
  celebrate: [157, 76, 530, 904],
  error: [257, 60, 515, 899],
}

export function desktopPetLayout(src: string) {
  const box = bounds[src.split("xiaoxue-").at(-1)?.replace(".webp", "") ?? "idle"] ?? bounds.idle
  return {
    scale: (838 * 0.58) / (box[3] - box[1]),
    x: ((box[0] + box[2]) / 2 / 720) * 100,
    y: ((960 - box[3]) / 960) * 100,
  }
}
