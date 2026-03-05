import { VirtualFile, VirtualFolder, VirtualNode } from "./virtual-node.js";
import { ProviderClient } from "./provider-client.js";
import type { ProviderNodeInfo } from "./provider-protocol.js";

/**
 * A virtual folder backed by a remote provider service.
 * Delegates all operations to the provider via HTTP.
 */
export class RemoteProviderFolder extends VirtualFolder {
  private client: ProviderClient;
  private remotePath: string;

  constructor(name: string, client: ProviderClient, remotePath: string = "/") {
    super(name);
    this.client = client;
    this.remotePath = remotePath;
  }

  async listChildren(): Promise<VirtualNode[]> {
    const items = await this.client.list(this.remotePath);
    return items.map((info) => this.toNode(info));
  }

  async findChild(name: string): Promise<VirtualNode | undefined> {
    const childPath = this.childPath(name);
    const info = await this.client.stat(childPath);
    if (!info) return undefined;
    return this.toNode(info);
  }

  async createChildFile(name: string): Promise<VirtualFile> {
    const childPath = this.childPath(name);
    await this.client.create(childPath, "file");
    return new RemoteProviderFile(name, this.client, childPath);
  }

  async createChildFolder(name: string): Promise<VirtualFolder> {
    const childPath = this.childPath(name);
    await this.client.create(childPath, "folder");
    return new RemoteProviderFolder(name, this.client, childPath);
  }

  async removeChild(name: string): Promise<boolean> {
    const childPath = this.childPath(name);
    return this.client.remove(childPath);
  }

  private childPath(name: string): string {
    const base = this.remotePath.endsWith("/") ? this.remotePath : this.remotePath + "/";
    return base + name;
  }

  private toNode(info: ProviderNodeInfo): VirtualNode {
    const childPath = this.childPath(info.name);
    if (info.isFolder) {
      const folder = new RemoteProviderFolder(info.name, this.client, childPath);
      folder.lastModified = info.lastModified;
      return folder;
    }
    const file = new RemoteProviderFile(info.name, this.client, childPath);
    file.lastModified = info.lastModified;
    file._size = info.size;
    return file;
  }
}

/**
 * A virtual file backed by a remote provider service.
 * Delegates read/write operations to the provider via HTTP.
 */
export class RemoteProviderFile extends VirtualFile {
  private client: ProviderClient;
  private remotePath: string;
  /** @internal */ _size: number = 0;

  constructor(name: string, client: ProviderClient, remotePath: string) {
    super(name);
    this.client = client;
    this.remotePath = remotePath;
  }

  getSize(): number {
    return this._size;
  }

  async read(): Promise<Buffer> {
    const buf = await this.client.read(this.remotePath);
    this._size = buf.length;
    return buf;
  }

  async write(content: Buffer): Promise<void> {
    await this.client.write(this.remotePath, content);
    this._size = content.length;
    this.lastModified = Date.now();
  }
}
