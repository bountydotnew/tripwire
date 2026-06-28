/**
 * @tripwire/logger
 *
 * Framework-agnostic logging utilities for the Tripwire platform.
 * Provides standardized console logging with environment-aware configuration.
 */
import chalk from "chalk"
import { getRequestContext } from "./request-context"

// Locally typed access to `process.env` so this package compiles for
// browser/edge consumers that don't include `@types/node` globally.
// Browser bundlers replace `process.env.NODE_ENV` statically; the
// runtime check `typeof process !== "undefined"` guards against errors
// where bundlers leave the reference alone.
type ProcessLike = { env: Record<string, string | undefined> }
declare const process: ProcessLike

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

export interface LoggerConfig {
  /** Minimum log level to display */
  logLevel?: LogLevel | string
  /** Whether to colorize output */
  colorize?: boolean
  /** Whether logging is enabled */
  enabled?: boolean
}

/**
 * Metadata key-value pairs attached to a logger instance.
 * Included automatically in every log line produced by that logger.
 */
export type LoggerMetadata = Record<
  string,
  string | number | boolean | undefined
>

const getNodeEnv = (): string => {
  if (typeof process !== "undefined" && process.env) {
    return process.env.NODE_ENV || "development"
  }
  return "development"
}

const getLogLevel = (): string | undefined => {
  if (typeof process !== "undefined" && process.env) {
    return process.env.LOG_LEVEL
  }
  return undefined
}

const getMinLogLevel = (): LogLevel => {
  const logLevelEnv = getLogLevel()
  if (
    logLevelEnv &&
    Object.values(LogLevel).includes(logLevelEnv as LogLevel)
  ) {
    return logLevelEnv as LogLevel
  }

  const nodeEnv = getNodeEnv()
  switch (nodeEnv) {
    case "development":
      return LogLevel.DEBUG
    case "production":
      return LogLevel.ERROR
    case "test":
      return LogLevel.ERROR
    default:
      return LogLevel.DEBUG
  }
}

const getLogConfig = () => {
  const nodeEnv = getNodeEnv()
  const minLevel = getMinLogLevel()

  switch (nodeEnv) {
    case "development":
      return {
        enabled: true,
        minLevel,
        colorize: true,
      }
    case "production":
      return {
        enabled: true,
        minLevel,
        colorize: false,
      }
    case "test":
      return {
        enabled: false,
        minLevel,
        colorize: false,
      }
    default:
      return {
        enabled: true,
        minLevel,
        colorize: true,
      }
  }
}

const formatObject = (obj: unknown, isDev: boolean): string => {
  try {
    if (obj instanceof Error) {
      const errorObj: Record<string, unknown> = {
        message: obj.message,
        stack: isDev ? obj.stack : undefined,
        name: obj.name,
      }
      for (const key of Object.keys(obj)) {
        if (!(key in errorObj)) {
          errorObj[key] = (obj as unknown as Record<string, unknown>)[key]
        }
      }
      return JSON.stringify(errorObj, null, isDev ? 2 : 0)
    }
    return JSON.stringify(obj, null, isDev ? 2 : 0)
  } catch {
    return "[Circular or Non-Serializable Object]"
  }
}

/**
 * JSON.stringify with a circular-reference guard so a cyclic payload (e.g. a
 * Node request/response object passed as metadata) logs as "[Circular]"
 * instead of throwing a TypeError and crashing the process.
 */
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>()
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === "object" && val !== null) {
      if (seen.has(val)) return "[Circular]"
      seen.add(val)
    }
    return val
  })
}

/**
 * Logger class for standardized console logging.
 *
 * Provides methods for logging at different severity levels
 * and handles formatting, colorization, and environment-specific behavior.
 */
export class Logger {
  private module: string
  private config: ReturnType<typeof getLogConfig>
  private isDev: boolean
  private metadata: LoggerMetadata = {}

  constructor(module: string, overrideConfig?: LoggerConfig) {
    this.module = module
    this.config = getLogConfig()
    this.isDev = getNodeEnv() === "development"

    if (overrideConfig) {
      if (overrideConfig.logLevel !== undefined) {
        const level =
          typeof overrideConfig.logLevel === "string"
            ? (overrideConfig.logLevel as LogLevel)
            : overrideConfig.logLevel
        if (Object.values(LogLevel).includes(level)) {
          this.config.minLevel = level
        }
      }
      if (overrideConfig.colorize !== undefined) {
        this.config.colorize = overrideConfig.colorize
      }
      if (overrideConfig.enabled !== undefined) {
        this.config.enabled = overrideConfig.enabled
      }
    }
  }

