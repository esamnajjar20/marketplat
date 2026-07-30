export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  // Stable, machine-readable identifier for this error (e.g.
  // 'INVALID_CREDENTIALS'). Optional so existing call sites that only
  // pass a message keep compiling; the error middleware falls back to a
  // generic code derived from statusCode when this is undefined. The
  // frontend should key its translation/display logic off this `code`,
  // not off the English `message` text.
  public readonly code?: string;
  // Optional structured data for errors whose Arabic translation needs
  // to interpolate a value (e.g. a limit) rather than just look up a
  // static string by code. Keeps such values out of the English message
  // text so the frontend never has to parse them back out of a sentence.
  public readonly meta?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number,
    code?: string,
    meta?: Record<string, unknown>,
    isOperational = true,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.meta = meta;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this);
  }
}
