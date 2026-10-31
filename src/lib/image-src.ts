/**
 * Source documents (e.g. LLM Wiki pages) embed images relative to their own
 * location, such as `../media/a.png`. In chat those resolve against the app's
 * origin and hit the agent server unauthenticated, so they are never fetched.
 */
export function isPageRelativeImage(src: string): boolean {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(src.trim());
}
