/**
 * Uniform Server Action return type.
 *
 * Expected failures (validation, business rules, permission) come back as
 * `ok: false` so the form can render them. Only genuinely unexpected errors
 * throw, where they are caught by error.tsx.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(
  error: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<T> {
  return { ok: false, error, fieldErrors };
}
