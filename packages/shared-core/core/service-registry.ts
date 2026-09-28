/**
 * The service registry.
 *
 * Services need to reach their siblings — `TerritoryService` needs
 * `ContractService`, `CrossChainService` needs `Web3Service` — and they used
 * to do it by reading `window.RunRealm.services`, the same global the debug
 * console handle uses. That is one registry wearing two hats, and it only
 * exists in a browser: `getSiblingService` returned `null` under SSR and in
 * the mobile app, which is why several call sites carry a `?? somethingElse`
 * fallback they should never have needed.
 *
 * This module is the same registry, in a place that does not care what it is
 * running on. `registerGlobalServices` still publishes the window handle for
 * the console — that part is genuinely useful — but nothing in the service
 * layer reads it, so a page script cannot reach in and swap a service out
 * from under a running app, and a headless boot gets the same wiring a
 * browser does.
 *
 * It is still a registry, and still global state. That is a real cost and
 * this is not the fix for it: the fix is injecting each service's
 * dependencies through its constructor, which is a much larger change and
 * should be done one service at a time. What this buys is a single, typed,
 * platform-independent place for the remaining lookups to live, so that work
 * has somewhere to land instead of a `window` cast.
 */

/** The slice of the service graph, keyed by the names lookups use. */
export type ServiceRegistry = Record<string, unknown>;

let registry: ServiceRegistry | null = null;

/**
 * Publish the registry. Called once by `createServices()`, so the graph is
 * available as soon as it exists rather than when something assigns a global.
 */
export function registerServiceRegistry(services: ServiceRegistry): void {
  registry = services;
}

/** The whole registry, or `null` before composition has run. */
export function getServiceRegistry(): ServiceRegistry | null {
  return registry;
}

/**
 * One service by name, or `null`.
 *
 * Accepts a name in any case and matches it case-insensitively, because the
 * registry is keyed in two conventions: `camelCase` for most entries and
 * `PascalCase` for `ConfidentialContractService`, whose consumers look it up
 * by class name. Normalising here means no caller has to know which.
 */
export function getRegisteredService(name: string): unknown {
  if (!registry) return null;
  if (name in registry) return registry[name];

  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(registry)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return null;
}

/**
 * Drop the registry. Test-only: services resolve siblings at call time, not
 * at construction, so a test that composes services in one case must not
 * leave them wired to the previous case's graph.
 */
export function clearServiceRegistry(): void {
  registry = null;
}
