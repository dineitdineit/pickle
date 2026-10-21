export function cropRectangle(
  width: number,
  height: number,
  ratio: number,
  zoom: number,
  x: number,
  y: number,
) {
  const cropWidth = Math.min(width, height * ratio) / Math.max(1, zoom)
  const cropHeight = cropWidth / ratio
  const clamp = (value: number) => Math.max(0, Math.min(1, value))
  return {
    x: (width - cropWidth) * clamp(x),
    y: (height - cropHeight) * clamp(y),
    width: cropWidth,
    height: cropHeight,
  }
}
export interface CropArea {
  x: number
  y: number
  width: number
  height: number
}
export type CropHandle = "move" | "nw" | "ne" | "sw" | "se"
export function adjustCrop(
  area: CropArea,
  handle: CropHandle,
  dx: number,
  dy: number,
  width: number,
  height: number,
): CropArea {
  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value))
  if (handle === "move")
    return {
      ...area,
      x: clamp(area.x + dx, 0, width - area.width),
      y: clamp(area.y + dy, 0, height - area.height),
    }
  const minWidth = Math.min(width, Math.max(1, width * 0.05))
  const minHeight = Math.min(height, Math.max(1, height * 0.05))
  let left = area.x,
    top = area.y,
    right = area.x + area.width,
    bottom = area.y + area.height
  if (handle.endsWith("w")) left = clamp(left + dx, 0, right - minWidth)
  else right = clamp(right + dx, left + minWidth, width)
  if (handle.startsWith("n")) top = clamp(top + dy, 0, bottom - minHeight)
  else bottom = clamp(bottom + dy, top + minHeight, height)
  return { x: left, y: top, width: right - left, height: bottom - top }
}
