# WarpFS — Agent Instructions

## SOP: Integrating an External Platform into WarpFS Virtual File System

This SOP describes how to create a new driver that maps an external platform's content (e.g. Notion, GitHub Issues, a CMS) into the WarpFS virtual file system.

### Step 1: Create a New Package

```bash
mkdir -p packages/<platform>/src
```

Create `packages/<platform>/package.json` with dependencies on `@warpfs/core` and `@warpfs/utils`:

```json
{
  "name": "@warpfs/<platform>",
  "dependencies": {
    "@warpfs/core": "workspace:*",
    "@warpfs/utils": "workspace:*"
  }
}
```

### Step 2: Implement the API Client

Create `src/<platform>-api.ts` — a thin wrapper over the platform's SDK or REST API:

- Encapsulate all HTTP/SDK calls here so they can be mocked in tests
- Expose typed methods like `listItems()`, `getItemContent(id)`, `updateItem(id, data)`

### Step 3: Implement VirtualFolder (the "directory")

Extend `VirtualFolder` from `@warpfs/core`:

```typescript
import { VirtualFolder, VirtualNode } from "@warpfs/core";
import { createCachedFn } from "@warpfs/utils";

export class MyPlatformFolder extends VirtualFolder {
  private cachedList: () => Promise<VirtualNode[]>;

  constructor(name: string, private api: MyAPI, private folderId: string) {
    super(name);
    // Cache child listing for 10s to protect API rate limits
    this.cachedList = createCachedFn(() => this.fetchChildren(), { ttl: 10000 });
  }

  async listChildren(): Promise<VirtualNode[]> {
    return this.cachedList();
  }

  private async fetchChildren(): Promise<VirtualNode[]> {
    const items = await this.api.listItems(this.folderId);
    return items.map(item => new MyPlatformFile(`${item.title}.md`, item.id, this.api));
  }
}
```

### Step 4: Implement VirtualFile (the "document")

Extend `VirtualFile` from `@warpfs/core`:

```typescript
import { VirtualFile } from "@warpfs/core";
import { createCachedFn, createDebouncedWrite, markdownDiff } from "@warpfs/utils";

export class MyPlatformFile extends VirtualFile {
  private cachedRead: () => Promise<Buffer>;
  private debounceHandle: DebounceHandle<Buffer>;
  private currentContent = "";

  constructor(name: string, private itemId: string, private api: MyAPI) {
    super(name);
    this.cachedRead = createCachedFn(() => this.fetchContent(), { ttl: 5000 });
    this.debounceHandle = createDebouncedWrite(buf => this.doWrite(buf), 2000);
  }

  async read(): Promise<Buffer> { return this.cachedRead(); }
  async write(content: Buffer): Promise<void> { return this.debounceHandle.push(content); }

  private async fetchContent(): Promise<Buffer> {
    const content = await this.api.getItemContent(this.itemId);
    this.currentContent = content;
    return Buffer.from(content);
  }

  private async doWrite(buf: Buffer): Promise<void> {
    const newContent = buf.toString("utf-8");
    const ops = markdownDiff(this.currentContent, newContent);
    if (ops.length > 0) {
      await this.api.updateItem(this.itemId, newContent);
      this.currentContent = newContent;
    }
  }
}
```

### Step 5: Wire It Up

In the CLI or a standalone entry point, create a `WarpFSServer` with your folder as root:

```typescript
import { WarpFSServer } from "@warpfs/core";

const server = new WarpFSServer({
  port: 8080,
  rootFolder: new MyPlatformFolder("My Platform", api, "root-id"),
  blockOsFiles: true,
});
server.start();
```

### Step 6: Write Tests

- Mock the API client using `vi.fn()` / `vi.mock()`
- Test the folder's `listChildren()` returns correct virtual nodes
- Test the file's `read()` and `write()` with cached/debounced behavior
- Run: `pnpm test`

### Key Utils to Use

| Util | Purpose | Recommended TTL/Delay |
|------|---------|----------------------|
| `createCachedFn` | Protect API from Finder/Spotlight burst reads | 5-10s |
| `createDebouncedWrite` | Collapse rapid saves into one API call | 1-3s |
| `markdownDiff` | Compute incremental patches for block-based APIs | N/A |
| `isBlockedOsFile` | Filter `.DS_Store`, `._*`, etc. | N/A |

### Checklist

- [ ] API client with typed methods
- [ ] VirtualFolder with cached `listChildren()`
- [ ] VirtualFile with cached `read()` and debounced `write()`
- [ ] Content conversion (platform format ↔ local file format)
- [ ] Tests with mocked API
- [ ] `tsup.config.ts` and `tsconfig.json` for build
- [ ] Documented in README

---

## Cursor Cloud specific instructions

### Project overview

WarpFS is a TypeScript/Node.js monorepo (pnpm workspaces) that implements a WebDAV server to map network APIs to a local virtual file system. It has 4 packages: `@warpfs/utils`, `@warpfs/core`, `@warpfs/notion`, and `warpfs` (CLI).

### Development commands

See `package.json` scripts at the root:

- `pnpm install` — install all dependencies
- `pnpm test` — run vitest across all packages
- `pnpm build` — build all packages with tsup (order: utils → core → notion → cli)
- `pnpm lint` — run eslint

### Running the server

```bash
node packages/cli/dist/cli.js start --port 8080
```

Or after build, use the binary directly. The server listens on `http://127.0.0.1:8080` and serves a WebDAV endpoint.

### Testing with curl

```bash
curl -X PROPFIND -H "Depth: 1" http://127.0.0.1:8080/
curl http://127.0.0.1:8080/welcome.md
curl -X PUT -d "content" http://127.0.0.1:8080/test.txt
```

### Gotchas

- `pnpm.onlyBuiltDependencies` in root `package.json` must include `esbuild` — otherwise tsup cannot build. This is already configured.
- Vitest resolves workspace packages via aliases in `vitest.config.ts` (from source, not dist), so tests work without building first.
- The CLI package builds ESM-only (not CJS) because it uses `import.meta.url` for daemon process spawning.
- The Notion driver (`@warpfs/notion`) requires a `NOTION_API_KEY` environment variable for real API calls. Tests use mocks and don't need it.
