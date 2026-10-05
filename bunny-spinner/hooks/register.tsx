import type { Register } from 'claude-code'

// What the bunny says while a tool runs, after what the app says it's doing
const MUNCHING = ' · nom nom…'

export const register: Register = (on, options) => {
  const chosen = options as { name?: string } | undefined
  const name = chosen?.name?.trim() || 'Michel'

  // The loading line speaks as the bunny; the app keeps its own timer and token count beside it
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const doing = e.props.message ?? e.props.word
    const face = e.props.mode === 'thinking' ? '🤔' : '🐰'

    return next({
      ...e,
      props: {
        ...e.props,
        message: `${face} ${name}: ${doing.charAt(0).toLowerCase()}${doing.slice(1)}`,
        suffix: e.props.mode === 'tool-use' ? MUNCHING : e.props.suffix,
      },
    })
  })
}
