import util from 'node:util';

const isProduction = process.env.NODE_ENV === 'production';

const sanitizeWhitespace = (value: string): string => {
  if (!isProduction) {
    return value;
  }

  return value.replace(/\s*\n\s*/g, ' | ');
};

const formatArgument = (arg: unknown): string => {
  if (typeof arg === 'string') {
    return sanitizeWhitespace(arg);
  }

  if (arg instanceof Error) {
    const representation = arg.stack ?? `${arg.name}: ${arg.message}`;
    return sanitizeWhitespace(representation);
  }

  if (typeof arg === 'object' && arg !== null) {
    const representation = util.inspect(arg, { depth: null, breakLength: Infinity });
    return sanitizeWhitespace(representation);
  }

  return sanitizeWhitespace(String(arg));
};

const format = (args: unknown[]): string => args.map(formatArgument).join(' ');

export const logger = {
  info: (...args: unknown[]): void => {
    console.info(format(args));
  },
  error: (...args: unknown[]): void => {
    console.error(format(args));
  },
  warn: (...args: unknown[]): void => {
    console.warn(format(args));
  },
  debug: (...args: unknown[]): void => {
    console.debug(format(args));
  },
  log: (...args: unknown[]): void => {
    console.log(format(args));
  },
} as const;

export type Logger = typeof logger;
