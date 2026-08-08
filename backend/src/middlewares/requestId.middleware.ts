import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

// RFC 4122 UUID v4 pattern
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const clientId = req.headers["x-request-id"] as string | undefined;

  // M-05: only accept client-supplied ID if it is a valid UUID v4
  // Reject anything else to prevent log injection, newline injection, or log inflation
  const requestId =
    clientId && UUID_REGEX.test(clientId) ? clientId : crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
};
