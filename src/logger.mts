import util from 'node:util';

const isProduction = process.env.NODE_ENV === 'production';

type Level = 'debug' | 'info' | 'warn' | 'error';

const sanitizeWhitespace = (value: string): string => value.replace(/\s*\n\s*/g, ' | ');

const formatArgumentPretty = (arg: unknown): string => {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.stack ?? `${arg.name}: ${arg.message}`;
  if (typeof arg === 'object' && arg !== null) {
    return util.inspect(arg, { depth: null, breakLength: Infinity });
  }
  return String(arg);
};

const serializeError = (error: Error): Record<string, unknown> => {
  const cause = (error as { cause?: unknown }).cause;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(cause === undefined ? {} : { cause: cause instanceof Error ? serializeError(cause) : cause }),
  };
};

const buildStructuredEntry = (level: Level, args: unknown[]): Record<string, unknown> => {
  const messageParts: string[] = [];
  const attributes: Record<string, unknown> = {};
  const errors: Error[] = [];

  for (const arg of args) {
    if (typeof arg === 'string') {
      messageParts.push(arg);
    } else if (arg instanceof Error) {
      errors.push(arg);
    } else if (typeof arg === 'object' && arg !== null) {
      Object.assign(attributes, arg as Record<string, unknown>);
    } else {
      messageParts.push(String(arg));
    }
  }

  const trailingColon = /:\s*$/;
  const message = messageParts.length > 0
    ? sanitizeWhitespace(messageParts.join(' ').replace(trailingColon, ''))
    : errors[0]?.message ?? '';

  const entry: Record<string, unknown> = { level, message, ...attributes };
  if (errors.length === 1) entry.error = serializeError(errors[0]);
  else if (errors.length > 1) entry.errors = errors.map(serializeError);
  return entry;
};

const emit = (level: Level, args: unknown[]): string => {
  if (isProduction) {
    return JSON.stringify(buildStructuredEntry(level, args));
  }
  return args.map(formatArgumentPretty).join(' ');
};

export const logger = {
  info: (...args: unknown[]): void => {
    console.info(emit('info', args));
  },
  error: (...args: unknown[]): void => {
    console.error(emit('error', args));
  },
  warn: (...args: unknown[]): void => {
    console.warn(emit('warn', args));
  },
  debug: (...args: unknown[]): void => {
    console.debug(emit('debug', args));
  },
  log: (...args: unknown[]): void => {
    console.log(emit('info', args));
  },
} as const;

export type Logger = typeof logger;
