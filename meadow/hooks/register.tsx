import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { grassSvg, skySvg } from './scenery'

// The text of the main loop's last answer: the one block of a reply that ends it
const finalState = atom({ plugin: 'meadow', key: 'final' } as const, '')

// Markdown draws at most 10000 characters; a longer block keeps the app's own look
const LIMIT = 10_000

export const register: Register = on => {
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) {
      await update($, finalState, () => e.answer.trim())
    }

    return result
  })

  // Every block of a reply is padded like a bubble; the first gets the sky and hill on top, the last the grass below
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const ui = $.ui.resolve(e)
    if (!('Svg' in ui) || e.props.text.length > LIMIT) {
      return next(e)
    }
    const { Box, Markdown, Svg } = ui
    const text = e.props.text.trim()
    const isLast = text !== '' && text === (await read($, finalState))

    return (
      <Box key="meadow" flexDirection="column" marginRight={6} marginBottom={1}>
        {e.props.isFirstOfReply && <Svg key="sky" source={skySvg()} alt="A pixel meadow: blue sky, clouds and a green hill" />}
        <Box key="page" flexDirection="column" paddingX={2} paddingY={1}>
          <Markdown key="text" text={e.props.text} />
        </Box>
        {isLast && <Svg key="grass" source={grassSvg()} alt="A strip of pixel grass under the message" />}
      </Box>
    )
  })
}
