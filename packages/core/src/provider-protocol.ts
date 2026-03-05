/**
 * WarpFS Provider Protocol
 *
 * Defines the HTTP API contract between the WarpFS core (router) and
 * individual file provider services. Each provider runs as a standalone
 * HTTP service and implements these endpoints.
 *
 * Endpoints:
 *   GET  /stat?path=<path>                → ProviderNodeInfo
 *   GET  /list?path=<path>                → ProviderNodeInfo[]
 *   GET  /read?path=<path>                → Binary content
 *   PUT  /write?path=<path>               → Write file (body = content)
 *   POST /create?path=<path>&type=file|folder → Create node
 *   DELETE /delete?path=<path>            → Delete node
 */

/** Information about a single virtual node returned by providers. */
export interface ProviderNodeInfo {
  name: string;
  isFolder: boolean;
  size: number;
  lastModified: number;
}

/** Mount configuration: maps first-level directory name to a provider origin. */
export interface MountConfig {
  /** Display name for the mount (used as the first-level directory name). */
  name: string;
  /** HTTP origin of the provider service (e.g. "http://localhost:3001"). */
  origin: string;
}

/** Top-level WarpFS configuration. */
export interface WarpFSConfig {
  /** List of provider mounts. */
  mounts: MountConfig[];
}
