import { expect, test } from "bun:test"
import { desktopPetLayout } from "./webp-layout"

test("idle and listening keep the same visible height and foot anchor", () => {
  const idle = desktopPetLayout("/assets/pet/xiaoxue-idle.webp")
  const listen = desktopPetLayout("/assets/pet/xiaoxue-listen.webp")
  expect(idle.scale * 838).toBeCloseTo(listen.scale * 721, 8)
  expect((899 - 960 + (idle.y / 100) * 960) * idle.scale).toBeCloseTo(0, 8)
  expect((903 - 960 + (listen.y / 100) * 960) * listen.scale).toBeCloseTo(0, 8)
  expect(((79 + 352) / 2 - (listen.x / 100) * 720) * listen.scale).toBeCloseTo(0, 8)
})
