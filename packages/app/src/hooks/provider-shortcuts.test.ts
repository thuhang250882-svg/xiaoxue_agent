import { describe, expect, test } from "bun:test"
import { popularProviders } from "./provider-shortcuts"

describe("provider shortcuts", () => {
  test("does not promote public vendors in a private deployment", () => {
    expect(popularProviders).toEqual([])
  })
})
