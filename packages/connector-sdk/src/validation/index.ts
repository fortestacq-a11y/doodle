import { z } from "zod";
import type { ActionDefinition } from "../types/index.js";

export class ValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export function validateInput<T>(
  action: ActionDefinition<T>,
  input: unknown
): T {
  const result = action.inputSchema.safeParse(input);
  if (!result.success) {
    const first = result.error.errors[0];
    throw new ValidationError(first.path.join("."), first.message);
  }
  return result.data;
}
