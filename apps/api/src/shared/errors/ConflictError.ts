import { AppError } from './AppError';

export class ConflictError extends AppError {
  constructor(message = 'Conflict', code?: string, meta?: Record<string, unknown>) {
    super(message, 409, code, meta);
  }
}
