import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const BACKDROP = {
  plugin: 'session-village',
  component: 'Backdrop',
  props: { scene: 'valley', plugin: 'session-village', glass: { blur: 16, opacity: 0.6 } },
} as const

const PANE = {
  plugin: 'session-village',
  component: 'Pane',
  requestId: 'village',
  props: { title: 'Session Village', isFocused: false, bodyColumns: 48, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

// The engine beneath the plugin: a fresh session on a branch, no turn yet.
function engine(on: On, turns = 0) {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  mock.store(on)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 12 }, rateLimits: [{ kind: 'five_hour', percentUsed: 20 }], cost: { usd: 0.4 } } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.turns', () => ({ value: turns }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'feat/valley\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('command.register', () => ({ value: { command: 'village' } }))
  on('theme.set', () => ({ value: { isDrawn: true, requestId: 'r1' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: {} }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('config.set', (_, e) => (saved.set(e.key, e.value), { value: e.value }))
  return clock
}
// What /village-marges saved in the settings, by key.
const saved = new Map<string, unknown>()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const svgOf = async ($: { ui: { mount: (args: any) => Promise<any> } }) => {
  const ui = await $.ui.mount({ ...BACKDROP, surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })
  await ui.unmount()
  return String((svg?.props as { source?: string } | undefined)?.source ?? '')
}

test('the scene draws on desktop, under the size limit, asleep before the first message', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const svg = await svgOf($)
  expect(svg.startsWith('<svg')).toBe(true)
  expect(svg.length).toBeLessThan(131072)
  // the whole village fits the window, whatever its shape
  expect(svg.includes('preserveAspectRatio="xMidYMid meet"')).toBe(true)
  // the quest marker over the board only shows before the session starts
  expect(svg.includes('kalert')).toBe(true)
})

test('the scene embeds no image, which the desktop would drop: its pixels are vector paths', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'Corrige le test du panier', wait: false, origin: { kind: 'composer' } })
  const svg = await svgOf($)
  expect(svg.includes('<image')).toBe(false)
  expect(svg.includes('data:')).toBe(false)
  // the ground, the hero and the colour classes they paint with
  expect(svg.includes('fill="url(#vg)"')).toBe(true)
  expect(svg.includes('<g id="a_hero_opus"')).toBe(true)
  expect(/\.pa\{stroke:#[0-9a-f]{3,6}\}/.test(svg)).toBe(true)
})

test('the first message wakes the village, a full context brings the fog', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'Corrige le test du panier', wait: false, origin: { kind: 'composer' } })
  await $.session.measure({ context: { window: 200000, percent: 90 }, rateLimits: [{ kind: 'five_hour', percentUsed: 40 }], cost: { usd: 3 }, changed: ['context', 'rateLimits', 'cost'] })
  const svg = await svgOf($)
  expect(svg.includes('#3a0f6a')).toBe(true)
  expect(svg.length).toBeLessThan(131072)
})

test('every animated element also holds its pose, for a desktop that draws the backdrop frozen', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'Corrige le test du panier', wait: false, origin: { kind: 'composer' } })
  // the first tick steps the world, and the villagers set off
  await clock.advance(1000)
  const svg = await svgOf($)
  expect(/animation:w\d+ /.test(svg)).toBe(true)
  // frozen, the desktop strips every animation: where an element stands must not hang on one
  const tags = [...svg.matchAll(/<[a-zA-Z]+\b[^>]*\bstyle="[^"]*animation:(?!var\()[^"]*"[^>]*>/g)].map(m => m[0])
  expect(tags.length).toBeGreaterThan(20)
  expect(tags.find(tag => !/transform="|transform:|opacity:/.test(tag))).toBeUndefined()
})

// Each compaction casts one spell over the hero.
const spells = (svg: string) => svg.split('animation:kspell ').length - 1
const fill = (tokens: number, window = 200000) => ({
  context: { window, tokens, percent: Math.round((tokens / window) * 100) },
  rateLimits: [],
  changed: ['context' as const],
})

test('a sharp context drop casts the compaction spell once, even when session.compact is not seen', async ($, on) => {
  engine(on)
  on('session.compact', (_, e) => ({ messages: e.messages }))
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'Corrige le test du panier', wait: false, origin: { kind: 'composer' } })
  await $.session.measure(fill(170000))
  expect(spells(await svgOf($))).toBe(0)
  // another plugin answered session.compact: only the fill tells, 85 % down to 15 %
  await $.session.measure(fill(30000))
  const cast = spells(await svgOf($))
  expect(cast).toBeGreaterThan(0)
  // session.compact coming through afterwards is the same compaction
  await $.session.compact({ trigger: 'auto', messages: [{ role: 'user', text: 'Résumé', toolUses: [] }] })
  await $.session.measure(fill(12000))
  expect(spells(await svgOf($))).toBe(cast)
})

