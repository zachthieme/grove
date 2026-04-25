/**
 * Exhaustiveness check for discriminated unions. Call from the default branch
 * of a `switch` to make TypeScript fail compilation when a new variant is
 * added but the switch isn't extended to handle it.
 *
 * The runtime throw also surfaces unknown variants in tests if a non-typed
 * value sneaks through.
 */
export function assertNever(x: never, context?: string): never {
  throw new Error(
    context
      ? `${context}: unexpected variant ${JSON.stringify(x)}`
      : `unexpected variant ${JSON.stringify(x)}`,
  )
}
