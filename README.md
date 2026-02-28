# WarpFS

> Make everything to be files ~

WarpFS (折跃文件系统) maps network content to your local file system via WebDAV. Connect any API — Notion, GitHub Issues, a blog CMS — and browse/edit it as local files using VS Code, Obsidian, or Finder.

## Architecture

```
warpfs/
├── packages/
│   ├── core/       # @warpfs/core   — WebDAV engine & virtual node abstractions
│   ├── utils/      # @warpfs/utils  — Cache, debounce, diff strategies
│   ├── notion/     # @warpfs/notion — Notion database/page driver
│   └── cli/        # warpfs (CLI)   — start/stop/link/status commands
├── package.json
└── tsconfig.json
```

## Quick Start

```bash
pnpm install
pnpm build
pnpm test

# Start the WebDAV server
node packages/cli/dist/cli.js start --port 8080

# In another terminal — interact via WebDAV
curl http://localhost:8080/welcome.md
curl -X PUT -d "hello warp" http://localhost:8080/note.txt
curl http://localhost:8080/note.txt
```

## Development

```bash
pnpm install          # Install dependencies
pnpm test             # Run all tests (vitest)
pnpm test -- --watch  # Watch mode
pnpm build            # Build all packages (tsup)
pnpm lint             # Lint (eslint)
```

## Packages

| Package | Description |
|---------|-------------|
| `@warpfs/utils` | CacheTTL, DebounceWrite, DiffUtils, OS file filtering |
| `@warpfs/core` | VirtualNode/Folder/File abstractions, WebDAV HTTP handler, WarpFSServer |
| `@warpfs/notion` | Notion API adapter — maps databases to folders, pages to `.md` files |
| `warpfs` (CLI) | Command-line tool: `start`, `stop`, `link`, `status` |

## Key Features (Utils)

- **CacheTTL**: LRU-based TTL cache protecting upstream APIs from Finder/Spotlight burst reads
- **DebounceWrite**: Collapses rapid `Cmd+S` / IDE auto-save into a single API call
- **DiffUtils**: Line-level diff engine for incremental patch operations
- **OS File Blocking**: Silently intercepts `.DS_Store`, `._*`, `Thumbs.db` etc.

## Integrating a New Platform

See the full Chinese SOP at [`docs/sop-platform-integration.md`](docs/sop-platform-integration.md) for a step-by-step guide to connecting any OpenAPI-based platform to WarpFS.

## License

MIT
