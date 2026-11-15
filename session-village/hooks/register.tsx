// Session Village: a pixel-art village behind the conversation that lives at the pace of the session.
// Signals: model and effort (turn.step), context, 5-hour limit and cost (session.measure), the tool
// at work (tool.call), sub-agents (turn.start/complete of other loops), tasks (TodoWrite, TaskCreate,
// TaskUpdate), commits, pushes and PRs (Bash and GitHub tools, GitHub events), compaction.
// The world steps every 5 to 8 s and a frame is sent only when it changed, or every 1.5 s while someone
// walks or an effect plays: a desktop that freezes the backdrop shows only the frames. /village opens the legend.
import type { EngineInterface, Register } from 'claude-code'

import {
  S, W, VIEWS, derive, newWorld, step, retarget, wake, compose, busy, evPrompt, evError, evCompact,
  evMerge, evCommit, evPush, sigActive, sigValue, sigCol,
} from './world.js'
import type { Activity, EffortKey, ModelKey, Steps } from './world.js'

type $T = EngineInterface
const SCENE = 'valley'
const PANE = 'village'
const MIN_GAP = 1500 // ms between two frames for small changes; events go out at once
const COMPACT_GAP = 30_000 // ms: session.compact and the context drop are one compaction
const SVG_LIMIT = 131072 // characters: the desktop refuses a longer scene
const now = () => Date.now()

let lastTick = 0
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
const keep = (a: number[], t: number): number[] => { a.push(t); while (a[0] < t - 60_000) a.shift(); return a }
function rhythm(t: number): string {
  const d = drawn.filter(x => x >= t - 60_000), a = asked.filter(x => x >= t - 60_000)
  const gaps = d.slice(1).map((x, i) => (x - d[i]) / 1000), s = (n: number) => n.toFixed(1).replace('.', ',')
  return gaps.length
    ? ` Dernière minute : ${a.length} images demandées, ${d.length} dessinées, une toutes les ${s(gaps.reduce((x, y) => x + y, 0) / gaps.length)} s en moyenne (écart le plus long ${s(Math.max(...gaps))} s).`
    : ` Dernière minute : ${a.length} images demandées, ${d.length} dessinées.`
}
const tasks = new Map<string, string>()

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
// ---------- /village-test: animation samples over the scene, to see what the desktop runs ----------
// /village-test shows the panel over the scene, /village-test seul shows it alone, to tell the scene's weight
// apart from the desktop's own handling; /village-test again hides it.
let testMode: 'off' | 'panel' | 'alone' = 'off'
let testFrames = 0
const TEST_CSS =
  '@keyframes kt-spin{to{transform:rotate(360deg)}}@keyframes kt-slide{to{transform:translateX(120px)}}' +
  '@keyframes kt-blink{50%{opacity:.1}}.kt-class{animation:kt-slide 2s ease-in-out infinite alternate}' +
  '.kt-g{animation:kt-slide 2s ease-in-out infinite alternate}' +
  // detectors: which way the desktop draws the scene, and whether the system asks for less motion
  '.kt-frame,.kt-rm-yes{display:none}html .kt-frame{display:inline}html .kt-img{display:none}' +
  '@media (prefers-reduced-motion: reduce){.kt-rm-yes{display:inline}.kt-rm-no{display:none}}'
// The panel sits on the right wing, out of the frosted conversation column: labels at x 1105, samples from 1300.
const box = (more: string, inner = '') => `<rect x="1300" y="-18" width="30" height="30" ${more}>${inner}</rect>`
const say = (cls: string, text: string, fill: string) => `<text x="1300" y="6" class="${cls}" font-family="monospace" font-size="17" fill="${fill}">${text}</text>`
const TESTS: [string, string][] = [
  ['1 CSS style= (mod)', box('fill="#ff7ac8" style="animation:kt-spin 2s linear infinite;transform-box:fill-box;transform-origin:center"')],
  ['2 CSS classe', box('fill="#7ee0ff" class="kt-class"')],
  ['3 CSS paliers', box('fill="#b6ff7a" style="animation:kt-slide 1.2s steps(4) infinite;animation-delay:-.7s"')],
  ['4 CSS opacité', box('fill="#ffd04a" style="animation:kt-blink 1s steps(2) infinite"')],
  ['5 CSS groupe <g>', `<g class="kt-g">${box('fill="#ff9f43"')}</g>`],
  ['6 SMIL animate x', box('fill="#ff9f43"', '<animate attributeName="x" values="1300;1420;1300" dur="2s" repeatCount="indefinite"/>')],
  ['7 SMIL animate fill', box('fill="#f44"', '<animate attributeName="fill" values="#f44;#4f4;#48f" dur="1.5s" calcMode="discrete" repeatCount="indefinite"/>')],
  ['8 SMIL transform', box('fill="#c58cff"', '<animateTransform attributeName="transform" type="rotate" from="0 1315 -3" to="360 1315 -3" dur="2s" repeatCount="indefinite"/>')],
  ['9 SMIL motion', box('fill="#5ee6b0"', '<animateMotion path="M0 0h120" dur="2s" repeatCount="indefinite"/>')],
  ['10 SMIL set (2 s)', box('fill="#f44"', '<set attributeName="fill" to="#4f4" begin="2s"/>')],
  ['11 SMIL une fois', box('fill="#7ee0ff"', '<animate attributeName="width" from="4" to="150" begin="0s" dur="3s" fill="freeze"/>')],
  ['12 Dessin', say('kt-frame', 'cadre (iframe)', '#b6ff7a') + say('kt-img', 'image (img)', '#ffd04a')],
  ['13 Moins d\'anim.', say('kt-rm-yes', 'oui (Windows)', '#ff7ac8') + say('kt-rm-no', 'non', '#b6ff7a')],
]
function withTests(svg: string, t: number): string {
  testFrames++
  const at = new Date(t).toLocaleTimeString('fr-FR')
  const font = (size = 17, fill = '#fff') => `font-family="monospace" font-size="${size}" fill="${fill}"`
  const top = 160, row = 44, first = top + 74
  const rows = TESTS.map(([label, sample], i) =>
    `<g transform="translate(0 ${first + i * row})"><text x="1105" y="6" ${font()}>${label.replace(/</g, '&lt;')}</text>${sample}</g>`).join('')
  const clock = `<g transform="translate(0 ${first + TESTS.length * row})"><text x="1105" y="6" ${font(17, '#ffd04a')}>14 Image</text>` +
    `<text x="1300" y="6" ${font(17, '#ffd04a')}>n° ${testFrames} ${at}</text></g>`
  const panel = `<g><rect x="1090" y="${top}" width="440" height="${100 + TESTS.length * row}" rx="12" fill="#1d1a2b" opacity=".94"/>` +
    `<text x="1105" y="${top + 36}" ${font(20)}>Tests · /village-test</text>${rows}${clock}</g>`
  return svg.replace(/<\/svg>$/, `<style>${TEST_CSS}</style>${panel}</svg>`)
}
// The panel on a plain ground: no village, a few hundred characters.
const testAlone = (t: number): string => withTests(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">' +
  '<rect width="1600" height="1000" fill="#3a5a40"/></svg>', t)

