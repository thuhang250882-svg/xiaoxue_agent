export interface RetryOptions {
  attempts?: number
  delay?: number
  factor?: number
  maxDelay?: number
  retryIf?: (error: unknown) => boolean
}

const TRANSIENT_MESSAGES = [
  "load failed",
  "network connection was lost",
  "network request failed",
  "failed to fetch",
  "econnreset",
  "econnrefused",
  "etimedout",
  "socket hang up",
]

export function isTransientError(error: unknown): boolean {
  if (!error) return false
  // oxlint-disable-next-line no-base-to-string -- error is unknown, intentional coercion for message matching
  const message = String(error instanceof Error ? error.message : error).toLowerCase()
  return TRANSIENT_MESSAGES.some((m) => message.includes(m))
}

// 499 is the sidecar's interrupted-request signal. The SDK client stores the
// HTTP status on error.cause, which survives the retry helper's re-throw.
export function isInterruptedRequest(error: unknown): boolean {
  return (error as { cause?: { status?: unknown } })?.cause?.status === 499
}

// 503 is the instance routing layer's "another request is bootstrapping this
// instance" signal. Same error.cause.status channel as the 499 check above.
export function isInstanceUnavailable(error: unknown): boolean {
  return (error as { cause?: { status?: unknown } })?.cause?.status === 503
}

export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { attempts = 3, delay = 500, factor = 2, maxDelay = 10000, retryIf = isTransientError } = options

  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt === attempts - 1 || !retryIf(error)) throw error
      const wait = Math.min(delay * Math.pow(factor, attempt), maxDelay)
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }
  throw lastError
}
