import { createServer, Server } from "node:http";
import { VirtualFolder } from "./virtual-node.js";
import { WebDAVHandler } from "./webdav-handler.js";
import { MountRootFolder } from "./mount-root.js";
import type { MountConfig } from "./provider-protocol.js";

export interface WarpFSServerOptions {
  port?: number;
  host?: string;
  /** Provide a VirtualFolder directly as the root. */
  rootFolder?: VirtualFolder;
  /** Alternatively, provide mount configs to route first-level dirs to providers. */
  mounts?: MountConfig[];
  blockOsFiles?: boolean;
}

export class WarpFSServer {
  private server: Server;
  private handler: WebDAVHandler;
  readonly port: number;
  readonly host: string;

  constructor(options: WarpFSServerOptions) {
    this.port = options.port ?? 8080;
    this.host = options.host ?? "127.0.0.1";

    let rootFolder: VirtualFolder;
    if (options.mounts && options.mounts.length > 0) {
      rootFolder = new MountRootFolder(options.mounts);
    } else if (options.rootFolder) {
      rootFolder = options.rootFolder;
    } else {
      throw new Error("WarpFSServer requires either rootFolder or mounts");
    }

    this.handler = new WebDAVHandler(rootFolder, options.blockOsFiles ?? true);

    this.server = createServer((req, res) => {
      this.handler.handle(req, res);
    });
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.on("error", reject);
      this.server.listen(this.port, this.host, () => {
        console.log(`[WarpFS] WebDAV server listening on http://${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  get address(): string {
    return `http://${this.host}:${this.port}`;
  }
}
