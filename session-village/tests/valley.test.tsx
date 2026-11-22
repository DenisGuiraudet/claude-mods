import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { S, W, newWorld, step, clickShares } from '../hooks/world.js'

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

// The engine beneath the plugin: a fresh session on a branch, no turn yet; `attached` false, no desktop to draw
// the theme yet; `kept`, what the mod's store already holds, or a Map to keep it in and look into afterwards.
function engine(on: On, turns = 0, attached = true, kept?: Record<string, unknown> | Map<string, unknown>) {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  if (kept instanceof Map) {
    on('store.get', (_, e) => ({ value: kept.get(e.key) }))
    on('store.set', (_, e) => ({ value: void kept.set(e.key, e.value) }))
    on('store.delete', (_, e) => ({ value: void kept.delete(e.key) }))
    on('store.keys', () => ({ value: [...kept.keys()] }))
  } else mock.store(on, kept)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 12 }, rateLimits: [{ kind: 'five_hour', percentUsed: 20 }], cost: { usd: 0.4 } } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.turns', () => ({ value: turns }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'feat/valley\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('command.register', () => ({ value: { command: 'village' } }))
  on('theme.set', () => ({ value: attached ? { isDrawn: true, requestId: 'r1' } : { isDrawn: false, reason: 'no attached desktop or mobile client draws themes yet' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: {} }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('config.set', (_, e) => (saved.set(e.key, e.value), { value: e.value }))
  return clock
}
// What /village-margins saved in the settings, by key.
const saved = new Map<string, unknown>()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const svgOf = async ($: { ui: { mount: (args: any) => Promise<any> } }) => {
  const ui = await $.ui.mount({ ...BACKDROP, surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })
  await ui.unmount()
  return String((svg?.props as { source?: string } | undefined)?.source ?? '')
}

// The margins as the scene's CSS lays them out: in full from a 1600 px wide window, none under 700 px.
const room = (left: number, right: number) => {
  const m = (v: number) => (v > 0 ? `clamp(0px,calc((100vw - 700px) / 900 * ${v}),${v}px)` : '0px')
  return `--ml:${m(left)};--mr:${m(right)};`
}

test('the scene draws on desktop, under the size limit, asleep before the first message', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const svg = await svgOf($)
  expect(svg.startsWith('<svg')).toBe(true)
  expect(svg.length).toBeLessThan(131072)
  // laid out by CSS from the window's size: the world three times (left, river, right), at the window's height
  expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" class="kv"')).toBe(true)
  expect(svg.match(/<use href="#kws[lcr]"\/>/g)?.length).toBe(3)
  // each copy draws its own part of the ground, not the whole map
  for (const k of ['l', 'c', 'r']) expect(svg.includes(`<svg id="kws${k}" width="1000%" height="100%" viewBox="0 0 1600 1000" preserveAspectRatio="xMinYMid meet" overflow="visible"><use href="#kg${k}"/><use href="#kw"/></svg>`)).toBe(true)
  // the quest marker over the board only shows before the session starts
  expect(svg.includes('kalert')).toBe(true)
  // by default, room for the sidebar on the left and an open pane on the right
  expect(svg.includes(room(300, 300))).toBe(true)
  // drawn in a sandboxed frame, not as an image
  const ui = await $.ui.mount({ ...BACKDROP, surface: 'desktop' })
  expect(((await ui.find({ type: 'Svg' }))?.props as { isInteractive?: boolean } | undefined)?.isInteractive).toBe(true)
  await ui.unmount()
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
  // a sign tells the measure, not the place's name in the story
  expect(svg.includes('class="vt">Context · 90%<')).toBe(true)
  expect(svg.includes('class="vt">Mist')).toBe(false)
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
  // a keyframe left out starts from that pose, not from its own stop: a walk cycle would then sit between two rows of
  // its sheet and show half of each
  const open = (scene: string) => [...scene.matchAll(/@keyframes ([\w-]+)\{((?:[^{}]*\{[^{}]*\})*)\}/g)].filter(([, , body]) => {
    const at = [...(body ?? '').matchAll(/([^{}]+)\{/g)].flatMap(m => (m[1] ?? '').split(',').map(s => s.trim()))
    return !at.some(s => s === 'from' || s === '0%') || !at.some(s => s === 'to' || s === '100%')
  }).map(m => m[1])
  expect(open(svg)).toEqual([])
  const legs = new Set<string>()
  for (let i = 0; i < 6; i++) {
    await clock.advance(1000)
    const frame = await svgOf($)
    expect(open(frame)).toEqual([])
    expect(/translateY\(-64px\);animation:kw4/.test(frame)).toBe(false)
    for (const m of frame.matchAll(/transform:translateY\(([^)]*)\);animation:kw4/g)) legs.add(m[1] ?? '')
  }
  expect(legs.size).toBeGreaterThan(1)
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
  expect(String((run as { text?: string } | undefined)?.text)).toMatch(/^Last minute: \d+ frames asked, [1-9]\d* drawn/)
})

test('/village-debug reports the frames and finds nothing wrong with the last one', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'Corrige le test du panier', wait: false, origin: { kind: 'composer' } })
  await clock.advance(3000)
  await svgOf($)
  // the desktop reports its size with a backdrop: the report keeps each change
  const ui = await $.ui.mount({ ...BACKDROP, surface: 'desktop', viewport: { columns: 180, rows: 50, isFullscreen: true } })
  await ui.unmount()
  const run = await $.command.run({ command: 'village-debug', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  const text = String((run as { text?: string } | undefined)?.text)
  expect(text.startsWith('Session Village, diagnostics')).toBe(true)
  expect(text).toContain('Backdrop: drawn.')
  expect(text).toContain('OK: strict XML')
  expect(text).toContain('OK: every animated element holds its pose')
  expect(text).toContain('prompt.submit 1')
  expect(text).toMatch(/Size received with the backdrop, since: \d+ s ago, not measured; \d+ s ago, 180 columns × 50 rows, isFullscreen true\./)
  expect(text).toContain('With this command: 100 columns, isFullscreen false.')
})

test('/village-debug sees the backdrop drawn once the desktop attaches after the session start', async ($, on) => {
  const clock = engine(on, 0, false)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'Corrige le test du panier', wait: false, origin: { kind: 'composer' } })
  await clock.advance(3000)
  const debug = async () => String(((await $.command.run({ command: 'village-debug', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })) as { text?: string } | undefined)?.text)
  expect(await debug()).toContain('TO CHECK: the app draws the backdrop')
  await svgOf($)
  const text = await debug()
  expect(text).toContain('Backdrop: drawn.')
  expect(text).toContain('OK: the app draws the backdrop')
  expect(text).toContain('OK: the app draws the frames asked')
})

// What /village-debug answers.
const debugOf = async ($: { command: { run: (args: any) => Promise<unknown> } }) =>
  String(((await $.command.run({ command: 'village-debug', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })) as { text?: string } | undefined)?.text)

test('the time between two frames comes from the settings', { options: { frame_interval: 2 } }, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  expect(await debugOf($)).toContain('Clock: set to 2 s (plugin settings)')
})

test('/village-sync sets the time between two frames, within bounds, and keeps it for the next sessions', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  expect(await debugOf($)).toContain('Clock: set to 1 s (default)')
  const sync = async (args: string) =>
    String(((await $.command.run({ command: 'village-sync', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })) as { text?: string } | undefined)?.text)
  expect(await sync('0.5')).toBe('One frame every 0.5 s at most. Kept for the next sessions.')
  expect(await debugOf($)).toContain('Clock: set to 0.5 s (mod storage)')
  expect(await sync('fast')).toBe('Examples: /village-sync 0.5 (two frames a second), /village-sync 2 (one every 2 s), /village-sync 1 (the default). Between 0.1 and 10 s.')
  expect(await sync('')).toStartWith('One frame every 0.5 s at most. Examples')
  expect(await sync('30')).toBe('One frame every 10 s at most. Kept for the next sessions.')
  // a decimal comma reads as a point
  expect(await sync('0,05')).toBe('One frame every 0.1 s at most. Kept for the next sessions.')
  // the next session starts from what was kept
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  expect(await debugOf($)).toContain('Clock: set to 0.1 s (mod storage)')
})

test('margins from the settings leave room on each side of the village', { options: { margin_left: 120, margin_right: 240 } }, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const svg = await svgOf($)
  expect(svg.includes(room(120, 240))).toBe(true)
})

test('a margin set to 0 in the settings is gone', { options: { margin_left: 0, margin_right: 0 } }, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  expect((await svgOf($)).includes(room(0, 0))).toBe(true)
})

