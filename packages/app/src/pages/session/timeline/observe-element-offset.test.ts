import { expect, test } from "bun:test"
import { type Virtualizer } from "@tanstack/solid-virtual"
import { mutationNodesContainElement, observeElementOffsetReconnectAware } from "./observe-element-offset"

test("matches only the scroll element or an ancestor containing it", () => {
  const route = document.createElement("section")
  const viewport = document.createElement("div")
  const child = document.createElement("div")
  const sibling = document.createElement("div")
  route.append(viewport)
  viewport.append(child)

  expect(mutationNodesContainElement([viewport], viewport)).toBe(true)
  expect(mutationNodesContainElement([route], viewport)).toBe(true)
  expect(mutationNodesContainElement([child, sibling], viewport)).toBe(false)
})

test("reports a divergent native offset once and ignores equal offsets and unrelated mutations", async () => {
  const route = document.createElement("section")
  const viewport = document.createElement("div")
  const unrelated = document.createElement("div")
  route.append(viewport)
  const root = mount(route)
  const observer = controlledWindow()
  const instance = {
    scrollElement: viewport,
    targetWindow: observer.window,
    scrollOffset: 79_400,
    options: {
      horizontal: false,
      isRtl: false,
      isScrollingResetDelay: 0,
      useScrollendEvent: false,
    },
  } as unknown as Virtualizer<HTMLDivElement, HTMLDivElement>
  const calls: [number, boolean][] = []
  const cleanup = observeElementOffsetReconnectAware(instance, (offset, isScrolling) => {
    calls.push([offset, isScrolling])
    instance.scrollOffset = offset
  })

  document.body.append(unrelated)
  unrelated.remove()
  observer.notify(mutation(root, [], [unrelated]))
  await frames(2)
  expect(calls).toEqual([])

  await reconnect(root, route, observer)
  await waitUntil(() => calls.length === 1)
  expect(calls).toEqual([[0, false]])

  await reconnect(root, route, observer)
  await new Promise((resolve) => setTimeout(resolve, 0))
  await frames(3)
  expect(calls).toEqual([[0, false]])

  cleanup?.()
  root.remove()
})

test("keeps checking until stale reset-delay callbacks can no longer win", async () => {
  const route = document.createElement("section")
  const viewport = document.createElement("div")
  route.append(viewport)
  const root = mount(route)
  const observer = controlledWindow()
  const instance = {
    scrollElement: viewport,
    targetWindow: observer.window,
    scrollOffset: 79_400,
    options: {
      horizontal: false,
      isRtl: false,
      isScrollingResetDelay: 20,
      useScrollendEvent: false,
    },
  } as unknown as Virtualizer<HTMLDivElement, HTMLDivElement>
  const calls: number[] = []
  const cleanup = observeElementOffsetReconnectAware(instance, (offset) => {
    calls.push(offset)
    instance.scrollOffset = offset
  })

  await reconnect(root, route, observer)
  await waitUntil(() => instance.scrollOffset === 0)
  expect(instance.scrollOffset).toBe(0)

  instance.scrollOffset = 79_400
  await new Promise((resolve) => setTimeout(resolve, 25))
  await waitUntil(() => calls.length === 2)

  expect(instance.scrollOffset).toBe(0)
  expect(calls).toEqual([0, 0])
  cleanup?.()
  root.remove()
})

test.each([
  { name: "LTR", isRtl: false, expected: 240 },
  { name: "RTL", isRtl: true, expected: -240 },
])("reports the TanStack horizontal $name offset after reconnect", async ({ isRtl, expected }) => {
  const route = document.createElement("section")
  const viewport = document.createElement("div")
  route.append(viewport)
  const root = mount(route)
  viewport.scrollLeft = 240
  const observer = controlledWindow()
  const instance = {
    scrollElement: viewport,
    targetWindow: observer.window,
    scrollOffset: 0,
    options: {
      horizontal: true,
      isRtl,
      isScrollingResetDelay: 0,
      useScrollendEvent: false,
    },
  } as unknown as Virtualizer<HTMLDivElement, HTMLDivElement>
  const calls: [number, boolean][] = []
  const cleanup = observeElementOffsetReconnectAware(instance, (offset, isScrolling) => {
    calls.push([offset, isScrolling])
    instance.scrollOffset = offset
  })

  await reconnect(root, route, observer)
  await waitUntil(() => calls.length === 1)

  expect(calls).toEqual([[expected, false]])
  cleanup?.()
  root.remove()
})

