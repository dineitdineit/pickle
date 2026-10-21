export function reorderSteps<T>(steps: T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= steps.length ||
    to >= steps.length
  )
    return steps
  const result = [...steps]
  const [item] = result.splice(from, 1)
  result.splice(to, 0, item)
  return result
}
export function stepDropIndex(
  centers: number[],
  source: number,
  offset: number,
) {
  let target = source
  const center = centers[source] + offset
  if (offset > 0)
    while (target + 1 < centers.length && center > centers[target + 1]) target++
  else while (target > 0 && center < centers[target - 1]) target--
  return target
}
