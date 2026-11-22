// Session Village: a pixel-art village behind the conversation that lives at the pace of the session.
// Signals: model and effort (turn.step), context, 5-hour limit and cost (session.measure), the tool
// at work (tool.call), sub-agents (turn.start/complete of other loops), tasks (TodoWrite, TaskCreate,
// TaskUpdate, the desktop app's task list), commits, pushes and PRs (Bash and GitHub tools, GitHub events), compaction.
// The world steps every second, and a frame goes out when it changed, or while someone walks or an effect
// plays: a desktop that freezes the backdrop shows only the frames. /village opens the legend,
// /village-test tells how many frames the desktop drew in the last minute, /village-margins sets the room
// left on each side of the village (userConfig margin_left and margin_right, or two clicks on it) and the width
// of the conversation column it keeps its buildings out of (column_width), /village-sync the time between
// two frames (userConfig frame_interval), /village-debug reports what the mod sees and checks the last frame.
import type { EngineInterface, Register } from 'claude-code'

import {
  S, W, VIEWS, derive, newWorld, step, retarget, wake, compose, busy, evPrompt, evError, evCompact,
  evMerge, evCommit, evPush, sigActive, sigValue, sigCol, clickShares,
} from './world.js'
import type { Activity, EffortKey, ModelKey, Steps } from './world.js'

type $T = EngineInterface
const SCENE = 'valley'
const PANE = 'village'
// The beat, in ms: the world steps and a frame may go out once per beat; events go out at once. 1 s by
// default, set by userConfig frame_interval or /village-sync (seconds) to try a slower or faster machine.
const DEFAULT_GAP = 1000
let gap = DEFAULT_GAP
let gapFrom = 'default'
const beat = (v: unknown): number | undefined =>
  typeof v === 'number' && v > 0 ? Math.round(Math.min(10, Math.max(0.1, v)) * 1000) : undefined
const SYNC_STORE = 'sync' // seconds, when the settings have no row for frame_interval
const SYNC_HELP = 'Examples: /village-sync 0.5 (two frames a second), /village-sync 2 (one every 2 s), /village-sync 1 (the default). Between 0.1 and 10 s.'
const COMPACT_GAP = 30_000 // ms: session.compact and the context drop are one compaction
const SVG_LIMIT = 131072 // characters: the desktop refuses a longer scene
const now = () => Date.now()

let lastDraw = 0
let pending: { cancel: () => void } | null = null
let clock: { cancel: () => void } | null = null
let cwd = ''
let branch = ''
let ctxTokens: number | undefined // last context fill session.measure reported, in tokens
let lastCompact = 0
let lastScene = '' // the last frame under SVG_LIMIT, drawn again should one go over
const loops = new Set<string>()
// The last minute of frames: when the mod asked for one, and when the desktop had the backdrop drawn.
const asked: number[] = []
const drawn: number[] = []
const keep = (a: number[], t: number): number[] => { a.push(t); while ((a[0] ?? t) < t - 60_000) a.shift(); return a }
// Frames asked before the desktop first drew one went to no one (it was not attached yet): they do not count.
let firstDrawn = 0
const askedIn = (t: number): number[] => asked.filter(x => x >= Math.max(t - 60_000, firstDrawn))
function rhythm(t: number): string {
  const d = drawn.filter(x => x >= t - 60_000), a = askedIn(t)
  const gaps = d.slice(1).map((x, i) => (x - (d[i] ?? x)) / 1000), s = (n: number) => n.toFixed(1)
  return gaps.length
    ? `Last minute: ${a.length} frames asked, ${d.length} drawn, one every ${s(gaps.reduce((x, y) => x + y, 0) / gaps.length)} s on average (longest gap ${s(Math.max(...gaps))} s).`
    : `Last minute: ${a.length} frames asked, ${d.length} drawn.`
}
// What /village-debug reports: each drawn frame's size, the clock's ticks, what the desktop and the events said.
const sizes: number[] = [] // characters, one per entry of drawn
const ticks: number[] = []
let tooBig = 0 // frames over SVG_LIMIT, drawn as the last one under it
let backdrop = { isDrawn: false, why: 'not asked yet' }
let since = 0 // when the clock started
let marginFrom = ''
let compactVia = ''
let received = '' // the last session.receive event, as it came
// At rest (the turn is over, no sub-agent runs) the village winds down: after REST_SLOW of beats with no event
// of the session, a frame every REST_GAP at most; after REST_STOP, none until the session moves again.
const REST_SLOW = 2 * 60_000, REST_GAP = 5000, REST_STOP = 10 * 60_000
// After REST_STOP, a plain field in the grass beyond the map: even still, the village costs the desktop app about
// 0.7 of a CPU core with hardware acceleration (it keeps painting it), the field next to nothing.
const REST_FIELD = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 16 9" preserveAspectRatio="none"><rect width="16" height="9" fill="#5d8c4a"/></svg>'
let quiet = 0 // ms of beats since the last event, counted at rest only
const seen = new Map<string, number>()
// `moves` false for an event that is no activity of the session (a measure: a limit moved a point).
const saw = (event: string, moves = true): void => {
  seen.set(event, (seen.get(event) ?? 0) + 1)
  if (moves) quiet = 0
}
// The size the desktop reports with each backdrop it asks (cells of its code font), and its last ten changes.
type View = { columns: number; rows: number; isFullscreen?: boolean }
const viewOf = (v?: View): string =>
  v ? `${v.columns} columns × ${v.rows} rows${v.isFullscreen === undefined ? '' : `, isFullscreen ${v.isFullscreen}`}` : 'not measured'
