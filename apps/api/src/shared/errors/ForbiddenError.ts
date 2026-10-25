import { AppError } from './AppError';
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', code?: string, meta?: Record<string, unknown>) {
    super(message, 403, code, meta);
  }
}
