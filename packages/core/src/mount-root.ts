import { VirtualFile, VirtualFolder, VirtualNode } from "./virtual-node.js";
import { ProviderClient } from "./provider-client.js";
import { RemoteProviderFolder } from "./provider-nodes.js";
import type { MountConfig } from "./provider-protocol.js";

/**
 * A root folder that mounts remote providers as first-level directories.
 * Each mount maps a directory name to a provider service origin.
 *
 * Example: if mounts = [{ name: "notion", origin: "http://localhost:3001" }],
 * then accessing /notion/... will proxy to the Notion provider at that origin.
 */
export class MountRootFolder extends VirtualFolder {
  private mounts: Map<string, RemoteProviderFolder> = new Map();

  constructor(mountConfigs: MountConfig[]) {
    super("WarpFS");
    for (const cfg of mountConfigs) {
      const client = new ProviderClient(cfg.origin);
      const folder = new RemoteProviderFolder(cfg.name, client, "/");
      this.mounts.set(cfg.name, folder);
    }
  }

  async listChildren(): Promise<VirtualNode[]> {
    return Array.from(this.mounts.values());
  }

  async findChild(name: string): Promise<VirtualNode | undefined> {
    return this.mounts.get(name);
  }

  async createChildFile(_name: string): Promise<VirtualFile> {
    throw new Error("Cannot create files at mount root level");
  }

  async createChildFolder(_name: string): Promise<VirtualFolder> {
    throw new Error("Cannot create folders at mount root level");
  }

  async removeChild(_name: string): Promise<boolean> {
    throw new Error("Cannot remove mounts at runtime");
  }
}
