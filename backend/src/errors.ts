export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_JSON'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'ALREADY_IN_QUEUE'
  | 'ALREADY_CLAIMED'
  | 'QUEUE_FULL'
  | 'INTERNAL_ERROR';

/** An error that is safe to show to the client: it has a status, a stable code and a message. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static notFound(message = 'Resource not found') {
    return new AppError(404, 'NOT_FOUND', message);
  }
}
