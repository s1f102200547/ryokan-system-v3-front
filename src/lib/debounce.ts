export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastArgs: Args | null = null

  function debounced(...args: Args): void {
    lastArgs = args
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      const a = lastArgs!
      lastArgs = null
      fn(...a)
    }, ms)
  }

  debounced.flush = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
      if (lastArgs !== null) {
        const a = lastArgs
        lastArgs = null
        fn(...a)
      }
    }
  }

  debounced.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    lastArgs = null
  }

  return debounced
}