  /**
   * Creates a child logger with additional metadata merged in.
   * The child inherits this logger's module name, config, and existing metadata.
   * New metadata keys override existing ones with the same name.
   */
  withMetadata(metadata: LoggerMetadata): Logger {
    const child = Object.create(Logger.prototype) as Logger
    child.module = this.module
    child.config = this.config
    child.isDev = this.isDev
    child.metadata = { ...this.metadata, ...metadata }
    return child
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled) return false

    if (getNodeEnv() === "production" && typeof window !== "undefined") {
      return false
    }

    const levels = [
      LogLevel.DEBUG,
      LogLevel.INFO,
      LogLevel.WARN,
      LogLevel.ERROR,
    ]
    const minLevelIndex = levels.indexOf(this.config.minLevel)
    const currentLevelIndex = levels.indexOf(level)

    return currentLevelIndex >= minLevelIndex
  }

  private formatArgs(args: unknown[]): unknown[] {
    return args.map((arg) => {
      if (arg === null || arg === undefined) return arg
      if (typeof arg === "object") return formatObject(arg, this.isDev)
      return arg
    })
  }

  private log(level: LogLevel, message: string, ...args: unknown[]) {
    if (!this.shouldLog(level)) return

    const timestamp = new Date().toISOString()
    const formattedArgs = this.formatArgs(args)

    const reqCtx = getRequestContext()
    const effectiveMetadata = reqCtx
      ? {
          requestId: reqCtx.requestId,
          method: reqCtx.method,
          path: reqCtx.path,
          ...this.metadata,
        }
      : this.metadata
    const metadataEntries = Object.entries(effectiveMetadata).filter(
      ([_, v]) => v !== undefined
    )
    const metadataStr =
      metadataEntries.length > 0
        ? ` {${metadataEntries.map(([k, v]) => `${k}=${v}`).join(" ")}}`
        : ""

    if (this.config.colorize) {
      let levelColor: (text: string) => string
      const moduleColor = chalk.cyan
      const timestampColor = chalk.gray

      switch (level) {
        case LogLevel.DEBUG:
          levelColor = chalk.blue
          break
        case LogLevel.INFO:
          levelColor = chalk.green
          break
        case LogLevel.WARN:
          levelColor = chalk.yellow
          break
        case LogLevel.ERROR:
          levelColor = chalk.red
          break
      }

      const coloredMeta = metadataStr
        ? ` ${chalk.magenta(metadataStr.trim())}`
        : ""
      const coloredPrefix = `${timestampColor(`[${timestamp}]`)} ${levelColor(`[${level}]`)} ${moduleColor(`[${this.module}]`)}${coloredMeta}`

      if (level === LogLevel.ERROR) {
        console.error(coloredPrefix, message, ...formattedArgs)
      } else {
        console.log(coloredPrefix, message, ...formattedArgs)
      }
    } else {
      // Structured JSON for production — CloudWatch / Axiom auto-parse JSON lines.
      const entry: Record<string, unknown> = {
        timestamp,
        level,
        module: this.module,
        message,
      }
      for (const [k, v] of metadataEntries) {
        entry[k] = v
      }
      for (const arg of args) {
        if (
          arg !== null &&
          arg !== undefined &&
          typeof arg === "object" &&
          !(arg instanceof Error)
        ) {
          Object.assign(entry, arg)
        } else if (arg instanceof Error) {
          entry.error = arg.message
          entry.stack = arg.stack
        } else if (arg !== null && arg !== undefined) {
          entry.extra = arg
        }
      }

      const line = safeStringify(entry)
      if (level === LogLevel.ERROR) {
        console.error(line)
      } else {
        console.log(line)
      }
    }
  }

  debug(message: string, ...args: unknown[]) {
    this.log(LogLevel.DEBUG, message, ...args)
  }

  info(message: string, ...args: unknown[]) {
    this.log(LogLevel.INFO, message, ...args)
  }

  warn(message: string, ...args: unknown[]) {
    this.log(LogLevel.WARN, message, ...args)
  }

  error(message: string, ...args: unknown[]) {
    this.log(LogLevel.ERROR, message, ...args)
  }
}

/**
 * Create a logger for a specific module.
 *
 * @example
 * ```typescript
 * import { createLogger } from "@tripwire/logger"
 *
 * const logger = createLogger("MyComponent")
 *
 * logger.debug("Initializing component", { props })
 * logger.info("Component mounted")
 * logger.warn("Deprecated prop used", { propName })
 * logger.error("Failed to fetch data", error)
 * ```
 */
export function createLogger(module: string, config?: LoggerConfig): Logger {
  return new Logger(module, config)
}

export type { RequestContext } from "./request-context"
export { getRequestContext, runWithRequestContext } from "./request-context"
