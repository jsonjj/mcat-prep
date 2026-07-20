/**
 * Nominal ("branded") types. A `Brand<string, 'LearnerId'>` is assignable to
 * `string` but a plain `string` is not assignable to it, preventing id mix-ups.
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };
