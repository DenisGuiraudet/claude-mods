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
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
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
  expect(svg.match(/<use href="#kws"\/>/g)?.length).toBe(3)
  // the quest marker over the board only shows before the session starts
  expect(svg.includes('kalert')).toBe(true)
  // by default, room for the sidebar on the left and an open pane on the right
  expect(svg.includes(room(300, 300))).toBe(true)
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
  expect(svg.includes('class="vt">Contexte · 90 %<')).toBe(true)
  expect(svg.includes('class="vt">Brume')).toBe(false)
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
  // a walk cycle with no first keyframe starts from the standing row, never from past its last step
  const legs = new Set<string>()
  for (let i = 0; i < 6; i++) {
    await clock.advance(1000)
    const frame = await svgOf($)
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
  expect(String((run as { text?: string } | undefined)?.text)).toMatch(/^Dernière minute : \d+ images demandées, [1-9]\d* dessinées/)
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
  expect(text.startsWith('Session Village, diagnostic')).toBe(true)
  expect(text).toContain('Décor : dessiné.')
  expect(text).toContain('OK : XML strict')
  expect(text).toContain('OK : chaque élément animé porte sa pose')
  expect(text).toContain('prompt.submit 1')
  expect(text).toMatch(/Taille reçue avec le décor, depuis : il y a \d+ s, non mesurée ; il y a \d+ s, 180 colonnes × 50 lignes, isFullscreen true\./)
  expect(text).toContain('Avec cette commande : 100 colonnes, isFullscreen false.')
})

test('/village-debug sees the backdrop drawn once the desktop attaches after the session start', async ($, on) => {
  const clock = engine(on, 0, false)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'Corrige le test du panier', wait: false, origin: { kind: 'composer' } })
  await clock.advance(3000)
  const debug = async () => String(((await $.command.run({ command: 'village-debug', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })) as { text?: string } | undefined)?.text)
  expect(await debug()).toContain("À VOIR : l'app dessine le décor")
  await svgOf($)
  const text = await debug()
  expect(text).toContain('Décor : dessiné.')
  expect(text).toContain("OK : l'app dessine le décor")
  expect(text).toContain("OK : l'app dessine les images demandées")
})

// What /village-debug answers.
const debugOf = async ($: { command: { run: (args: any) => Promise<unknown> } }) =>
  String(((await $.command.run({ command: 'village-debug', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })) as { text?: string } | undefined)?.text)

test('the time between two frames comes from the settings', { options: { frame_interval: 2 } }, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  expect(await debugOf($)).toContain('Horloge : réglée sur 2 s (réglages du plugin)')
})