const views: { at: number; view: string }[] = []
const ago = (ms: number): string => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`)
const tasks = new Map<string, string>()
// Room left on each side of the village, in CSS pixels, in full from a 1600 px wide window and less below
// (world.js lays the scene out in CSS).
// By default, room for the sidebar on the left and an open pane on the right (as in plugin.json).
const DEFAULT_MARGIN = { left: 420, right: 320 } as const
const margin: Record<'left' | 'right', number> = { ...DEFAULT_MARGIN }
const MARGIN_KEY = { left: 'margin_left', right: 'margin_right' } as const
const pixels = (v: unknown): number => (typeof v === 'number' && v > 0 ? Math.min(2000, Math.round(v)) : 0)
// The conversation column's width in CSS pixels (userConfig column_width): the app's own, 768 by default.
const DEFAULT_COLUMN = 768
let column: number = DEFAULT_COLUMN
// Margins set by two clicks on the village (/village-margins click), shares of the window's width: they stand
// in for the pixel margins until those are set again, here or in the app (`over`, the margins they replaced).
const SHARE_STORE = 'margin-shares'
let share: { left: number; right: number } | null = null
// While /village-margins click waits for its two clicks (CLICK_WAIT at most), and where the first one landed.
const CLICK_WAIT = 2 * 60_000
let clicking: { until: number; first?: number } | null = null
const waiting = () => (clicking && now() <= clicking.until ? clicking : null)
// What the scene's CSS lays out: the margins, the column, and the line where the first click landed.
const layout = () => {
  const first = waiting()?.first
  return { ...margin, column, ...(share ? { fracLeft: share.left, fracRight: share.right } : {}), ...(first !== undefined ? { mark: first } : {}) }
}
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`
// Margins /village-margins could not write to the settings (no /config row, as for a --plugin-dir plugin):
// kept in the store instead, and preferred to the settings at the next session, until the settings change.
const MARGIN_STORE = 'margins'
// What the settings said when the plugin loaded. A value the mod kept notes the settings it stood in for
// (`over`, the defaults when absent): once they say something else, someone set them in the app, and they win.
const asSet = { left: DEFAULT_MARGIN.left as number, right: DEFAULT_MARGIN.right as number, column: DEFAULT_COLUMN as number, gap: DEFAULT_GAP }
async function saveSetting($: $T, field: string, value: number): Promise<boolean> {
  const rows = await $.config.list().catch(() => [])
  const row = rows.find(r => r.key === `${$.plugin.name}.${field}` || (r.key.startsWith(`${$.plugin.name}@`) && r.key.endsWith(`.${field}`)))
  if (!row) return false
  const set = await $.config.set({ key: row.key, value }).catch((err: unknown) => ({ deny: String(err) }))
  return !set.deny
}
const MARGIN_HELP = 'Examples: /village-margins left 285, /village-margins right 410, /village-margins 285 410 (0 removes a margin), /village-margins column 960 (the conversation column, 768 by default, 0 for none), /village-margins click (two clicks on the village set the margins).'
const CLICK_HELP = 'Click the village just right of the sidebar, then just left of the right panel (or near the right edge of the window when no panel is open). The margins then follow the window as shares of its width; /village-margins with pixels goes back to pixel margins.'

// ---------- frames ----------
function draw($: $T, urgent = false): void {
  W.dirty = true
  const wait = urgent ? 0 : gap - (now() - lastDraw)
  if (wait <= 0) {
    pending?.cancel()
    pending = null
    lastDraw = now()
    W.dirty = false
    keep(asked, lastDraw)
    $.ui.invalidate('ui.render')
    return
  }
  if (!pending) pending = $.clock.after(wait, () => { pending = null; draw($) })
}
// Every beat: each villager acts when its own timer runs out, and the frame follows.
function startClock($: $T): void {
  clock?.cancel()
  since = now()
  W.beat = gap / 1000 // still poses pace their loops on it
  clock = $.clock.every(gap, () => tick($))
}
function tick($: $T): void {
  keep(ticks, now())
  const wasStopped = quiet >= REST_STOP
  quiet = S.activity === 'idle' && S.subagents === 0 ? quiet + gap : 0
  if (quiet >= REST_STOP) {
    // one last frame: the plain field, until the session moves again
    if (!wasStopped) draw($, true)
    return
  }
  step(now())
  // frozen, the scene moves only from one frame to the next: one a beat while it moves on its own
  if ((W.dirty || busy(lastDraw)) && (quiet < REST_SLOW || quiet % REST_GAP < gap)) draw($)
}
function act($: $T, a: Activity): void {
  if (S.activity === a) return
  S.activity = a
  retarget(now())
  draw($)
}

