import { ZodError } from "zod";
import { NotFoundError } from "../drafts/service";

/** Maps thrown errors to clear JSON responses for the UI. */
export function errorResponse(err: unknown): Response {
  if (err instanceof NotFoundError) return Response.json({ error: err.message }, { status: 404 });
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    return Response.json({ error: `Invalid ${issue?.path.join(".") || "input"}: ${issue?.message}` }, { status: 400 });
  }
  return Response.json({ error: (err as Error)?.message ?? String(err) }, { status: 500 });
}
