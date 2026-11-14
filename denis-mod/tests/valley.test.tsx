import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const BACKDROP = {
  plugin: 'denis-mod',
  component: 'Backdrop',
  props: { scene: 'valley', plugin: 'denis-mod', glass: { blur: 16, opacity: 0.6 } },
} as const

const PANE = {
  plugin: 'denis-mod',
  component: 'Pane',
  requestId: 'vallee',
  props: { title: 'La Vallée', isFocused: false, bodyColumns: 48, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

// The engine beneath the plugin: a fresh session on a branch, no turn yet.
function engine(on: On, turns = 0) {
  mock.clock(on, { now: 1_800_000_000_000 })
  mock.store(on)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 12 }, rateLimits: [{ kind: 'five_hour', percentUsed: 20 }], cost: { usd: 0.4 } } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.turns', () => ({ value: turns }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'feat/valley\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('command.register', () => ({ value: { command: 'vallee' } }))
  on('theme.set', () => ({ value: { isDrawn: true, requestId: 'r1' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: {} }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
}

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
  // the quest marker over the board only shows before the session starts
  expect(svg.includes('kalert')).toBe(true)
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
