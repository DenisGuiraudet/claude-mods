// The meadow: two strips of pixel art, a sky with a hill for the top of a reply and a grass edge for the bottom.
// One art pixel is 2 drawing units wide; the strips are wider than any chat column and scale down to fit.

const PIXEL = 2
const COLUMNS = 160

export type Meadow = { skyHeight: number; grassHeight: number }

export const MEADOW: Meadow = { skyHeight: 9, grassHeight: 3 }

// Sky bands from the top down, each with its height in art pixels (nine rows in all)
const SKY: Array<[string, number]> = [['#2f6fd1', 2], ['#4686df', 2], ['#6fa8ee', 2], ['#8bbcf3', 1], ['#a9cff7', 1], ['#c4e0fa', 1]]
const GRASS = { light: '#7bd13b', mid: '#4fae2a', dark: '#2f8a1c', soil: '#6b4a2a' }

type Cloud = { x: number; y: number; seconds: number; offset: number; scale: number }

const CLOUDS: Cloud[] = [
  { x: 0, y: 0, seconds: 90, offset: 0, scale: 0.8 },
  { x: 0, y: 2, seconds: 130, offset: -60, scale: 0.6 },
  { x: 0, y: 1, seconds: 110, offset: -95, scale: 0.7 },
]

// A cloud is a few overlapping blocks of white with a pale underside
const BLOB: Array<[number, number, number, number]> = [
  [2, 0, 6, 1],
  [1, 1, 9, 1],
  [0, 2, 11, 1],
  [3, 3, 7, 1],
]

function rect(x: number, y: number, w: number, h: number, fill: string) {
  return `<rect x="${x * PIXEL}" y="${y * PIXEL}" width="${w * PIXEL}" height="${h * PIXEL}" fill="${fill}"/>`
}


// A pixel-rounded bubble: each row near a rounded end is cut in by a few art pixels, in steps
const CORNER = [3, 2, 1]

function inset(row: number, rows: number, top: boolean, bottom: boolean) {
  if (top && row < CORNER.length) {
    return CORNER[row]
  }
  if (bottom && rows - 1 - row < CORNER.length) {
    return CORNER[rows - 1 - row]
  }

  return 0
}

function clip(id: string, rows: number, top: boolean, bottom: boolean) {
  const right: string[] = []
  const left: string[] = []
  for (let r = 0; r < rows; r++) {
    const cut = inset(r, rows, top, bottom)
    right.push(`${(COLUMNS - cut) * PIXEL},${r * PIXEL}`, `${(COLUMNS - cut) * PIXEL},${(r + 1) * PIXEL}`)
    left.unshift(`${cut * PIXEL},${(r + 1) * PIXEL}`, `${cut * PIXEL},${r * PIXEL}`)
  }

  return `<clipPath id="${id}"><polygon points="${[...right, ...left].join(' ')}"/></clipPath>`
}

function cloud(c: Cloud) {
  const body = BLOB.map(([x, y, w, h]) => rect(x, y, w, h, y === 3 ? '#d9e8fb' : '#ffffff')).join('')
  const from = -14 * PIXEL
  const to = (COLUMNS + 2) * PIXEL
  const travel = `<animateTransform attributeName="transform" type="translate" values="${from} ${c.y * PIXEL};${to} ${c.y * PIXEL}" dur="${c.seconds}s" begin="${c.offset}s" repeatCount="indefinite"/>`

  return `<g transform="translate(${from} ${c.y * PIXEL})"><g transform="scale(${c.scale})">${body}</g>${travel}</g>`
}

// Rolling ground: two sine waves, so the hill never looks like one bump
function ground(column: number) {
  return Math.round(2.4 + 1.2 * Math.sin(column / 21 + 0.8) + 0.6 * Math.sin(column / 7 + 2))
}

export function skySvg(): string {
  const { skyHeight } = MEADOW
  let y = 0
  const bands = SKY.map(([fill, rows]) => {
    const band = rect(0, y, COLUMNS, rows, fill)
    y += rows

    return band
  }).join('')
  const sun = rect(141, 1, 4, 4, '#fff3a8') + rect(140, 2, 6, 2, '#fff3a8')
  let hill = ''
  for (let x = 0; x < COLUMNS; x++) {
    const top = skyHeight - ground(x)
    const shade = x % 2 === 0 && (x * 7) % 11 < 3 ? GRASS.light : GRASS.mid
    hill += rect(x, top, 1, 1, GRASS.light)
    if (top + 1 < skyHeight) {
      hill += rect(x, top + 1, 1, 1, shade)
    }
    if (top + 2 < skyHeight) {
      hill += rect(x, top + 2, 1, skyHeight - top - 2, GRASS.dark)
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COLUMNS * PIXEL} ${skyHeight * PIXEL}" preserveAspectRatio="xMidYMax slice" shape-rendering="crispEdges">${clip('c', skyHeight, true, false)}<g clip-path="url(#c)">${bands}${sun}${CLOUDS.map(cloud).join('')}${hill}</g></svg>`
}

export function grassSvg(): string {
  const { grassHeight } = MEADOW
  let tufts = ''
  for (let x = 0; x < COLUMNS; x++) {
    const tall = (x * 13) % 9 < 3
    tufts += rect(x, 0, 1, tall ? 2 : 1, tall ? GRASS.light : GRASS.mid)
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COLUMNS * PIXEL} ${grassHeight * PIXEL}" preserveAspectRatio="xMidYMin slice" shape-rendering="crispEdges">${clip('c', grassHeight, false, true)}<g clip-path="url(#c)">${rect(0, 0, COLUMNS, grassHeight, GRASS.dark)}${tufts}${rect(0, grassHeight - 1, COLUMNS, 1, GRASS.soil)}</g></svg>`
}
