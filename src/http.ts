import type { NextFunction, Request, Response } from "express";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = "REQUEST_FAILED",
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function pathParam(request: Request, key: string): string {
  const value = request.params[key];
  if (typeof value !== "string") throw new HttpError(400, `Invalid ${key}`, "INVALID_PATH_PARAMETER");
  return value;
}

export function asyncHandler(
  handler: (request: Request, response: Response) => Promise<unknown>,
) {
  return (request: Request, response: Response, next: NextFunction) => {
    Promise.resolve(handler(request, response)).catch(next);
  };
}

export function notFound(_request: Request, _response: Response, next: NextFunction) {
  next(new HttpError(404, "Route not found", "NOT_FOUND"));
}

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
) {
  if (error instanceof HttpError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
    response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Request validation failed" } });
    return;
  }
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    response.status(409).json({ error: { code: "CONFLICT", message: "A record with these details already exists" } });
    return;
  }
  if (error && typeof error === "object" && "status" in error && typeof error.status === "number" && error.status >= 400 && error.status < 500) {
    const status = error.status;
    const message = "message" in error && typeof error.message === "string" ? error.message : "Invalid request";
    response.status(status).json({ error: { code: status === 413 ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST", message } });
    return;
  }
  console.error(error);
  response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
}
