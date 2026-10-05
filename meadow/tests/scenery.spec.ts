import { describe, expect, test } from 'bun:test'

import { grassSvg, skySvg } from '../hooks/scenery'

describe('the meadow', () => {
  test('both strips stay well under the 131072-character limit', () => {
    expect(skySvg().length).toBeLessThan(60_000)
    expect(grassSvg().length).toBeLessThan(20_000)
  })

  test('the strips are whole SVG documents', () => {
    for (const svg of [skySvg(), grassSvg()]) {
      expect(svg.startsWith('<svg')).toBe(true)
      expect(svg.endsWith('</svg>')).toBe(true)
    }
  })

  test('the corners are cut in steps, so the strips are not plain rectangles', () => {
    for (const svg of [skySvg(), grassSvg()]) {
      expect(svg).toContain('<clipPath')
    }
  })
})
