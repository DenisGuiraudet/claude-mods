// Session Village: a pixel-art village behind the conversation that lives at the pace of the session.
// Signals: model and effort (turn.step), context, 5-hour limit and cost (session.measure), the tool
// at work (tool.call), sub-agents (turn.start/complete of other loops), tasks (TodoWrite, TaskCreate,
// TaskUpdate), commits, pushes and PRs (Bash and GitHub tools, GitHub events), compaction.
// The world steps every second, and a frame goes out when it changed, or while someone walks or an effect
// plays: a desktop that freezes the backdrop shows only the frames. /village opens the legend,
// /village-test tells how many frames the desktop drew in the last minute, /village-marges sets the room
// left on each side of the village (userConfig margin_left and margin_right), /village-debug reports what
// the mod sees and checks the last frame.
import type { EngineInterface, Register } from 'claude-code'

import {
  S, W, VIEWS, derive, newWorld, step, retarget, wake, compose, busy, evPrompt, evError, evCompact,
  evMerge, evCommit, evPush, sigActive, sigValue, sigCol,
} from './world.js'
import type { Activity, EffortKey, ModelKey, Steps } from './world.js'

type $T = EngineInterface
const SCENE = 'valley'
const PANE = 'village'
const MIN_GAP = 1000 // ms between two frames for small changes; events go out at once
const COMPACT_GAP = 30_000 // ms: session.compact and the context drop are one compaction
const SVG_LIMIT = 131072 // characters: the desktop refuses a longer scene
const now = () => Date.now()

let lastDraw = 0
let pending: { cancel: () => void } | null = null
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
function rhythm(t: number): string {
  const d = drawn.filter(x => x >= t - 60_000), a = asked.filter(x => x >= t - 60_000)
  const gaps = d.slice(1).map((x, i) => (x - (d[i] ?? x)) / 1000), s = (n: number) => n.toFixed(1).replace('.', ',')
  return gaps.length
    ? `Dernière minute : ${a.length} images demandées, ${d.length} dessinées, une toutes les ${s(gaps.reduce((x, y) => x + y, 0) / gaps.length)} s en moyenne (écart le plus long ${s(Math.max(...gaps))} s).`
    : `Dernière minute : ${a.length} images demandées, ${d.length} dessinées.`
}
// What /village-debug reports: each drawn frame's size, the clock's ticks, what the desktop and the events said.
const sizes: number[] = [] // characters, one per entry of drawn
const ticks: number[] = []
let tooBig = 0 // frames over SVG_LIMIT, drawn as the last one under it
let backdrop = { isDrawn: false, why: 'pas encore demandé' }
let since = 0 // when the clock started
let marginFrom = ''
let compactVia = ''
let received = '' // the last session.receive event, as it came
const seen = new Map<string, number>()
const saw = (event: string): void => { seen.set(event, (seen.get(event) ?? 0) + 1) }
const tasks = new Map<string, string>()
// Room left on each side of the village, in CSS pixels: the root svg gets that padding, so the village fits
// between the margins, and its shaded grass runs on under them (overflow visible).
const margin = { left: 0, right: 0 }
const MARGIN_KEY = { left: 'margin_left', right: 'margin_right' } as const
const pixels = (v: unknown): number => (typeof v === 'number' && v > 0 ? Math.min(2000, Math.round(v)) : 0)
function withMargins(svg: string): string {
  if (!margin.left && !margin.right) return svg
  return svg.replace('<svg ', '<svg class="kpad" ')
    .replace('<style>', `<style>.kpad{box-sizing:border-box;padding:0 ${margin.right}px 0 ${margin.left}px;overflow:visible}`)
}
// Margins /village-marges could not write to the settings (no /config row, as for a --plugin-dir plugin):
// kept in the store instead, and preferred to the settings at the next session.
const MARGIN_STORE = 'margins'
async function saveMargin($: $T, side: 'left' | 'right'): Promise<boolean> {
  const field = MARGIN_KEY[side]
  const rows = await $.config.list().catch(() => [])
  const row = rows.find(r => r.key === `${$.plugin.name}.${field}` || (r.key.startsWith(`${$.plugin.name}@`) && r.key.endsWith(`.${field}`)))
  if (!row) return false
  const set = await $.config.set({ key: row.key, value: margin[side] }).catch((err: unknown) => ({ deny: String(err) }))
  return !set.deny
}
const MARGIN_HELP = 'Exemples : /village-marges gauche 285, /village-marges droite 410, /village-marges 285 410. 0 retire une marge.'

