import { VirtualFile, VirtualFolder, VirtualNode } from "./virtual-node.js";

/**
 * In-memory file: stores content as a Buffer.
 * Useful for testing, OS file interception, and static virtual files.
 */
export class MemoryFile extends VirtualFile {
  private content: Buffer;

  constructor(name: string, content: string | Buffer = "") {
    super(name);
    this.content = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
  }

  getSize(): number {
    return this.content.length;
  }

  async read(): Promise<Buffer> {
    return this.content;
  }

  async write(content: Buffer): Promise<void> {
    this.content = content;
    this.lastModified = Date.now();
  }
}

/**
 * In-memory folder: stores children in an array.
 * Supports full CRUD operations on children.
 */
export class MemoryFolder extends VirtualFolder {
  private children: VirtualNode[] = [];

  constructor(name: string) {
    super(name);
  }

  async listChildren(): Promise<VirtualNode[]> {
    return [...this.children];
  }

  addChild(node: VirtualNode): void {
    this.children.push(node);
  }

  async createChildFile(name: string): Promise<VirtualFile> {
    const file = new MemoryFile(name);
    this.children.push(file);
    return file;
  }

  async createChildFolder(name: string): Promise<VirtualFolder> {
    const folder = new MemoryFolder(name);
    this.children.push(folder);
    return folder;
  }

  async removeChild(name: string): Promise<boolean> {
    const idx = this.children.findIndex((c) => c.name === name);
    if (idx === -1) return false;
    this.children.splice(idx, 1);
    return true;
  }
}
