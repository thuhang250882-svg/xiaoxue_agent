const queues = new Map<string, Promise<void>>()

export function queueStoreMutation(name: string, operation: () => void | Promise<void>) {
  const pending = (queues.get(name) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => retryStoreMutation(operation))
  queues.set(name, pending)
  return pending.finally(() => {
    if (queues.get(name) === pending) queues.delete(name)
  })
}

export async function retryStoreMutation(operation: () => void | Promise<void>, attempt = 0): Promise<void> {
  try {
    await operation()
  } catch (error) {
    if (!isTransientStoreError(error) || attempt >= 4) throw error
    await new Promise((resolve) => setTimeout(resolve, 20 * 2 ** attempt))
    return retryStoreMutation(operation, attempt + 1)
  }
}

function isTransientStoreError(error: unknown) {
  if (!(error instanceof Error)) return false
  const code = (error as NodeJS.ErrnoException).code
  return code === "EPERM" || code === "EBUSY"
}