// ---------- frames ----------
function draw($: $T, urgent = false): void {
  W.dirty = true
  const wait = urgent ? 0 : MIN_GAP - (now() - lastDraw)
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
// Every second: each villager acts when its own timer runs out, and the frame follows.
function tick($: $T): void {
  keep(ticks, now())
  step(now())
  // frozen, the scene moves only from one frame to the next: one a second while it moves on its own
  if (W.dirty || busy(lastDraw)) draw($)
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
const toolActivity = (tool: string): Activity | null => TOOL[tool] ?? (tool.startsWith('mcp__') ? 'web' : null)

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
// Halved and down by a fifth of the window at least; counted in tokens so a model switch to a
// larger window does not look like a drop.
const isCompactDrop = (before: number, after: number, window: number): boolean =>
  after <= before / 2 && before - after >= window / 5

function setTasks(): void {
  S.todoTotal = Math.min(10, tasks.size)
  S.todoDone = Math.min(S.todoTotal, [...tasks.values()].filter(v => v === 'completed').length)
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
const fr = (x: number, d = 1): string => x.toFixed(d).replace('.', ',')
const chars = (x: number): string => String(Math.round(x)).replace(/\B(?=(\d{3})+$)/g, ' ')
const tally = (names: string[]): string => [...new Set(names)].map(n => `${n} ${names.filter(x => x === n).length}`).join(', ')
async function attempt<T>(ask: () => Promise<T>, or: T): Promise<T> {
  try { return await ask() } catch { return or }
}
async function report($: $T): Promise<string> {
  const t = now(), inMinute = (a: number[]) => a.filter(x => x >= t - 60_000).length
  const [version, surfaces, rows] = await Promise.all([
    attempt(async () => (await $.session.version()).version, 'inconnue'),
    attempt(async () => (await $.session.surfaces()).join(', '), ''),
    attempt(() => $.config.list(), []),
  ])
  const hasRow = (field: string) => rows.some(r => r.key === `${$.plugin.name}.${field}` || (r.key.startsWith(`${$.plugin.name}@`) && r.key.endsWith(`.${field}`)))
  const d = drawn.filter(x => x >= t - 60_000), sz = sizes.slice(sizes.length - d.length)
  const gaps = d.slice(1).map((x, i) => (x - (d[i] ?? x)) / 1000), mean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0
  const heaviest = sz.length ? Math.max(...sz) : 0, wanted = Math.min(60, Math.floor((t - since) / 1000))
  const ents = W.ents as Ent[], fx = (W.fx as Fx[]).filter(x => x.until > t), fires = (W.fires as Fx[]).filter(x => x.until > t)
  const steps = Object.entries(S.steps).filter(([, done]) => done).map(([k]) => k).join(', ')
  // drawn as an image the SVG is strict XML; frozen, an animated element shows only its pose
  const dup = [...lastScene.matchAll(/<[a-zA-Z]+((?:\s+[\w:-]+="[^"]*")*)\s*\/?>/g)].filter(m => {
    const names = [...(m[1] ?? '').matchAll(/([\w:-]+)=/g)].map(x => x[1])
    return new Set(names).size !== names.length
  }).length
  const unposed = [...lastScene.matchAll(/<[a-zA-Z]+\b[^>]*\bstyle="[^"]*animation:(?!var\()[^"]*"[^>]*>/g)].filter(m => !/transform="|transform:|opacity:/.test(m[0])).length
  const checks: [boolean, string][] = [
    [backdrop.isDrawn, "l'app dessine le décor"],
    [d.length >= inMinute(asked) - 2, `l'app dessine les images demandées (${inMinute(asked)} demandées, ${d.length} dessinées)`],
    [gaps.length < 20 || mean <= 1.3, gaps.length < 20 ? "rythme : trop peu d'images cette minute pour juger" : `rythme : une image toutes les ${fr(mean)} s en moyenne`],
    [heaviest <= SVG_LIMIT && tooBig === 0, 'chaque image tient sous la limite de taille'],
    [inMinute(ticks) >= wanted - 2, `l'horloge du mod bat chaque seconde (${inMinute(ticks)} tops sur ${wanted})`],
    [lastScene !== '' && dup === 0, lastScene ? `XML strict${dup ? ` (${dup} balises avec un attribut en double)` : ''}` : 'aucune image à vérifier'],
    [lastScene !== '' && unposed === 0, `chaque élément animé porte sa pose, pour un décor figé${unposed ? ` (${unposed} sans pose)` : ''}`],
  ]
  return [
    'Session Village, diagnostic',
    `Claude Code ${version}, surfaces : ${surfaces || 'aucune'}.`,
    `Décor : ${backdrop.isDrawn ? 'dessiné' : `pas dessiné (${backdrop.why})`}.`,
    `${rhythm(t)}${d.length ? ` Dernière il y a ${fr((t - (d[d.length - 1] ?? t)) / 1000)} s.` : ''}`,
    `Taille : dernière image ${chars(sz[sz.length - 1] ?? 0)} caractères, la plus lourde de la minute ${chars(heaviest)}, limite ${chars(SVG_LIMIT)}. Allégées (marcheurs sans pas) : ${W.lite}. Trop lourdes, remplacées : ${tooBig}.`,
    `Horloge : ${inMinute(ticks)} tops dans la dernière minute, ${W.frame} pas depuis le début.`,
    `Village : ${S.started ? 'réveillé' : 'endormi'}, activité ${S.activity}, modèle ${S.model}, effort ${S.effort}, contexte ${S.context} %${ctxTokens !== undefined ? ` (${chars(ctxTokens)} tokens)` : ''}, limite 5 h ${S.rate} %, coût ${fr(S.cost, 2)} $.`,
    `Tâches ${S.todoDone}/${S.todoTotal}, sous-agents ${S.subagents}. Branche ${branch || 'inconnue'} : wave ${S.waveCurrent}/${S.wavesTotal}, étapes ${steps || 'aucune'}.`,
    `Monde : ${ents.length} personnages (${tally(ents.map(e => e.kind))}), ${ents.filter(e => e.pts && e.t1 > t).length} en marche ; effets : ${tally(fx.map(x => x.kind)) || 'aucun'} ; incendies : ${fires.length}.`,
    `Marges : gauche ${margin.left} px, droite ${margin.right} px${marginFrom ? `, venues ${marginFrom}` : ''}. Réglages margin_left et margin_right ${hasRow('margin_left') && hasRow('margin_right') ? "proposés par l'app" : 'absents (plugin chargé depuis un dossier ?)'}.`,
    `Compaction : ${lastCompact ? `il y a ${Math.round((t - lastCompact) / 60_000)} min, vue par ${compactVia}` : 'aucune'}.`,
    `Événements reçus : ${[...seen].map(([k, n]) => `${k} ${n}`).join(', ') || 'aucun'}.`,
    `Dernier session.receive : ${received || 'aucun'}.`,
    'Vérifications :',
    ...checks.map(([ok, what]) => `${ok ? 'OK' : 'À VOIR'} : ${what}`),
  ].join('\n')
}

export const register: Register = (on, options) => {
  margin.left = pixels(options.margin_left)
  margin.right = pixels(options.margin_right)
  if (margin.left || margin.right) marginFrom = 'des réglages du plugin'
  on('session.start', async ($, e, next) => {
    saw('session.start')
    cwd = e.cwd
    const [usage, model, turns] = await Promise.all([$.session.usage(), $.session.model(), $.session.turns()])
    S.model = modelKey(model)
    S.context = Math.round(usage.context.percent ?? 0)
    ctxTokens = usage.context.tokens
    S.rate = Math.round(usage.rateLimits.find(r => r.kind === 'five_hour')?.percentUsed ?? 0)
    S.cost = usage.cost?.usd ?? 0
    S.activity = 'idle'
    // asleep until the first message; a resumed conversation is already awake
    S.started = turns > 0
    const kept = (await $.store.get(MARGIN_STORE)) as { left?: unknown; right?: unknown } | undefined
    if (kept) {
      margin.left = pixels(kept.left)
      margin.right = pixels(kept.right)
      marginFrom = 'du stockage du mod'
    }
    await readBranch($)
    newWorld(now())
    await $.command.register({ name: 'village', description: 'Ouvre ou ferme la légende du village' })
    await $.command.register({ name: 'village-test', description: "Compte les images du décor dessinées pendant la dernière minute" })
    await $.command.register({ name: 'village-marges', description: 'Règle la marge gauche et la marge droite du village, en pixels' })
    await $.command.register({ name: 'village-debug', description: 'Fait le point sur le décor, ses images, la session et les événements reçus' })
    const set = await $.theme.set({ backdrop: { scene: SCENE } })
    backdrop = set.isDrawn ? { isDrawn: true, why: '' } : { isDrawn: false, why: set.reason }
    if (!set.isDrawn) $.ui.log(`backdrop not drawn: ${set.reason}`, { to: 'debug' })
    since = now()
    $.clock.every(1000, () => tick($))
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
    if (e.agentId === undefined) act($, 'thinking')
    else {
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
    } else if (e.tool === 'Bash') {
      const c = e.command
      if (/\bgit\s+commit\b/.test(c)) {
        S.steps = { ...S.steps, commit: true }
        evCommit(now())
        draw($, true)
      }
      if (/\bgit\s+push\b/.test(c)) {
        S.steps = { ...S.steps, push: true }
        evPush(now())
        draw($, true)
      }
      if (/\bgit\s+(checkout|switch)\b/.test(c)) {
        await readBranch($)
        draw($)
      }
      await saveWaves($)
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
    saw('session.measure')
    if (e.context.percent !== undefined) S.context = Math.round(e.context.percent)
    const { window } = e.context
    const tokens = e.context.tokens ?? (e.context.percent !== undefined ? (e.context.percent / 100) * window : undefined)
    if (tokens !== undefined) {
      if (ctxTokens !== undefined && isCompactDrop(ctxTokens, tokens, window)) compacted($, 'la baisse du contexte')
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
    // every pixel is a vector path: the desktop drops images embedded in a scene
    // the world as it stood when the frame was asked: frames a second apart show steps a second apart
    const svg = withMargins(compose(lastDraw || now()))
    keep(drawn, now())
    sizes.push(svg.length)
    sizes.splice(0, sizes.length - drawn.length)
    if (svg.length <= SVG_LIMIT) lastScene = svg
    else tooBig++
    return <Svg source={lastScene || svg} alt="Session Village, un village en pixel art qui vit au rythme de la session" />
  })

  on('command.run', { command: 'village-test' }, async () => ({ text: rhythm(now()) }))

  on('command.run', { command: 'village-debug' }, async $ => ({ text: await report($) }))

  // /village-marges gauche 285, droite 410, or both at once: saved in the settings (or the store), drawn at once.
  on('command.run', { command: 'village-marges' }, async ($, e) => {
    const words = e.args.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const num = (w?: string) => (w !== undefined && /^\d+$/.test(w) ? Math.min(2000, Number(w)) : undefined)
    const want: Partial<Record<'left' | 'right', number>> = {}
    if (words.length === 2 && num(words[0]) !== undefined && num(words[1]) !== undefined) {
      want.left = num(words[0])
      want.right = num(words[1])
    } else {
      for (let i = 0; i < words.length; i += 2) {
        const side = /^(g|gauche|l|left)$/.test(words[i] ?? '') ? 'left' : /^(d|droite|r|right)$/.test(words[i] ?? '') ? 'right' : undefined
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
      if (!(await saveMargin($, side))) inSettings = false
    }
    if (words.length) {
      if (inSettings) await $.store.delete(MARGIN_STORE)
      else await $.store.set(MARGIN_STORE, { ...margin })
      marginFrom = margin.left || margin.right ? (inSettings ? 'des réglages du plugin' : 'du stockage du mod') : ''
    }
    draw($, true)
    const line = `Marges du village : gauche ${margin.left} px, droite ${margin.right} px.`
    if (!words.length) return { text: `${line} ${MARGIN_HELP}` }
    return { text: `${line} ${inSettings ? 'Enregistrées dans les réglages du plugin.' : 'Gardées pour les prochaines sessions.'}` }
  })

  // ---------- /village: the legend pane ----------
  on('command.run', { command: 'village' }, async $ => {
    const isUp = (await $.ui.panes()).some(p => p.id === PANE)
    if (isUp) {
      await $.ui.close({ id: PANE })
      return { text: 'Légende du village fermée.' }
    }
    await $.ui.open({ id: PANE, title: 'Session Village' })
    return { text: 'Légende du village ouverte.' }
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
        {D.pre && <Text>Le village dort : le premier message le réveille.</Text>}
        {group('À droite, toujours visible', ['waves', 'think', 'context', 'cost'])}
        {group('À gauche', ['bash', 'edit', 'read', 'web', 'todo', 'agents'])}
        <Box flexDirection="column" gap={1}>
          <Text bold dimColor>Partout</Text>
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