function tick($: $T): void {
  const t = now()
  // the test panel's clock: a new frame every 3 s shows whether frames arrive
  if (testMode !== 'off' && t - lastDraw >= 3000) draw($)
  // frozen, the scene moves only from one frame to the next: one every MIN_GAP while it moves on its own
  if (busy(lastDraw)) draw($)
  const calm = !S.started || (S.activity === 'idle' && W.fx.length === 0 && W.fires.length === 0)
  if (t - lastTick < (calm ? 8000 : 5000)) return
  lastTick = t
  step(t)
  if (W.dirty) draw($)
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
function compacted($: $T): void {
  ctxTokens = undefined
  const t = now()
  if (t - lastCompact < COMPACT_GAP) return
  lastCompact = t
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
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
    await readBranch($)
    newWorld(now())
    await $.command.register({ name: 'village', description: 'Ouvre ou ferme la légende du village' })
    await $.command.register({ name: 'village-test', description: "Affiche ou masque les tests d'animation du décor" })
    const set = await $.theme.set({ backdrop: { scene: SCENE } })
    if (!set.isDrawn) $.ui.log(`valley: ${set.reason}`, { to: 'debug' })
    $.clock.every(1000, () => tick($))
    draw($, true)
    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    if (!e.command && !e.isMeta) {
      evPrompt(now())
      draw($, true)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) act($, 'thinking')
    else {
      loops.add(e.agentId)
      S.subagents = loops.size
      draw($)
    }
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    if (e.agentId === undefined) act($, 'idle')
    else if (loops.delete(e.agentId)) {
      S.subagents = loops.size
      draw($)
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
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
    if (e.context.percent !== undefined) S.context = Math.round(e.context.percent)
    const { window } = e.context
    const tokens = e.context.tokens ?? (e.context.percent !== undefined ? (e.context.percent / 100) * window : undefined)
    if (tokens !== undefined) {
      if (ctxTokens !== undefined && isCompactDrop(ctxTokens, tokens, window)) compacted($)
      ctxTokens = tokens
    }
    const five = e.rateLimits.find(r => r.kind === 'five_hour')
    if (five) S.rate = Math.round(five.percentUsed)
    if (e.cost) S.cost = e.cost.usd
    draw($)
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const done = await next(e)
    // a precompute installs nothing and a skip leaves the conversation as it is
    if (e.trigger !== 'precompute' && done.skip === undefined) compacted($)
    return done
  }).catch(($, e, next) => next(e))

  // GitHub events of a subscribed pull request: opened, merged, a failing check
  on('session.receive', ($, e, next) => {
    const ev = e.event
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
    const t = now()
    keep(drawn, t)
    const svg = testMode === 'alone' ? testAlone(t) : testMode === 'panel' ? withTests(compose(t), t) : compose(t)
    if (svg.length <= SVG_LIMIT) lastScene = svg
    return <Svg source={lastScene || svg} alt="Session Village, un village en pixel art qui vit au rythme de la session" />
  })

  on('command.run', { command: 'village-test' }, async ($, e) => {
    const was = rhythm(now())
    testMode = /seul|alone/i.test(e.args) ? 'alone' : testMode === 'off' ? 'panel' : 'off'
    draw($, true)
    const text = { off: "Tests d'animation masqués.", panel: "Tests d'animation affichés sur le décor.", alone: "Tests d'animation affichés seuls, sans le décor." }
    return { text: text[testMode] + was }
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
