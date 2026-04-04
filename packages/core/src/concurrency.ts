/**
 * Run async tasks with a sliding-window concurrency limit.
 *
 * Unlike fixed-batch slicing (`Promise.all(batch)`), this starts a new
 * task as soon as any running task finishes, keeping the concurrency
 * slots fully saturated.
 */
export async function runConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++
      results[i] = await fn(items[i])
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  )
  await Promise.all(workers)
  return results
}
