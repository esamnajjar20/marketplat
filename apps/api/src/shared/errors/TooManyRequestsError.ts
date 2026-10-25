import { AppError } from './AppError';
export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests', code?: string, meta?: Record<string, unknown>) {
    super(message, 429, code, meta);
  }
}
