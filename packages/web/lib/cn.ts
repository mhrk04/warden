/** Tiny classnames joiner — filters falsy values so conditional classes stay
 * readable without pulling in a dependency. */
export type ClassValue = string | number | false | null | undefined;

export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}