test('a model switch to a larger window is not a compaction', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'Corrige le test du panier', wait: false, origin: { kind: 'composer' } })
  await $.session.measure(fill(120000))
  await $.session.measure(fill(121000, 1000000))
  expect(spells(await svgOf($))).toBe(0)
})

test('the scene is strict XML, and /village-test counts the frames the desktop drew', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'Corrige le test du panier', wait: false, origin: { kind: 'composer' } })
  const svg = await svgOf($)
  // drawn as an image the SVG is strict XML: one duplicate attribute and nothing shows
  const dup = [...svg.matchAll(/<[a-zA-Z]+((?:\s+[\w:-]+="[^"]*")*)\s*\/?>/g)].find(m => {
    const names = [...(m[1] ?? '').matchAll(/([\w:-]+)=/g)].map(x => x[1])
    return new Set(names).size !== names.length
  })
  expect(dup?.[0]).toBeUndefined()
  const run = await $.command.run({ command: 'village-test', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect(String((run as { text?: string } | undefined)?.text)).toMatch(/^Dernière minute : \d+ images demandées, [1-9]\d* dessinées/)
})

test('margins from the settings leave room on each side of the village', { options: { margin_left: 285, margin_right: 410 } }, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const svg = await svgOf($)
  expect(svg.startsWith('<svg class="kpad" ')).toBe(true)
  expect(svg.includes('.kpad{box-sizing:border-box;padding:0 410px 0 285px;overflow:visible}')).toBe(true)
})

test('/village-marges sets each margin on its own, saves it and draws it', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  expect((await svgOf($)).includes('kpad')).toBe(false)
  const run = (args: string) => $.command.run({ command: 'village-marges', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  await run('gauche 120')
  expect((await svgOf($)).includes('padding:0 0px 0 120px')).toBe(true)
  await run('droite 40')
  expect((await svgOf($)).includes('padding:0 40px 0 120px')).toBe(true)
  expect(saved.get('session-village.margin_left')).toBe(120)
  expect(saved.get('session-village.margin_right')).toBe(40)
  await run('0 0')
  expect((await svgOf($)).includes('kpad')).toBe(false)
  const help = await run('à gauche')
  expect(String((help as { text?: string } | undefined)?.text)).toContain('/village-marges gauche 285')
})

test('other surfaces keep their own backdrop', async ($, on) => {
  engine(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start({ cwd: '/repo', surface: 'mobile', isInteractive: true })
  const ui = await $.ui.mount({ ...BACKDROP, surface: 'mobile' })
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('the legend lists every place with its live value', async ($, on) => {
  engine(on, 3)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  for (const name of ['Château', 'Tour du mage', 'Brume', 'Banque', 'Mine', 'Ferme', 'Guilde']) {
    expect(await ui.find({ type: 'Text', text: name })).toBeDefined()
  }
  expect(await ui.find({ type: 'Text', text: '12 %' })).toBeDefined()
  await ui.unmount()
})
