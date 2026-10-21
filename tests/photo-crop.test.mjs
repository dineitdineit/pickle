import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const module = { exports: {} }
const source = readFileSync(new URL('../src/lib/photoCrop.ts', import.meta.url), 'utf8')
new Function('module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(module, module.exports)
const { cropRectangle, adjustCrop } = module.exports

test('portrait and landscape crops stay within the image for all available ratios and positions', () => {
  for (const [width, height] of [[4000, 3000], [900, 1600], [640, 480]]) {
    for (const ratio of [4 / 3, 1, 16 / 9]) for (const zoom of [1, 2, 3]) for (const x of [0, .5, 1]) for (const y of [0, .5, 1]) {
      const crop = cropRectangle(width, height, ratio, zoom, x, y)
      assert.ok(crop.x >= 0 && crop.y >= 0)
      assert.ok(crop.x + crop.width <= width + .00001 && crop.y + crop.height <= height + .00001)
      assert.ok(Math.abs(crop.width / crop.height - ratio) < .00001)
    }
  }
})

test('zoom preserves the selected crop center and positions reach image edges', () => {
  const crop = cropRectangle(4000, 3000, 4 / 3, 2, .5, .5)
  assert.deepEqual(crop, { x: 1000, y: 750, width: 2000, height: 1500 })
  assert.equal(cropRectangle(4000, 3000, 1, 1, 0, 0).x, 0)
  const right = cropRectangle(4000, 3000, 1, 1, 1, 1)
  assert.equal(right.x + right.width, 4000)
})

test('dragging and all four resize handles keep the selection inside the original photo', () => {
  const area = { x: 100, y: 150, width: 500, height: 400 }
  for (const handle of ['move', 'nw', 'ne', 'sw', 'se']) for (const dx of [-2000, -80, 0, 80, 2000]) for (const dy of [-2000, -80, 0, 80, 2000]) {
    const result = adjustCrop(area, handle, dx, dy, 1200, 900)
    assert.ok(result.x >= 0 && result.y >= 0)
    assert.ok(result.width >= 60 && result.height >= 45)
    assert.ok(result.x + result.width <= 1200 && result.y + result.height <= 900)
    if (handle === 'move') { assert.equal(result.width, area.width); assert.equal(result.height, area.height) }
    else {
      assert.equal(handle.endsWith('w') ? result.x + result.width : result.x, handle.endsWith('w') ? area.x + area.width : area.x)
      assert.equal(handle.startsWith('n') ? result.y + result.height : result.y, handle.startsWith('n') ? area.y + area.height : area.y)
    }
  }
})

test('free cropping changes width and height independently without zooming the photo', () => {
  assert.deepEqual(adjustCrop({ x: 100, y: 100, width: 400, height: 300 }, 'se', 100, -50, 1200, 900), { x: 100, y: 100, width: 500, height: 250 })
})
