export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  meta?: Record<string, unknown>;
}

export const successResponse = <T>(
  message: string,
  data?: T,
  meta?: Record<string, unknown>
): ApiResponse<T> => ({ success: true, message, data, meta });

export const errorResponse = (message: string): ApiResponse => ({
  success: false,
  message,
});