// ---------- signals ----------
function modelKey(id: string): ModelKey {
  const s = id.toLowerCase()
  return s.includes('haiku') ? 'haiku' : s.includes('sonnet') ? 'sonnet' : s.includes('fable') ? 'fable' : 'opus'
}
function effortKey(x: string | number | undefined): EffortKey {
  return x === 'low' || x === 'medium' || x === 'high' || x === 'xhigh' || x === 'max' ? x : 'medium'
}
const TOOL: Record<string, Activity> = {
  Bash: 'bash', BashOutput: 'bash', KillShell: 'bash', Monitor: 'bash',
  Edit: 'edit', Write: 'edit', MultiEdit: 'edit', NotebookEdit: 'edit',
  Read: 'read', Grep: 'read', Glob: 'read', LS: 'read',
  WebFetch: 'web', WebSearch: 'web',
}
// An MCP tool is the post's business, but for the desktop app's own (its task list, its panes, its sessions).
const toolActivity = (tool: string): Activity | null =>
  TOOL[tool] ?? (tool.startsWith('mcp__') && !tool.startsWith('mcp__ccd_') ? 'web' : null)

// ---------- compaction: session.compact, or a sharp context drop when another plugin answered it ----------
function compacted($: $T, via: string): void {
  ctxTokens = undefined
  const t = now()
  if (t - lastCompact < COMPACT_GAP) return
  lastCompact = t
  compactVia = via
  evCompact(t)
  draw($, true)
}
// Halved and down by COMPACT_DROP tokens at least, whatever the window: a conversation compacted early on a
// 1M window never loses a fifth of it. Counted in tokens so a model switch to a larger window does not look
// like a drop.
const COMPACT_DROP = 20_000
const isCompactDrop = (before: number, after: number): boolean => after <= before / 2 && before - after >= COMPACT_DROP

// The true counts: the farm caps its plots, the sign tells them all.
function setTasks(): void {
  S.todoTotal = tasks.size
  S.todoDone = [...tasks.values()].filter(v => v === 'completed').length
}
// The desktop app keeps its task list with a tool of its own: the whole list (`items`), one step forward
// (`advance`), or steps by their 1-based number (`done`, `start`). Its wrap-up checks every step off.
const PLAN_TOOL = 'mcp__ccd_turn__update_plan'
const WRAP_TOOL = 'mcp__ccd_turn__wrap_up'
type Plan = { items?: unknown; advance?: unknown; done?: unknown; start?: unknown }
function planTasks(p: Plan): void {
  if (Array.isArray(p.items)) {
    tasks.clear()
    p.items.forEach((item: { status?: unknown } | null, i) => tasks.set(String(i + 1), String(item?.status ?? 'pending')))
  }
  const first = (status: string) => [...tasks].find(([, s]) => s === status)?.[0]
  if (p.advance === true) {
    const doing = first('in_progress'), next = first('pending')
    if (doing) tasks.set(doing, 'completed')
    if (next) tasks.set(next, 'in_progress')
  }
  if (Array.isArray(p.done)) for (const n of p.done) if (tasks.has(String(n))) tasks.set(String(n), 'completed')
  if (tasks.has(String(p.start))) tasks.set(String(p.start), 'in_progress')
}
// A conversation starts with no task, no sub-agent and no context fill to compare the next one with.
function fresh(): void {
  tasks.clear()
  setTasks()
  loops.clear()
  S.subagents = 0
  ctxTokens = undefined
}

// ---------- waves: one per PR of the branch, "[n/N]" in a PR title sets the count ----------
const FRESH: Steps = { commit: false, push: false, pr: false, merged: false }
const wavesKey = () => `waves:${cwd}:${branch}`
async function loadWaves($: $T): Promise<void> {
  const v = (await $.store.get(wavesKey())) as { total: number; current: number; steps: Steps } | undefined
  S.wavesTotal = v?.total ?? 1
  S.waveCurrent = v?.current ?? 1
  S.steps = { ...FRESH, ...(v?.steps ?? {}) }
}
async function saveWaves($: $T): Promise<void> {
  await $.store.set(wavesKey(), { total: S.wavesTotal, current: S.waveCurrent, steps: S.steps })
}
async function readBranch($: $T): Promise<void> {
  try {
    const r = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { cwd, timeoutMs: 3000 })
    branch = r.exitCode === 0 ? r.stdout.trim() : ''
  } catch {
    branch = ''
  }
  await loadWaves($)
}
function waveFromTitle(title: unknown): void {
  const m = /\[(\d+)\s*\/\s*(\d+)\]/.exec(String(title ?? ''))
  if (!m) return
  S.wavesTotal = Math.max(1, Math.min(5, Number(m[2])))
  S.waveCurrent = Math.max(1, Math.min(S.wavesTotal, Number(m[1])))
}
function merged($: $T): void {
  if (S.steps.merged) return
  S.steps = { ...S.steps, merged: true }
  evMerge(now())
  draw($, true)
  $.clock.after(4200, () => {
    if (S.waveCurrent < S.wavesTotal) {
      S.waveCurrent++
      S.steps = { ...FRESH }
    }
    void saveWaves($)
    draw($)
  })
}