test("cleanup suppresses an already queued delegated offset callback", async () => {
  const viewport = document.createElement("div")
  document.body.append(viewport)
  viewport.scrollTop = 100
  const instance = {
    scrollElement: viewport,
    targetWindow: window,
    scrollOffset: 0,
    options: {
      horizontal: false,
      isRtl: false,
      isScrollingResetDelay: 10,
      useScrollendEvent: false,
    },
  } as unknown as Virtualizer<HTMLDivElement, HTMLDivElement>
  const calls: [number, boolean][] = []
  const cleanup = observeElementOffsetReconnectAware(instance, (offset, isScrolling) =>
    calls.push([offset, isScrolling]),
  )

  viewport.dispatchEvent(new Event("scroll"))
  cleanup?.()
  await new Promise((resolve) => setTimeout(resolve, 25))

  expect(calls).toEqual([[100, true]])
  viewport.remove()
})

test("cleanup cancels reconnect checks and delegated offset observation", async () => {
  const route = document.createElement("section")
  const viewport = document.createElement("div")
  route.append(viewport)
  const root = mount(route)
  const instance = {
    scrollElement: viewport,
    targetWindow: window,
    scrollOffset: 0,
    options: {
      horizontal: false,
      isRtl: false,
      isScrollingResetDelay: 50,
      useScrollendEvent: false,
    },
  } as unknown as Virtualizer<HTMLDivElement, HTMLDivElement>
  const calls: number[] = []
  const cleanup = observeElementOffsetReconnectAware(instance, (offset) => calls.push(offset))

  route.remove()
  root.append(route)
  await new Promise((resolve) => setTimeout(resolve, 0))
  cleanup?.()
  instance.scrollOffset = 100
  viewport.dispatchEvent(new Event("scroll"))
  await frames(4)

  expect(calls).toEqual([])
  root.remove()
})

async function frames(count: number) {
  for (let index = 0; index < count; index++) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

function mount(element: Element) {
  const root = document.createElement("main")
  root.append(element)
  document.body.append(root)
  return root
}

async function reconnect(root: Element, element: Element, observer?: ReturnType<typeof controlledWindow>) {
  element.remove()
  observer?.notify(mutation(root, [], [element]))
  await new Promise((resolve) => setTimeout(resolve, 0))
  root.append(element)
  observer?.notify(mutation(root, [element], []))
}

function controlledWindow() {
  let callback: MutationCallback | undefined
  let current: MutationObserver | undefined
  class ControlledMutationObserver {
    constructor(input: MutationCallback) {
      callback = input
      current = this as unknown as MutationObserver
    }
    observe() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
  const target = Object.create(window) as Window
  Object.defineProperties(target, {
    MutationObserver: { value: ControlledMutationObserver },
    requestAnimationFrame: { value: window.requestAnimationFrame.bind(window) },
    cancelAnimationFrame: { value: window.cancelAnimationFrame.bind(window) },
    setTimeout: { value: window.setTimeout.bind(window) },
    clearTimeout: { value: window.clearTimeout.bind(window) },
    performance: { value: window.performance },
  })
  return {
    window: target,
    notify: (...records: MutationRecord[]) => {
      if (callback && current) callback(records, current)
    },
  }
}

function mutation(target: Node, addedNodes: Node[], removedNodes: Node[]) {
  return { target, addedNodes, removedNodes } as unknown as MutationRecord
}

async function waitUntil(predicate: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
    await frames(1)
  }
}
