import { v4 as uuidv4 } from "uuid";

/**
 * Base class for all virtual filesystem nodes.
 * Each node has a unique ID, a name, and a last-modified timestamp.
 */
export abstract class VirtualNode {
  readonly id: string;
  name: string;
  lastModified: number;

  constructor(name: string) {
    this.id = uuidv4();
    this.name = name;
    this.lastModified = Date.now();
  }

  abstract isFolder(): boolean;
  abstract getSize(): number;
}

/**
 * Abstract virtual folder. Implementations must define how to list children
 * and optionally support creating/removing children.
 */
export abstract class VirtualFolder extends VirtualNode {
  isFolder(): boolean {
    return true;
  }

  getSize(): number {
    return 0;
  }

  abstract listChildren(): Promise<VirtualNode[]>;

  async createChildFile(_name: string): Promise<VirtualFile> {
    throw new Error("createChildFile not implemented");
  }

  async createChildFolder(_name: string): Promise<VirtualFolder> {
    throw new Error("createChildFolder not implemented");
  }

  async removeChild(_name: string): Promise<boolean> {
    throw new Error("removeChild not implemented");
  }

  /** Resolve a child by name from the children list. */
  async findChild(name: string): Promise<VirtualNode | undefined> {
    const children = await this.listChildren();
    return children.find((c) => c.name === name);
  }
}

/**
 * Abstract virtual file. Implementations must define read/write behavior.
 */
export abstract class VirtualFile extends VirtualNode {
  isFolder(): boolean {
    return false;
  }

  abstract read(): Promise<Buffer>;
  abstract write(content: Buffer): Promise<void>;
}