// ---------- /village-debug: what the mod sees, and checks on the last frame drawn ----------
type Ent = { kind: string; pts: unknown; t1: number }
type Fx = { kind: string; until: number }
const dec = (x: number, d = 1): string => x.toFixed(d)
const chars = (x: number): string => String(Math.round(x)).replace(/\B(?=(\d{3})+$)/g, ',')
const tally = (names: string[]): string => [...new Set(names)].map(n => `${n} ${names.filter(x => x === n).length}`).join(', ')
async function attempt<T>(ask: () => Promise<T>, or: T): Promise<T> {
  try { return await ask() } catch { return or }
}
async function report($: $T, cmd?: { columns: number; isFullscreen: boolean }): Promise<string> {
  const t = now(), inMinute = (a: number[]) => a.filter(x => x >= t - 60_000).length
  const [version, surfaces, rows] = await Promise.all([
    attempt(async () => (await $.session.version()).version, 'unknown'),
    attempt(async () => (await $.session.surfaces()).join(', '), ''),
    attempt(() => $.config.list(), []),
  ])
  const hasRow = (field: string) => rows.some(r => r.key === `${$.plugin.name}.${field}` || (r.key.startsWith(`${$.plugin.name}@`) && r.key.endsWith(`.${field}`)))
  const d = drawn.filter(x => x >= t - 60_000), sz = sizes.slice(sizes.length - d.length)
  const gaps = d.slice(1).map((x, i) => (x - (d[i] ?? x)) / 1000), mean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0
  const heaviest = sz.length ? Math.max(...sz) : 0, wanted = Math.floor(Math.min(60_000, t - since) / gap), secs = String(gap / 1000)
  const ents = W.ents as Ent[], fx = (W.fx as Fx[]).filter(x => x.until > t), fires = (W.fires as Fx[]).filter(x => x.until > t)
  const steps = Object.entries(S.steps).filter(([, done]) => done).map(([k]) => k).join(', ')
  // drawn as an image the SVG is strict XML; frozen, an animated element shows only its pose
  const dup = [...lastScene.matchAll(/<[a-zA-Z]+((?:\s+[\w:-]+="[^"]*")*)\s*\/?>/g)].filter(m => {
    const names = [...(m[1] ?? '').matchAll(/([\w:-]+)=/g)].map(x => x[1])
    return new Set(names).size !== names.length
  }).length
  const unposed = [...lastScene.matchAll(/<[a-zA-Z]+\b[^>]*\bstyle="[^"]*animation:(?!var\()[^"]*"[^>]*>/g)].filter(m => !/transform="|transform:|opacity:/.test(m[0])).length
  const checks: [boolean, string][] = [
    [backdrop.isDrawn, 'the app draws the backdrop'],
    [d.length >= askedIn(t).length - 2, `the app draws the frames asked (${askedIn(t).length} asked, ${d.length} drawn)`],
    [gaps.length < 20 || mean <= gap / 1000 * 1.3, gaps.length < 20 ? "pace: too few frames this minute to tell" : `pace: one frame every ${dec(mean)} s on average, for ${secs} s set`],
    [heaviest <= SVG_LIMIT && tooBig === 0, 'every frame fits under the size limit'],
    [inMinute(ticks) >= wanted - 2, `the mod's clock ticks every ${secs} s (${inMinute(ticks)} ticks out of ${wanted})`],
    [lastScene !== '' && dup === 0, lastScene ? `strict XML${dup ? ` (${dup} tags with a duplicate attribute)` : ''}` : 'no frame to check'],
    [lastScene !== '' && unposed === 0, `every animated element holds its pose, for a frozen backdrop${unposed ? ` (${unposed} without one)` : ''}`],
  ]
  return [
    'Session Village, diagnostics',
    `Claude Code ${version}, surfaces: ${surfaces || 'none'}.`,
    `Backdrop: ${backdrop.isDrawn ? 'drawn' : `not drawn (${backdrop.why})`}.`,
    `${rhythm(t)}${d.length ? ` Last one ${dec((t - (d[d.length - 1] ?? t)) / 1000)} s ago.` : ''}`,
    `Size: last frame ${chars(sz[sz.length - 1] ?? 0)} characters, heaviest of the minute ${chars(heaviest)}, limit ${chars(SVG_LIMIT)}. Lightened (walkers without steps): ${W.lite}. Too heavy, replaced: ${tooBig}.`,
    `Clock: set to ${secs} s (${gapFrom}), ${inMinute(ticks)} ticks in the last minute, ${W.frame} steps since the start.${quiet >= REST_STOP ? ' At rest: frames stopped, a plain field instead of the village.' : quiet >= REST_SLOW ? ` At rest: one frame every ${REST_GAP / 1000} s at most.` : ''}`,
    `Village: ${S.started ? 'awake' : 'asleep'}, activity ${S.activity}, model ${S.model}, effort ${S.effort}, context ${S.context}%${ctxTokens !== undefined ? ` (${chars(ctxTokens)} tokens)` : ''}, 5-hour limit ${S.rate}%, cost $${dec(S.cost, 2)}.`,
    `Tasks ${S.todoDone}/${S.todoTotal}, sub-agents ${S.subagents}. Branch ${branch || 'unknown'}: wave ${S.waveCurrent}/${S.wavesTotal}, steps ${steps || 'none'}.`,
    `World: ${ents.length} characters (${tally(ents.map(e => e.kind))}), ${ents.filter(e => e.pts && e.t1 > t).length} walking; effects: ${tally(fx.map(x => x.kind)) || 'none'}; fires: ${fires.length}.`,
    `Margins: ${share ? `left ${pct(share.left)}, right ${pct(share.right)} of the window's width, set by two clicks` : `left ${margin.left} px, right ${margin.right} px${marginFrom ? `, from ${marginFrom}` : ''} (in full from 1,600 px wide, none under 700 px)`}. Conversation column: ${column ? `${column} px` : 'none'}.${waiting() ? ` Waiting for ${waiting()?.first === undefined ? 'two clicks' : 'a second click'}.` : ''} Settings margin_left and margin_right ${hasRow('margin_left') && hasRow('margin_right') ? 'offered by the app' : 'missing (plugin loaded from a folder?)'}.`,
    `Size received with the backdrop, since: ${views.map(v => `${ago(t - v.at)} ago, ${v.view}`).join('; ') || 'none'}.${cmd ? ` With this command: ${cmd.columns} columns, isFullscreen ${cmd.isFullscreen}.` : ''}`,
    `Compaction: ${lastCompact ? `${Math.round((t - lastCompact) / 60_000)} min ago, seen by ${compactVia}` : 'none'}.`,
    `Events received: ${[...seen].map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}.`,
    `Last session.receive: ${received || 'none'}.`,
    'Checks:',
    ...checks.map(([ok, what]) => `${ok ? 'OK' : 'TO CHECK'}: ${what}`),
  ].join('\n')
}

export const register: Register = (on, options) => {
  // a setting left out keeps the default, 0 removes the margin
  margin.left = options.margin_left == null ? DEFAULT_MARGIN.left : pixels(options.margin_left)
  margin.right = options.margin_right == null ? DEFAULT_MARGIN.right : pixels(options.margin_right)
  marginFrom = options.margin_left == null && options.margin_right == null ? 'the defaults' : 'the plugin settings'
  column = options.column_width == null ? DEFAULT_COLUMN : pixels(options.column_width)
  gap = beat(options.frame_interval) ?? DEFAULT_GAP
  gapFrom = gap === DEFAULT_GAP ? 'default' : 'plugin settings' // options come with the defaults filled in
  Object.assign(asSet, { left: margin.left, right: margin.right, column, gap })
  on('session.start', async ($, e, next) => {
    saw('session.start')
    cwd = e.cwd
    fresh()
    const [usage, model, turns] = await Promise.all([$.session.usage(), $.session.model(), $.session.turns()])
    S.model = modelKey(model)
    S.context = Math.round(usage.context.percent ?? 0)
    ctxTokens = usage.context.tokens
    S.rate = Math.round(usage.rateLimits.find(r => r.kind === 'five_hour')?.percentUsed ?? 0)
    S.cost = usage.cost?.usd ?? 0
    S.activity = 'idle'
    // asleep until the first message; a resumed conversation is already awake
    S.started = turns > 0
    const kept = (await $.store.get(MARGIN_STORE)) as { left?: unknown; right?: unknown; column?: unknown; over?: { left?: unknown; right?: unknown; column?: unknown } } | undefined
    const over = { ...DEFAULT_MARGIN, column: DEFAULT_COLUMN, ...kept?.over }
    if (kept && (over.left !== asSet.left || over.right !== asSet.right || over.column !== asSet.column)) await $.store.delete(MARGIN_STORE)
    else if (kept) {
      margin.left = pixels(kept.left)
      margin.right = pixels(kept.right)
      if (kept.column !== undefined) column = pixels(kept.column)
      marginFrom = 'the mod storage'
    }
    const shares = (await $.store.get(SHARE_STORE)) as { left?: unknown; right?: unknown; over?: { left?: unknown; right?: unknown } } | undefined
    if (shares) {
      const was = { ...DEFAULT_MARGIN, ...shares.over }
      const ok = typeof shares.left === 'number' && typeof shares.right === 'number'
      if (ok && was.left === margin.left && was.right === margin.right) share = { left: shares.left as number, right: shares.right as number }
      else await $.store.delete(SHARE_STORE)
    }
    // seconds alone as it was first kept, then with the setting it stood in for
    const sync = (await $.store.get(SYNC_STORE)) as number | { s?: unknown; over?: unknown } | null | undefined
    const keptSync: { s?: unknown; over?: unknown } = typeof sync === 'object' && sync ? sync : { s: sync }
    const keptGap = beat(keptSync.s)
    if (keptGap && (keptSync.over ?? DEFAULT_GAP) !== asSet.gap) await $.store.delete(SYNC_STORE)
    else if (keptGap) {
      gap = keptGap
      gapFrom = 'mod storage'
    }
    await readBranch($)
    newWorld(now())
    await $.command.register({ name: 'village', description: 'Opens or closes the village legend' })
    await $.command.register({ name: 'village-test', description: 'Counts the backdrop frames drawn in the last minute' })
    await $.command.register({ name: 'village-margins', description: 'Sets the room left on each side of the village and the conversation column it keeps clear of' })
    await $.command.register({ name: 'village-sync', description: 'Sets the time between two backdrop frames, in seconds (1 by default)' })
    await $.command.register({ name: 'village-debug', description: 'Reports on the backdrop, its frames, the session and the events received' })
    const set = await $.theme.set({ backdrop: { scene: SCENE } })
    backdrop = set.isDrawn ? { isDrawn: true, why: '' } : { isDrawn: false, why: set.reason }
    if (!set.isDrawn) $.ui.log(`backdrop not drawn: ${set.reason}`, { to: 'debug' })
    startClock($)
    draw($, true)
    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    saw('prompt.submit')
    if (!e.command && !e.isMeta) {
      evPrompt(now())
      draw($, true)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', ($, e, next) => {
    saw('turn.start')
    if (e.agentId === undefined) {
      // a first message that is a command or a skill raises no plain prompt: the turn itself wakes the village
      if (!S.started) {
        wake(now())
        draw($, true)
      }
      act($, 'thinking')
    } else {
      loops.add(e.agentId)
      S.subagents = loops.size
      draw($)
    }
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    saw('turn.complete')
    if (e.agentId === undefined) act($, 'idle')
    else if (loops.delete(e.agentId)) {
      S.subagents = loops.size
      draw($)
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    saw('turn.step')
    if (e.agentId === undefined) {
      const m = modelKey(e.model), f = effortKey(e.effort)
      if (m !== S.model || f !== S.effort) {
        S.model = m
        S.effort = f
        draw($)
      }
      act($, 'thinking')
    }
    return yield* next(e)
  })

  on('tool.call', async ($, e, next) => {
    saw('tool.call')
    const main = e.agentId === undefined
    const tool = String(e.tool)
    const a = toolActivity(tool)
    if (main && a) act($, a)
    if (e.tool === 'TodoWrite') {
      tasks.clear()
      e.todos.forEach((t, i) => tasks.set(String(i), t.status))
      setTasks()
      draw($)
    }
    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    if (ran.isError) {
      if (main) {
        evError(now())
        draw($, true)
      }
      return ran
    }
    if (e.tool === 'TaskCreate') {
      const id = /#(\d+)|"id"\s*:\s*"?(\d+)/.exec(JSON.stringify(ran.result ?? ''))
      tasks.set(id?.[1] ?? id?.[2] ?? `n${tasks.size + 1}`, 'pending')
      setTasks()
      draw($)
    } else if (e.tool === 'TaskUpdate' && e.status) {
      if (e.status === 'deleted') tasks.delete(e.taskId)
      else tasks.set(e.taskId, e.status)
      setTasks()
      draw($)
    } else if (tool === PLAN_TOOL || tool === WRAP_TOOL) {
      if (tool === PLAN_TOOL) planTasks(e as unknown as Plan)
      else for (const id of tasks.keys()) tasks.set(id, 'completed')
      setTasks()
      draw($)
    } else if (e.tool === 'Bash') {
      const c = e.command
      // the branch first: what follows in the same command belongs to the one it lands on
      if (/\bgit\s+(checkout|switch)\b/.test(c)) {
        await readBranch($)
        draw($)
      }
      const before = S.steps
      if (/\bgit\s+commit\b/.test(c)) {
        S.steps = { ...S.steps, commit: true }
        evCommit(now())
      }
      if (/\bgit\s+push\b/.test(c)) {
        S.steps = { ...S.steps, push: true }
        evPush(now())
      }
      // the gh CLI, as the GitHub tools below; an auto-merge only merges later
      if (/\bgh\s+pr\s+create\b/.test(c)) {
        waveFromTitle(/(?:--title|-t)[=\s]+(["'])(.*?)\1/.exec(c)?.[2])
        S.steps = { ...S.steps, pr: true }
      }
      if (/\bgh\s+pr\s+merge\b/.test(c) && !/--auto\b/.test(c)) merged($)
      // saved and drawn only when a step moved, not at every command
      if (S.steps !== before) {
        await saveWaves($)
        draw($, true)
      }
    } else if (/create_pull_request$/.test(tool)) {
      waveFromTitle((e as unknown as { title?: string }).title)
      S.steps = { ...S.steps, pr: true }
      await saveWaves($)
      draw($, true)
    } else if (/merge_pull_request$/.test(tool)) {
      merged($)
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('session.measure', ($, e, next) => {
    saw('session.measure', false)
    if (e.context.percent !== undefined) S.context = Math.round(e.context.percent)
    const { window } = e.context
    const tokens = e.context.tokens ?? (e.context.percent !== undefined ? (e.context.percent / 100) * window : undefined)
    if (tokens !== undefined) {
      if (ctxTokens !== undefined && isCompactDrop(ctxTokens, tokens)) compacted($, 'the context drop')
      ctxTokens = tokens
    }
    const five = e.rateLimits.find(r => r.kind === 'five_hour')
    if (five) S.rate = Math.round(five.percentUsed)
    if (e.cost) S.cost = e.cost.usd
    draw($)
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    saw('session.compact')
    const done = await next(e)
    // a precompute installs nothing and a skip leaves the conversation as it is
    if (e.trigger !== 'precompute' && done.skip === undefined) compacted($, 'session.compact')
    return done
  }).catch(($, e, next) => next(e))

  // /clear starts a new conversation in the same process, with no session.start: the tasks, the sub-agents
  // and the context fill of the one that ends go with it
  on('session.end', ($, e, next) => {
    saw('session.end')
    if (e.reason === 'clear') {
      fresh()
      S.context = 0
      draw($)
    }
    return next(e)
  })

  // GitHub events of a subscribed pull request: opened, merged, a failing check
  on('session.receive', ($, e, next) => {
    saw('session.receive')
    const ev = e.event
    received = JSON.stringify(ev ?? null).slice(0, 400)
    if (ev?.source === 'github') {
      const d = ev.data
      const outcome = String(d.outcome ?? d.conclusion ?? d.action ?? '')
      if (/pull_request/.test(ev.kind) && (/merged/.test(outcome) || /merged/.test(ev.kind) || d.merged === true)) merged($)
      else if (/pull_request/.test(ev.kind) && /opened|ready/.test(outcome + ev.kind)) {
        S.steps = { ...S.steps, pr: true }
        void saveWaves($)
        draw($, true)
      } else if (/check|workflow/.test(ev.kind) && /fail/.test(outcome)) {
        evError(now())
        draw($, true)
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // ---------- the scene behind the conversation (desktop) ----------
  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.props.scene !== SCENE || e.surface !== 'desktop') return next(e)
    const { Svg } = $.ui.resolve(e)
    const view = viewOf(e.viewport)
    if (view !== views[views.length - 1]?.view) {
      views.push({ at: now(), view })
      views.splice(0, views.length - 10)
    }
    // every pixel is a vector path: the desktop drops images embedded in a scene
    // the world as it stood when the frame was asked: frames a second apart show steps a second apart
    const svg = quiet >= REST_STOP ? REST_FIELD : compose(lastDraw || now(), layout())
    keep(drawn, now())
    if (!firstDrawn) firstDrawn = now()
    // drawn now, whatever theme.set answered before the desktop attached
    backdrop = { isDrawn: true, why: '' }
    sizes.push(svg.length)
    sizes.splice(0, sizes.length - drawn.length)
    if (svg.length <= SVG_LIMIT) lastScene = svg
    else tooBig++
    // in a sandboxed frame rather than an image, where its CSS animations may play between two frames
    return <Svg source={lastScene || svg} isInteractive alt="Session Village, a pixel-art village that lives at the pace of the session" />
  })

  on('command.run', { command: 'village-test' }, async () => ({ text: rhythm(now()) }))

  on('command.run', { command: 'village-debug' }, async ($, e) => ({ text: await report($, e.presentation) }))

  // /village-margins left 285, right 410, or both at once, column 960: saved in the settings (or the store),
  // drawn at once. /village-margins click: the next two clicks on the village set the margins.
  on('command.run', { command: 'village-margins' }, async ($, e) => {
    const words = e.args.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 1 && /^(click|clic)$/.test(words[0] ?? '')) {
      clicking = { until: now() + CLICK_WAIT }
      return { text: CLICK_HELP }
    }
    const num = (w?: string) => (w !== undefined && /^\d+$/.test(w) ? Math.min(2000, Number(w)) : undefined)
    const want: Partial<Record<'left' | 'right' | 'column', number>> = {}
    if (words.length === 2 && num(words[0]) !== undefined && num(words[1]) !== undefined) {
      want.left = num(words[0])
      want.right = num(words[1])
    } else {
      for (let i = 0; i < words.length; i += 2) {
        const w = words[i] ?? ''
        const side = /^(g|gauche|l|left)$/.test(w) ? 'left' : /^(d|droite|r|right)$/.test(w) ? 'right' : /^(c|col|column|colonne)$/.test(w) ? 'column' : undefined
        const v = num(words[i + 1])
        if (!side || v === undefined) return { text: MARGIN_HELP }
        want[side] = v
      }
    }
    let inSettings = true
    for (const side of ['left', 'right'] as const) {
      const v = want[side]
      if (v === undefined) continue
      margin[side] = v
      if (!(await saveSetting($, MARGIN_KEY[side], v))) inSettings = false
    }
    if (want.column !== undefined) {
      column = want.column
      if (!(await saveSetting($, 'column_width', column))) inSettings = false
    }
    if (words.length) {
      if (inSettings) await $.store.delete(MARGIN_STORE)
      else await $.store.set(MARGIN_STORE, { ...margin, column, over: { left: asSet.left, right: asSet.right, column: asSet.column } })
      marginFrom = margin.left || margin.right ? (inSettings ? 'the plugin settings' : 'the mod storage') : ''
    }
    // margins in pixels take over from those two clicks set
    if (want.left !== undefined || want.right !== undefined) {
      share = null
      clicking = null
      await $.store.delete(SHARE_STORE)
    }
    draw($, true)
    const sides = share ? `left ${pct(share.left)}, right ${pct(share.right)} of the window's width` : `left ${margin.left} px, right ${margin.right} px`
    const line = `Village margins: ${sides}, conversation column ${column ? `${column} px` : 'none'}.`
    if (!words.length) return { text: `${line} ${MARGIN_HELP}` }
    return { text: `${line} ${inSettings ? 'Saved in the plugin settings.' : 'Kept for the next sessions.'}` }
  })

  // The two clicks /village-margins click waits for, at the edges of the room between the app's panels, in
  // either order. A second click too close to the first stands for a first one instead.
  on('ui.pointer', async ($, e, next) => {
    if (e.scene !== SCENE || !clicking) return next(e)
    if (!waiting()) {
      clicking = null
      draw($, true)
      return next(e)
    }
    const set = clicking.first === undefined ? null : clickShares(clicking.first, e.x)
    if (!set) clicking.first = e.x
    else {
      share = set
      clicking = null
      marginFrom = 'two clicks'
      await $.store.set(SHARE_STORE, { ...set, over: { left: margin.left, right: margin.right } })
    }
    draw($, true)
    return next(e)
  })

  // /village-sync 0.5: the time between two frames, in seconds, saved in the settings (or the store), at once.
  on('command.run', { command: 'village-sync' }, async ($, e) => {
    const arg = e.args.trim().replace(',', '.')
    const line = () => `One frame every ${gap / 1000} s at most.`
    if (!arg) return { text: `${line()} ${SYNC_HELP}` }
    const v = /^\d+(\.\d+)?$/.test(arg) ? beat(Number(arg)) : undefined
    if (v === undefined) return { text: SYNC_HELP }
    gap = v
    const inSettings = await saveSetting($, 'frame_interval', gap / 1000)
    if (inSettings) await $.store.delete(SYNC_STORE)
    else await $.store.set(SYNC_STORE, { s: gap / 1000, over: asSet.gap })
    gapFrom = inSettings ? 'plugin settings' : 'mod storage'
    startClock($)
    draw($, true)
    return { text: `${line()} ${inSettings ? 'Saved in the plugin settings.' : 'Kept for the next sessions.'}` }
  })

  // ---------- /village: the legend pane ----------
  on('command.run', { command: 'village' }, async $ => {
    const isUp = (await $.ui.panes()).some(p => p.id === PANE)
    if (isUp) {
      await $.ui.close({ id: PANE })
      return { text: 'Village legend closed.' }
    }
    await $.ui.open({ id: PANE, title: 'Session Village' })
    return { text: 'Village legend opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const t = now(), D = derive(t), V = VIEWS.valley
    const row = (id: string) => {
      const p = V.places[id], isOn = sigActive(id, t)
      if (!p) return null
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between" gap={1}>
            <Text color={sigCol(id, D)}>■</Text>
            <Text bold color={isOn ? 'warning' : undefined}>{p.name}</Text>
            <Text mono dimColor={!isOn}>{sigValue(id)}</Text>
          </Box>
          <Text dimColor>{p.look}</Text>
        </Box>
      )
    }
    const group = (title: string, ids: string[]) => (
      <Box flexDirection="column" gap={1}>
        <Text bold dimColor>{title}</Text>
        {ids.map(row)}
      </Box>
    )
    return (
      <Box flexDirection="column" gap={1}>
        {D.pre && <Text>The village is asleep: the first message wakes it up.</Text>}
        {group('On the right, always visible', ['waves', 'think', 'context', 'cost'])}
        {group('On the left', ['bash', 'edit', 'read', 'web', 'todo', 'agents'])}
        <Box flexDirection="column" gap={1}>
          <Text bold dimColor>Everywhere</Text>
          {(V.extraLook ?? []).map(([n, l]) => (
            <Box flexDirection="column">
              <Text bold>{n}</Text>
              <Text dimColor>{l}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
