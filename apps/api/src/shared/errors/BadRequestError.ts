import { AppError } from './AppError';
export class BadRequestError extends AppError {
  constructor(message = 'Bad request', code?: string, meta?: Record<string, unknown>) {
    super(message, 400, code, meta);
  }
}