// The /config rows of the plugin's two margins, as the settings menu lists them.
const marginRows = (on: On) => on('config.list', () => ({
  value: ['margin_left', 'margin_right'].map(field => ({
    key: `session-village.${field}`, label: field, kind: 'number', value: 0, provider: { kind: 'plugin', name: 'session-village' }, isLocked: false,
  })),
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any)

test('/village-margins sets each margin on its own, saves it and draws it', async ($, on) => {
  engine(on)
  marginRows(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  expect((await svgOf($)).includes(room(300, 300))).toBe(true)
  const run = (args: string) => $.command.run({ command: 'village-margins', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  await run('left 120')
  expect((await svgOf($)).includes(room(120, 300))).toBe(true)
  await run('right 40')
  expect((await svgOf($)).includes(room(120, 40))).toBe(true)
  expect(saved.get('session-village.margin_left')).toBe(120)
  expect(saved.get('session-village.margin_right')).toBe(40)
  await run('0 0')
  expect((await svgOf($)).includes(room(0, 0))).toBe(true)
  const help = await run('to the left')
  expect(String((help as { text?: string } | undefined)?.text)).toContain('/village-margins left 285')
})

test('/village-margins keeps the margins for the next sessions when the settings have no row for them', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const done = await $.command.run({ command: 'village-margins', args: '300 400', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect(String((done as { text?: string } | undefined)?.text)).toBe('Village margins: left 300 px, right 400 px, conversation column 768 px. Kept for the next sessions.')
  expect((await svgOf($)).includes(room(300, 400))).toBe(true)
  // the next session starts from what was kept
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  expect((await svgOf($)).includes(room(300, 400))).toBe(true)
})

test('the buildings keep out of the conversation column, 768 px by default, set with /village-margins column', async ($, on) => {
  engine(on)
  on('config.list', () => ({
    value: ['margin_left', 'margin_right', 'column_width'].map(field => ({
      key: `session-village.${field}`, label: field, kind: 'number', value: 0, provider: { kind: 'plugin', name: 'session-village' }, isLocked: false,
    })),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any)
  await $.session.start(START)
  // the column and a little room on each side, never wider than the room between the margins
  const svg = await svgOf($)
  expect(svg.includes('--g0:calc(min(800px,100vw - var(--ml) - var(--mr)) / 2)')).toBe(true)
  // the world shrinks where CSS can divide a length by a length
  expect(svg.includes('@supports (scale:calc(2px / 1px))')).toBe(true)
  const done = await $.command.run({ command: 'village-margins', args: 'column 960', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect(String((done as { text?: string } | undefined)?.text)).toBe('Village margins: left 300 px, right 300 px, conversation column 960 px. Saved in the plugin settings.')
  expect(saved.get('session-village.column_width')).toBe(960)
  expect((await svgOf($)).includes('--g0:calc(min(992px,')).toBe(true)
})

test('with no conversation column, the river alone parts the village at the window\'s height', { options: { column_width: 0 } }, async ($, on) => {
  engine(on)
  await $.session.start(START)
  const svg = await svgOf($)
  expect(svg.includes('--g0:0px')).toBe(true)
  expect(svg.includes('@supports')).toBe(false)
})

test('two clicks on the village set the margins as shares of the window, until margins are set in pixels', async ($, on) => {
  // clicks too close leave no room for the village; in either order
  expect(clickShares(0.5, 0.6)).toBe(null)
  expect(clickShares(0.875, 0.15625)).toEqual({ left: 0.1563, right: 0.125 })
  const kept = new Map<string, unknown>([['margin-shares', { left: 0.1563, right: 0.125, over: { left: 300, right: 300 } }]])
  engine(on, 0, true, kept)
  await $.session.start(START)
  expect((await svgOf($)).includes('--ml:calc(100vw * 0.1563);--mr:calc(100vw * 0.125);')).toBe(true)
  const run = (args: string) => $.command.run({ command: 'village-margins', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect(String(((await run('click')) as { text?: string } | undefined)?.text)).toContain('just right of the sidebar')
  expect(await debugOf($)).toContain('Waiting for two clicks.')
  await run('left 250')
  expect((await svgOf($)).includes(room(250, 300))).toBe(true)
  expect(kept.has('margin-shares')).toBe(false)
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
  for (const name of ['Castle', 'Mage tower', 'Mist', 'Bank', 'Mine', 'Farm', 'Guild']) {
    expect(await ui.find({ type: 'Text', text: name })).toBeDefined()
  }
  expect(await ui.find({ type: 'Text', text: '12%' })).toBeDefined()
  await ui.unmount()
})

const START = { cwd: '/repo', surface: 'desktop', isInteractive: true } as const
// A tool call as the engine raises it: the tool's arguments beside its name.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = ($: { tool: { call: (args: any) => Promise<unknown> } }, args: Record<string, unknown>) => $.tool.call(args)

test('no task at the start, then the desktop app\'s own task list fills the farm, ten plots at most', async ($, on) => {
  engine(on)
  await $.session.start(START)
  expect(await debugOf($)).toContain('Tasks 0/0')
  const items = Array.from({ length: 15 }, (_, i) => ({ content: `Étape ${i + 1}`, status: i < 11 ? 'completed' : i === 11 ? 'in_progress' : 'pending' }))
  await call($, { tool: 'mcp__ccd_turn__update_plan', items, scope: 'first_task' })
  expect(await debugOf($)).toContain('Tasks 11/15')
  await call($, { tool: 'mcp__ccd_turn__update_plan', advance: true })
  expect(await debugOf($)).toContain('Tasks 12/15')
  // twelve done out of fifteen: eight ripe plots out of ten, and the sign tells the true count
  const svg = await svgOf($)
  expect(svg.match(/<use href="#f(?:66|6|18|30|42|54)" x=/g)?.length).toBe(8)
  expect(svg.match(/<use href="#f(?:64|4|16|28|40|52)" x=/g)?.length).toBe(2)
  expect(svg.includes('class="vt">Tasks · 12/15<')).toBe(true)
  await call($, { tool: 'mcp__ccd_turn__update_plan', done: [13], start: 14 })
  expect(await debugOf($)).toContain('Tasks 13/15')
  await call($, { tool: 'mcp__ccd_turn__wrap_up', recap: 'Fait.' })
  expect(await debugOf($)).toContain('Tasks 15/15')
  // the app's own tools are not the post's business, another MCP tool is
  expect(await debugOf($)).toContain('activity idle')
  await call($, { tool: 'mcp__notion__search', query: 'panier' })
  expect(await debugOf($)).toContain('activity web')
})

test('a first turn that no plain message opened wakes the village', async ($, on) => {
  engine(on)
  await $.session.start(START)
  expect(await debugOf($)).toContain('Village: asleep')
  await $.turn.start({ text: '', turnId: 't1' })
  expect(await debugOf($)).toContain('Village: awake, activity thinking')
})

test('a compaction shows on a 1M window, where the fill drops by far less than a fifth of it', async ($, on) => {
  engine(on)
  await $.session.start(START)
  await $.prompt.submit({ text: 'Corrige le test du panier', wait: false, origin: { kind: 'composer' } })
  await $.session.measure(fill(176000, 1000000))
  expect(spells(await svgOf($))).toBe(0)
  await $.session.measure(fill(40000, 1000000))
  expect(spells(await svgOf($))).toBeGreaterThan(0)
})

test('/clear forgets the tasks and the context fill, and the drop that follows is no compaction', async ($, on) => {
  engine(on)
  await $.session.start(START)
  await $.prompt.submit({ text: 'Corrige le test du panier', wait: false, origin: { kind: 'composer' } })
  await call($, { tool: 'TodoWrite', todos: [{ content: 'Corriger', status: 'completed', activeForm: 'Corrige' }, { content: 'Tester', status: 'pending', activeForm: 'Teste' }] })
  await $.session.measure(fill(120000))
  expect(await debugOf($)).toContain('Tasks 1/2')
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
  const cleared = await debugOf($)
  expect(cleared).toContain('Tasks 0/0')
  expect(cleared).toContain('context 0%,')
  await $.session.measure(fill(9000))
  expect(spells(await svgOf($))).toBe(0)
  expect(await debugOf($)).toContain('Compaction: none.')
})

test('a PR opened and merged with the gh CLI shows on the castle, and a plain command saves nothing', async ($, on) => {
  const store = new Map<string, unknown>()
  engine(on, 0, true, store)
  await $.session.start(START)
  await call($, { tool: 'Bash', command: 'ls -la' })
  expect([...store.keys()]).toEqual([])
  await call($, { tool: 'Bash', command: 'git commit -m "Panier" && git push' })
  expect([...store.keys()]).toEqual(['waves:/repo:feat/valley'])
  await call($, { tool: 'Bash', command: 'gh pr create --title "Panier [2/3]" --body "Corrige le total"' })
  expect(await debugOf($)).toContain('wave 2/3, steps commit, push, pr.')
  // an auto-merge only merges later
  await call($, { tool: 'Bash', command: 'gh pr merge --auto --squash' })
  expect(await debugOf($)).toContain('steps commit, push, pr.')
  await call($, { tool: 'Bash', command: 'gh pr merge 12 --squash' })
  expect(await debugOf($)).toContain('steps commit, push, pr, merged.')
})

test('a setting changed in the app wins over what the mod had kept', { options: { margin_left: 450, margin_right: 300, frame_interval: 2 } }, async ($, on) => {
  engine(on, 0, true, { margins: { left: 600, right: 600 }, sync: 0.5 })
  await $.session.start(START)
  expect((await svgOf($)).includes(room(450, 300))).toBe(true)
  expect(await debugOf($)).toContain('Clock: set to 2 s (plugin settings)')
})

test('what the mod kept stands while the settings say what they said', async ($, on) => {
  engine(on, 0, true, { margins: { left: 600, right: 600 }, sync: 0.5 })
  await $.session.start(START)
  expect((await svgOf($)).includes(room(600, 600))).toBe(true)
  expect(await debugOf($)).toContain('Clock: set to 0.5 s (mod storage)')
})

test('with frames a tenth of a second apart, a walk cycle keeps its own pace instead of one step a frame', async ($, on) => {
  const clock = engine(on)
  await $.session.start(START)
  await $.prompt.submit({ text: 'Corrige le test du panier', wait: false, origin: { kind: 'composer' } })
  await clock.advance(1000)
  await $.command.run({ command: 'village-sync', args: '0.1', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  // a 0.6 s cycle of four steps: back to its first step twice in twelve frames, where one step a frame makes three
  let wraps = 0, last = '', seen = 0
  for (let i = 0; i < 40 && seen < 13; i++) {
    await clock.advance(100)
    const pose = /transform:translateY\(([^)]*)\);animation:kw4/.exec(await svgOf($))?.[1] ?? ''
    // a frame over the size limit goes out with no walk cycle: count again
    if (pose === '') { wraps = 0; last = ''; seen = 0; continue }
    if (last !== '' && last !== pose && parseFloat(pose) === 0) wraps++
    last = pose
    seen++
  }
  expect(seen).toBe(13)
  expect(wraps).toBe(2)
})

// The steps the world took so far.
const stepsOf = (debug: string) => Number(/(\d+) steps since the start/.exec(debug)?.[1])

// The kit's clock moves the beats, not the time of day: a frame between two events never goes out here, so the
// test reads the rest the mod reports and the steps of the world, which stop with the frames.
test('at rest the village winds down: slower after two minutes, stopped after ten, awake at the next event', async ($, on) => {
  const clock = engine(on)
  await $.session.start(START)
  await $.prompt.submit({ text: 'Corrige le test du panier', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'Corrige le test du panier', turnId: 't1' })
  const beats = async (n: number) => { for (let i = 0; i < n; i++) await clock.advance(1000) }
  // at work, however long the turn, no rest
  await beats(700)
  const working = await debugOf($)
  expect(working.includes('At rest')).toBe(false)
  expect(stepsOf(working)).toBe(700)
  await $.turn.complete({ answer: 'Fait.', durationMs: 700_000, isAborted: false, turnId: 't1', reason: 'answer' })
  await beats(119)
  expect((await debugOf($)).includes('At rest')).toBe(false)
  await beats(1)
  expect(await debugOf($)).toContain('At rest: one frame every 5 s at most.')
  await beats(480)
  const stopped = await debugOf($)
  expect(stopped).toContain('At rest: frames stopped, a plain field instead of the village.')
  // the village gives way to a plain field, which the app paints at next to no cost
  const field = await svgOf($)
  expect(field.includes('class="kv"')).toBe(false)
  expect(field.includes('fill="#5d8c4a"')).toBe(true)
  await beats(30)
  expect(stepsOf(await debugOf($))).toBe(stepsOf(stopped))
  // a measure is no activity of the session
  await $.session.measure({ context: { window: 200000, percent: 13 }, rateLimits: [{ kind: 'five_hour', percentUsed: 21 }], changed: ['rateLimits'] })
  expect(await debugOf($)).toContain('At rest: frames stopped, a plain field instead of the village.')
  // the session moves again: so does the village
  await $.prompt.submit({ text: 'Et les taxes ?', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'Et les taxes ?', turnId: 't2' })
  await beats(10)
  const awake = await debugOf($)
  expect(awake.includes('At rest')).toBe(false)
  expect(stepsOf(awake)).toBe(stepsOf(stopped) + 10)
  expect((await svgOf($)).includes('class="kv"')).toBe(true)
})

test('four adventurers at most walk out of the guild, whatever the number of sub-agents', async () => {
  // the world alone, at a time past any it has seen: one adventurer sets off every 700 ms
  const t0 = 4e12
  S.started = true
  S.subagents = 7
  newWorld(t0)
  for (let t = t0 + 1000; t <= t0 + 20_000; t += 1000) step(t)
  expect((W.ents as { kind: string }[]).filter(e => e.kind === 'adv').length).toBe(4)
  S.subagents = 0
  S.started = false
})
