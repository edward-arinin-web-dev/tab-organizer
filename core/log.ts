// Dev-only info logging. Defensive console.warn/error in catch blocks stay
// as-is — this is only for chatty progress logs that shouldn't ship.
// WXT: COMMAND is 'serve' during `wxt dev`, 'build' for production output.
export const debug: typeof console.log =
  import.meta.env.COMMAND === 'serve'
    ? console.log.bind(console, '[tab-organizer]')
    : () => {};
