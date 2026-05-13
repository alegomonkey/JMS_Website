import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "validation failed", details: err.flatten() });
    return;
  }
  const status = isHttpError(err) ? err.status : 500;
  const message = isHttpError(err) ? err.message : "internal server error";
  if (status >= 500) {
    console.error(err);
  }
  res.status(status).json({ error: message });
}

interface HttpError {
  status: number;
  message: string;
}

function isHttpError(e: unknown): e is HttpError {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as { status?: unknown }).status === "number" &&
    typeof (e as { message?: unknown }).message === "string"
  );
}

export function httpError(status: number, message: string): HttpError & Error {
  const err = new Error(message) as HttpError & Error;
  err.status = status;
  return err;
}
