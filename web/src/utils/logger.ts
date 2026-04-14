type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

function isDebugEnabled(): boolean {
  try {
    return localStorage.getItem('C2_DEBUG') === 'true'
  } catch {
    return false
  }
}

const CONSOLE_MAP: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
}

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void
  info(msg: string, data?: Record<string, unknown>): void
  warn(msg: string, data?: Record<string, unknown>): void
  error(msg: string, data?: Record<string, unknown>): void
}

export function createLogger(tag: string): Logger {
  const emit = (level: LogLevel, msg: string, data?: Record<string, unknown>) => {
    const minLevel: LogLevel = isDebugEnabled() ? 'debug' : 'warn'
    if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return

    const ts = new Date().toISOString()
    const prefix = `${ts} [${level.toUpperCase()}] [${tag}]`

    if (data && Object.keys(data).length > 0) {
      CONSOLE_MAP[level](`${prefix} ${msg}`, data)
    } else {
      CONSOLE_MAP[level](`${prefix} ${msg}`)
    }
  }

  return {
    debug: (msg, data?) => emit('debug', msg, data),
    info: (msg, data?) => emit('info', msg, data),
    warn: (msg, data?) => emit('warn', msg, data),
    error: (msg, data?) => emit('error', msg, data),
  }
}
