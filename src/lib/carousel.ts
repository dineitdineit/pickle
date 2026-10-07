export function carouselIndex(
  scrollLeft: number,
  width: number,
  count: number,
  gap = 16,
) {
  if (width <= 0 || count <= 0) return 0
  return Math.max(
    0,
    Math.min(Math.round(scrollLeft / (width + gap)), count - 1),
  )
}
