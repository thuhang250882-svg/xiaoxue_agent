type ConsoleTransport<T> = {
  level: string | false
  writeFn: (options: T) => void
}

export function configureConsoleTransport<T>(transport: ConsoleTransport<T>, packaged: boolean) {
  if (packaged) {
    transport.level = false
    return
  }

  const write = transport.writeFn.bind(transport)
  transport.writeFn = (options) => {
    try {
      write(options)
    } catch (error) {
      if (!isBrokenPipe(error)) throw error
      transport.level = false
    }
  }
}

function isBrokenPipe(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EPIPE"
}