test('/village-sync sets the time between two frames, within bounds, and keeps it for the next sessions', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  expect(await debugOf($)).toContain('Horloge : réglée sur 1 s (par défaut)')
  const sync = async (args: string) =>
    String(((await $.command.run({ command: 'village-sync', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })) as { text?: string } | undefined)?.text)
  expect(await sync('0,5')).toBe('Une image toutes les 0,5 s au plus. Gardé pour les prochaines sessions.')
  expect(await debugOf($)).toContain('Horloge : réglée sur 0,5 s (stockage du mod)')
  expect(await sync('vite')).toBe('Exemples : /village-sync 0,5 (deux images par seconde), /village-sync 2 (une toutes les 2 s), /village-sync 1 (par défaut). Entre 0,25 et 10 s.')
  expect(await sync('')).toStartWith('Une image toutes les 0,5 s au plus. Exemples')
  expect(await sync('30')).toBe('Une image toutes les 10 s au plus. Gardé pour les prochaines sessions.')
  expect(await sync('0.1')).toBe('Une image toutes les 0,25 s au plus. Gardé pour les prochaines sessions.')
  // the next session starts from what was kept
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  expect(await debugOf($)).toContain('Horloge : réglée sur 0,25 s (stockage du mod)')
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

test('/village-marges sets each margin on its own, saves it and draws it', async ($, on) => {
  engine(on)
  marginRows(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  expect((await svgOf($)).includes(room(300, 300))).toBe(true)
  const run = (args: string) => $.command.run({ command: 'village-marges', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  await run('gauche 120')
  expect((await svgOf($)).includes(room(120, 300))).toBe(true)
  await run('droite 40')
  expect((await svgOf($)).includes(room(120, 40))).toBe(true)
  expect(saved.get('session-village.margin_left')).toBe(120)
  expect(saved.get('session-village.margin_right')).toBe(40)
  await run('0 0')
  expect((await svgOf($)).includes(room(0, 0))).toBe(true)
  const help = await run('à gauche')
  expect(String((help as { text?: string } | undefined)?.text)).toContain('/village-marges gauche 285')
})

test('/village-marges keeps the margins for the next sessions when the settings have no row for them', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const done = await $.command.run({ command: 'village-marges', args: '300 400', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect(String((done as { text?: string } | undefined)?.text)).toBe('Marges du village : gauche 300 px, droite 400 px. Gardées pour les prochaines sessions.')
  expect((await svgOf($)).includes(room(300, 400))).toBe(true)
  // the next session starts from what was kept
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  expect((await svgOf($)).includes(room(300, 400))).toBe(true)
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

const START = { cwd: '/repo', surface: 'desktop', isInteractive: true } as const
// A tool call as the engine raises it: the tool's arguments beside its name.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = ($: { tool: { call: (args: any) => Promise<unknown> } }, args: Record<string, unknown>) => $.tool.call(args)

test('no task at the start, then the desktop app\'s own task list fills the farm, ten plots at most', async ($, on) => {
  engine(on)
  await $.session.start(START)
  expect(await debugOf($)).toContain('Tâches 0/0')
  const items = Array.from({ length: 15 }, (_, i) => ({ content: `Étape ${i + 1}`, status: i < 11 ? 'completed' : i === 11 ? 'in_progress' : 'pending' }))
  await call($, { tool: 'mcp__ccd_turn__update_plan', items, scope: 'first_task' })
  expect(await debugOf($)).toContain('Tâches 11/15')
  await call($, { tool: 'mcp__ccd_turn__update_plan', advance: true })
  expect(await debugOf($)).toContain('Tâches 12/15')
  // twelve done out of fifteen: eight ripe plots out of ten, and the sign tells the true count
  const svg = await svgOf($)
  expect(svg.match(/<use href="#f(?:66|6|18|30|42|54)" x=/g)?.length).toBe(8)
  expect(svg.match(/<use href="#f(?:64|4|16|28|40|52)" x=/g)?.length).toBe(2)
  expect(svg.includes('class="vt">Tâches · 12/15<')).toBe(true)
  await call($, { tool: 'mcp__ccd_turn__update_plan', done: [13], start: 14 })
  expect(await debugOf($)).toContain('Tâches 13/15')
  await call($, { tool: 'mcp__ccd_turn__wrap_up', recap: 'Fait.' })
  expect(await debugOf($)).toContain('Tâches 15/15')
  // the app's own tools are not the post's business, another MCP tool is
  expect(await debugOf($)).toContain('activité idle')
  await call($, { tool: 'mcp__notion__search', query: 'panier' })
  expect(await debugOf($)).toContain('activité web')
})

test('a first turn that no plain message opened wakes the village', async ($, on) => {
  engine(on)
  await $.session.start(START)
  expect(await debugOf($)).toContain('Village : endormi')
  await $.turn.start({ text: '', turnId: 't1' })
  expect(await debugOf($)).toContain('Village : réveillé, activité thinking')
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
  expect(await debugOf($)).toContain('Tâches 1/2')
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
  const cleared = await debugOf($)
  expect(cleared).toContain('Tâches 0/0')
  expect(cleared).toContain('contexte 0 %,')
  await $.session.measure(fill(9000))
  expect(spells(await svgOf($))).toBe(0)
  expect(await debugOf($)).toContain('Compaction : aucune.')
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
  expect(await debugOf($)).toContain('wave 2/3, étapes commit, push, pr.')
  // an auto-merge only merges later
  await call($, { tool: 'Bash', command: 'gh pr merge --auto --squash' })
  expect(await debugOf($)).toContain('étapes commit, push, pr.')
  await call($, { tool: 'Bash', command: 'gh pr merge 12 --squash' })
  expect(await debugOf($)).toContain('étapes commit, push, pr, merged.')
})

test('a setting changed in the app wins over what the mod had kept', { options: { margin_left: 450, margin_right: 300, frame_interval: 2 } }, async ($, on) => {
  engine(on, 0, true, { margins: { left: 600, right: 600 }, sync: 0.5 })
  await $.session.start(START)
  expect((await svgOf($)).includes(room(450, 300))).toBe(true)
  expect(await debugOf($)).toContain('Horloge : réglée sur 2 s (réglages du plugin)')
})

test('what the mod kept stands while the settings say what they said', async ($, on) => {
  engine(on, 0, true, { margins: { left: 600, right: 600 }, sync: 0.5 })
  await $.session.start(START)
  expect((await svgOf($)).includes(room(600, 600))).toBe(true)
  expect(await debugOf($)).toContain('Horloge : réglée sur 0,5 s (stockage du mod)')
})
