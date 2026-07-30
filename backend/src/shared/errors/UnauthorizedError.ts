import { AppError } from './AppError';
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', code?: string, meta?: Record<string, unknown>) {
    super(message, 401, code, meta);
  }
}
