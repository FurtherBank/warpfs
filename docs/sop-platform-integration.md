# WarpFS 外部平台接入 SOP

> 本文档面向**需要将某个外部平台（拥有 OpenAPI / REST API）的内容映射为本地虚拟文件**的开发者。  
> 按照以下步骤操作，你可以在 1~2 小时内完成从零到可用的完整接入。

---

## 目录

1. [前置准备](#1-前置准备)
2. [理解核心架构](#2-理解核心架构)
3. [第一步：创建驱动包](#3-第一步创建驱动包)
4. [第二步：封装平台 API 客户端](#4-第二步封装平台-api-客户端)
5. [第三步：设计文件树映射关系](#5-第三步设计文件树映射关系)
6. [第四步：实现 VirtualFolder（目录节点）](#6-第四步实现-virtualfolder目录节点)
7. [第五步：实现 VirtualFile（文件节点）](#7-第五步实现-virtualfile文件节点)
8. [第六步：内容格式转换](#8-第六步内容格式转换)
9. [第七步：接入保护策略（缓存 / 防抖 / 增量 Diff）](#9-第七步接入保护策略缓存--防抖--增量-diff)
10. [第八步：启动服务并验证](#10-第八步启动服务并验证)
11. [第九步：编写测试](#11-第九步编写测试)
12. [第十步：构建与发布](#12-第十步构建与发布)
13. [完整示例：以 GitHub Issues 为假想平台](#13-完整示例以-github-issues-为假想平台)
14. [常见问题与排坑指南](#14-常见问题与排坑指南)
15. [自检清单](#15-自检清单)

---

## 1. 前置准备

### 环境要求

| 工具 | 版本 | 安装方式 |
|------|------|---------|
| Node.js | ≥ 20 | `nvm install 20` |
| pnpm | ≥ 10 | `npm install -g pnpm` |

### 获取代码

```bash
git clone <warpfs-repo-url>
cd warpfs
pnpm install
pnpm test    # 确认所有现有测试通过
```

### 获取目标平台的 API 凭证

在开始编码之前，你需要先在目标平台上获取 API 访问凭证。通常需要：

- **API Key** 或 **Access Token**（如 Notion Integration Token、GitHub Personal Access Token）
- **OAuth 应用配置**（如果平台使用 OAuth2 授权流程）
- 目标资源的 **ID**（如 Notion Database ID、GitHub Repo Owner/Name）

> 💡 建议创建一个专用的测试账号或测试空间来开发，避免误操作生产数据。

---

## 2. 理解核心架构

在动手之前，花 5 分钟理解 WarpFS 的分层架构：

```
┌─────────────────────────────────────────────────────┐
│  操作系统 / IDE / 编辑器                              │
│  (Finder、VS Code、Obsidian 等通过 WebDAV 协议访问)    │
└───────────────────┬─────────────────────────────────┘
                    │  HTTP (WebDAV: PROPFIND/GET/PUT/DELETE/MKCOL)
                    ▼
┌─────────────────────────────────────────────────────┐
│  @warpfs/core — WebDAV 引擎                          │
│  将 HTTP 请求路由到对应的 VirtualFolder / VirtualFile  │
└───────────────────┬─────────────────────────────────┘
                    │  调用你实现的抽象方法
                    ▼
┌─────────────────────────────────────────────────────┐
│  @warpfs/<你的平台> — 你要编写的驱动包                  │
│  VirtualFolder.listChildren()  →  调用平台 API 列表   │
│  VirtualFile.read()            →  调用平台 API 读取   │
│  VirtualFile.write()           →  调用平台 API 写入   │
└───────────────────┬─────────────────────────────────┘
                    │  HTTP / SDK
                    ▼
┌─────────────────────────────────────────────────────┐
│  外部平台 (Notion / GitHub / CMS / ...)              │
└─────────────────────────────────────────────────────┘
```

你只需要关注**中间那一层**：实现 `VirtualFolder` 和 `VirtualFile` 的子类，其他一切由框架处理。

### 关键抽象类

```typescript
// VirtualFolder — 你需要实现的「目录」
abstract class VirtualFolder {
  abstract listChildren(): Promise<VirtualNode[]>;  // 必须实现：列出子节点
  createChildFile(name: string): Promise<VirtualFile>;    // 可选：创建文件
  createChildFolder(name: string): Promise<VirtualFolder>; // 可选：创建子目录
  removeChild(name: string): Promise<boolean>;            // 可选：删除子节点
}

// VirtualFile — 你需要实现的「文件」
abstract class VirtualFile {
  abstract getSize(): number;              // 必须实现：返回文件大小
  abstract read(): Promise<Buffer>;        // 必须实现：读取内容
  abstract write(content: Buffer): Promise<void>; // 必须实现：写入内容
}
```

### 关键工具函数（`@warpfs/utils`）

| 函数 | 作用 | 什么时候用 |
|------|------|-----------|
| `createCachedFn(fn, { ttl })` | 给异步函数套上 LRU 缓存，TTL 内重复调用直接返回内存值 | **读取操作**——防止 Finder/Spotlight 高频探测打爆 API |
| `createDebouncedWrite(fn, delayMs)` | 对写入操作做防抖合并，只在安静期结束后执行一次 | **写入操作**——IDE 保存时可能瞬间触发多次 PUT |
| `markdownDiff(oldMd, newMd)` | 计算两段文本的行级 Diff，返回 `PatchOp[]` | **增量推送**——只向平台发送修改的部分 |
| `isBlockedOsFile(filename)` | 检测是否为 `.DS_Store`、`._*` 等系统文件 | 框架已内置自动调用，一般无需手动使用 |

---

## 3. 第一步：创建驱动包

在 `packages/` 下创建你的平台驱动包。以接入 `myplatform` 为例：

```bash
mkdir -p packages/myplatform/src
```

创建 `packages/myplatform/package.json`：

```json
{
  "name": "@warpfs/myplatform",
  "version": "0.1.0",
  "description": "WarpFS 驱动：将 MyPlatform 内容映射为虚拟文件",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsup",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@warpfs/core": "workspace:*",
    "@warpfs/utils": "workspace:*"
  }
}
```

> ⚠️ **注意**：`exports` 字段中 `types` 必须排在 `import` 之前，否则 tsup 构建会警告。

创建 `packages/myplatform/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

创建 `packages/myplatform/tsup.config.ts`：

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
});
```

安装你需要的平台 SDK（如果有的话）：

```bash
cd packages/myplatform
pnpm add <platform-sdk-package>
cd ../..
pnpm install
```

---

## 4. 第二步：封装平台 API 客户端

创建 `src/myplatform-api.ts`，将平台的所有网络调用封装在一个类中。

**为什么要独立封装？**
- 测试时可以整体 Mock，不需要真实网络请求
- API 凭证和基础 URL 集中管理
- 方便统一处理错误、重试、限速

```typescript
// packages/myplatform/src/myplatform-api.ts

export interface ItemInfo {
  id: string;
  title: string;
  updatedAt: string;
}

export class MyPlatformAPI {
  private baseUrl: string;
  private token: string;

  constructor(config: { baseUrl: string; token: string }) {
    this.baseUrl = config.baseUrl;
    this.token = config.token;
  }

  /**
   * 列出指定容器（文件夹/项目/数据库）下的所有条目
   * 对应 VirtualFolder.listChildren()
   */
  async listItems(containerId: string): Promise<ItemInfo[]> {
    const res = await fetch(`${this.baseUrl}/containers/${containerId}/items`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new Error(`API Error: ${res.status} ${res.statusText}`);
    const data = await res.json();
    return data.items.map((item: any) => ({
      id: item.id,
      title: item.title ?? `Untitled-${item.id.slice(0, 8)}`,
      updatedAt: item.updated_at,
    }));
  }

  /**
   * 获取单个条目的原始内容
   * 对应 VirtualFile.read()
   */
  async getItemContent(itemId: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/items/${itemId}/content`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.text();
  }

  /**
   * 全量更新条目内容
   * 对应 VirtualFile.write() —— 全量覆盖版本
   */
  async updateItemContent(itemId: string, content: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/items/${itemId}/content`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "text/plain",
      },
      body: content,
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
  }

  /**
   * 增量更新（如果平台支持 Patch 语义）
   * 对应 VirtualFile.write() —— 增量 Diff 版本
   */
  async patchItem(itemId: string, patches: any[]): Promise<void> {
    const res = await fetch(`${this.baseUrl}/items/${itemId}/patch`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ operations: patches }),
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
  }

  /**
   * 创建新条目
   * 对应 VirtualFolder.createChildFile()
   */
  async createItem(containerId: string, title: string, content: string): Promise<ItemInfo> {
    const res = await fetch(`${this.baseUrl}/containers/${containerId}/items`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title, content }),
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  }

  /**
   * 删除条目
   * 对应 VirtualFolder.removeChild()
   */
  async deleteItem(itemId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/items/${itemId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
  }
}
```

### API 客户端设计要点

| 要点 | 说明 |
|------|------|
| **每个方法对应一个 API 操作** | 不要在一个方法里组合多个请求 |
| **返回值使用自定义 TypeScript 接口** | 不直接暴露平台原始响应结构 |
| **错误统一抛出** | 让上层调用者决定如何处理 |
| **凭证通过构造函数注入** | 方便测试时替换 |

---

## 5. 第三步：设计文件树映射关系

这是整个接入过程中**最关键的设计决策**。你需要回答：

> 平台上的哪些概念映射为「文件夹」？哪些映射为「文件」？文件用什么格式存储？

### 映射设计模板

填写下表来规划你的映射关系：

| 平台概念 | 映射为 | 虚拟名称 | 文件格式 |
|---------|--------|---------|---------|
| 例：Notion Database | 📁 VirtualFolder | `<数据库名>/` | — |
| 例：Notion Page | 📄 VirtualFile | `<页面标题>.md` | Markdown |
| 例：GitHub Repo | 📁 VirtualFolder | `<owner>/<repo>/` | — |
| 例：GitHub Issue | 📄 VirtualFile | `<issue编号>-<标题>.md` | Markdown |
| 你的平台：______ | 📁 / 📄 | ______ | ______ |

### 映射设计原则

1. **文件名必须唯一**——同一目录下不能有重名文件。如果平台允许同名条目，在文件名中加入 ID：`<title>-<id前8位>.md`

2. **文件名必须合法**——避免 `/`、`\`、`:`、`*` 等文件系统保留字符。建议写一个 `sanitizeFilename()` 工具函数：
   ```typescript
   function sanitizeFilename(name: string): string {
     return name.replace(/[/\\:*?"<>|]/g, "_").trim() || "untitled";
   }
   ```

3. **选择合适的文件格式**——
   - 纯文本内容 → `.md`（Markdown）或 `.txt`
   - 结构化数据 → `.json`（方便程序处理）或 `.yaml`
   - 富文本内容 → `.md`（需要编写格式转换器）

4. **层级不宜太深**——WebDAV 客户端每进入一层目录都会触发一次 PROPFIND，层级过深会导致延迟叠加。建议最多 2~3 层。

---

## 6. 第四步：实现 VirtualFolder（目录节点）

```typescript
// packages/myplatform/src/myplatform-folder.ts

import { VirtualFolder, VirtualFile, VirtualNode } from "@warpfs/core";
import { createCachedFn } from "@warpfs/utils";
import { MyPlatformAPI, ItemInfo } from "./myplatform-api.js";
import { MyPlatformFile } from "./myplatform-file.js";

export class MyPlatformFolder extends VirtualFolder {
  private api: MyPlatformAPI;
  private containerId: string;
  private cachedList: () => Promise<VirtualNode[]>;

  // 用于按名称反查 item ID，支持 createChildFile / removeChild
  private childMap = new Map<string, ItemInfo>();

  constructor(name: string, containerId: string, api: MyPlatformAPI) {
    super(name);
    this.api = api;
    this.containerId = containerId;

    // ★ 关键：给 listChildren 套上缓存
    // TTL 设为 10 秒 —— 在此期间多次 PROPFIND 只触发一次 API 调用
    this.cachedList = createCachedFn(
      () => this.fetchChildren(),
      { ttl: 10_000 },
    );
  }

  async listChildren(): Promise<VirtualNode[]> {
    return this.cachedList();
  }

  private async fetchChildren(): Promise<VirtualNode[]> {
    const items = await this.api.listItems(this.containerId);

    this.childMap.clear();
    const nodes: VirtualNode[] = [];

    for (const item of items) {
      const filename = `${sanitizeFilename(item.title)}.md`;
      this.childMap.set(filename, item);
      nodes.push(new MyPlatformFile(filename, item.id, this.api));
    }

    return nodes;
  }

  // --- 以下为可选方法，按需实现 ---

  async createChildFile(name: string): Promise<VirtualFile> {
    const title = name.replace(/\.md$/, "");
    const newItem = await this.api.createItem(this.containerId, title, "");
    return new MyPlatformFile(name, newItem.id, this.api);
  }

  async removeChild(name: string): Promise<boolean> {
    const item = this.childMap.get(name);
    if (!item) return false;
    await this.api.deleteItem(item.id);
    this.childMap.delete(name);
    return true;
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "_").trim() || "untitled";
}
```

### listChildren 注意事项

| 场景 | 处理方式 |
|------|---------|
| API 有分页 | 在 `fetchChildren()` 中循环拉取所有分页，一次性返回完整列表 |
| 条目数量 > 1000 | 考虑只返回最近修改的 N 条，或按文件夹分组 |
| API 限流 (Rate Limit) | 调大 `createCachedFn` 的 TTL（如 30 秒） |
| 需要嵌套文件夹 | 在 `fetchChildren()` 中同时返回 `MyPlatformFolder` 和 `MyPlatformFile` 实例 |

---

## 7. 第五步：实现 VirtualFile（文件节点）

```typescript
// packages/myplatform/src/myplatform-file.ts

import { VirtualFile } from "@warpfs/core";
import {
  createCachedFn,
  createDebouncedWrite,
  markdownDiff,
  type DebounceHandle,
} from "@warpfs/utils";
import { MyPlatformAPI } from "./myplatform-api.js";

export class MyPlatformFile extends VirtualFile {
  private api: MyPlatformAPI;
  private itemId: string;
  private currentContent: string = "";

  private cachedRead: () => Promise<Buffer>;
  private debounceHandle: DebounceHandle<Buffer>;

  constructor(name: string, itemId: string, api: MyPlatformAPI) {
    super(name);
    this.api = api;
    this.itemId = itemId;

    // ★ 读取缓存：5 秒 TTL
    this.cachedRead = createCachedFn(
      () => this.fetchContent(),
      { ttl: 5_000 },
    );

    // ★ 写入防抖：2 秒安静期
    this.debounceHandle = createDebouncedWrite(
      (buf: Buffer) => this.doWrite(buf),
      2_000,
    );
  }

  getSize(): number {
    return Buffer.byteLength(this.currentContent, "utf-8");
  }

  async read(): Promise<Buffer> {
    return this.cachedRead();
  }

  async write(content: Buffer): Promise<void> {
    return this.debounceHandle.push(content);
  }

  // --- 内部实现 ---

  private async fetchContent(): Promise<Buffer> {
    // 从平台 API 获取原始内容
    const rawContent = await this.api.getItemContent(this.itemId);

    // ★ 如果平台返回的不是纯文本，在这里做格式转换
    // 例：将 Notion Blocks 转为 Markdown、将 JSON 格式化为可读文本
    const localContent = this.convertToLocalFormat(rawContent);

    this.currentContent = localContent;
    return Buffer.from(localContent, "utf-8");
  }

  private async doWrite(newContentBuffer: Buffer): Promise<void> {
    const newContent = newContentBuffer.toString("utf-8");

    // ★ 使用 Diff 计算增量变化
    const ops = markdownDiff(this.currentContent, newContent);

    if (ops.length === 0) return; // 内容未变，跳过

    // 方案 A：全量覆盖（简单但浪费流量）
    await this.api.updateItemContent(this.itemId, newContent);

    // 方案 B：增量推送（如果平台 API 支持 Patch 语义）
    // const patches = this.convertDiffToPatches(ops);
    // await this.api.patchItem(this.itemId, patches);

    this.currentContent = newContent;
    this.lastModified = Date.now();
  }

  // --- 格式转换（按需实现） ---

  private convertToLocalFormat(raw: string): string {
    // 默认：原样返回
    // 如果平台内容是 JSON/HTML/自定义格式，在这里转为 Markdown 或纯文本
    return raw;
  }
}
```

### read() 与 write() 的生命周期

```
用户在 VS Code 中打开文件
    │
    ▼
系统 GET 请求 → read() → cachedRead()
    │                        │
    │   TTL 内?              ├── 是 → 直接返回内存缓存
    │                        └── 否 → fetchContent() → 调用 API → 缓存结果
    │
用户编辑并保存 (Cmd+S)
    │
    ▼
系统 PUT 请求 → write() → debounceHandle.push()
    │                        │
    │   2秒内有新的 PUT?      ├── 是 → 重置计时器，丢弃旧值
    │                        └── 否 → doWrite() → Diff 计算 → 调用 API
```

---

## 8. 第六步：内容格式转换

如果你的平台存储的内容格式不是纯文本，你需要实现双向转换器。

### 转换方向

```
平台原始格式  ──── read() 时 ────→  本地文件格式 (Markdown/JSON/TXT)
本地文件格式  ──── write() 时 ───→  平台原始格式
```

### 示例：将平台的 JSON 块结构转为 Markdown

```typescript
// packages/myplatform/src/converter.ts

interface PlatformBlock {
  type: "heading" | "paragraph" | "list_item" | "code";
  content: string;
  level?: number;    // 仅 heading 使用
  language?: string; // 仅 code 使用
}

/**
 * 平台格式 → 本地 Markdown
 */
export function blocksToMarkdown(blocks: PlatformBlock[]): string {
  return blocks.map(block => {
    switch (block.type) {
      case "heading":
        return "#".repeat(block.level ?? 1) + " " + block.content + "\n";
      case "paragraph":
        return block.content + "\n";
      case "list_item":
        return "- " + block.content;
      case "code":
        return "```" + (block.language ?? "") + "\n" + block.content + "\n```\n";
      default:
        return block.content;
    }
  }).join("\n");
}

/**
 * 本地 Markdown → 平台格式
 * （简易实现，生产环境建议使用 remark/unified 做 AST 解析）
 */
export function markdownToBlocks(md: string): PlatformBlock[] {
  const lines = md.split("\n");
  const blocks: PlatformBlock[] = [];

  for (const line of lines) {
    if (line.startsWith("# ")) {
      blocks.push({ type: "heading", content: line.slice(2), level: 1 });
    } else if (line.startsWith("## ")) {
      blocks.push({ type: "heading", content: line.slice(3), level: 2 });
    } else if (line.startsWith("- ")) {
      blocks.push({ type: "list_item", content: line.slice(2) });
    } else if (line.trim()) {
      blocks.push({ type: "paragraph", content: line });
    }
  }

  return blocks;
}
```

### 格式转换设计要点

| 原则 | 说明 |
|------|------|
| **无损往返（Round-trip）** | `read → 编辑 → write` 不应丢失未修改的内容（如嵌入的图片、评论） |
| **不支持的元素要保留** | 对于转换器无法处理的块类型，用 HTML 注释占位：`<!-- unsupported: embed -->` |
| **转换器要有单元测试** | 这是最容易出 bug 的地方，参考 `@warpfs/notion` 的 `blocks-to-markdown.test.ts` |

---

## 9. 第七步：接入保护策略（缓存 / 防抖 / 增量 Diff）

这三个策略是 WarpFS 的精髓，直接决定了你的驱动是否「好用」还是「打爆 API」。

### 9.1 读取缓存 (`createCachedFn`)

**问题场景**：macOS Finder 打开虚拟文件夹时，Spotlight 索引 + 缩略图生成会在 1 秒内触发数十次读取。

**解决方式**：

```typescript
import { createCachedFn } from "@warpfs/utils";

// 在构造函数中初始化
this.cachedRead = createCachedFn(
  () => this.fetchContent(),  // 真正的 API 调用
  { ttl: 5000 },              // 5 秒内重复读直接返回内存
);
```

**TTL 选择指南**：

| 场景 | 推荐 TTL | 理由 |
|------|---------|------|
| 内容很少变化（文档库） | 10~30 秒 | 减少不必要的网络请求 |
| 内容频繁变化（聊天记录） | 2~5 秒 | 平衡实时性和 API 额度 |
| 目录列表（listChildren） | 10~60 秒 | 目录结构变化频率远低于内容 |

### 9.2 写入防抖 (`createDebouncedWrite`)

**问题场景**：VS Code 的自动保存或 `Cmd+S` 可能在极短时间内触发多次 PUT。某些编辑器甚至会先写入空内容再写入新内容（clear + write）。

**解决方式**：

```typescript
import { createDebouncedWrite, type DebounceHandle } from "@warpfs/utils";

// 在构造函数中初始化
this.debounceHandle = createDebouncedWrite(
  (buf: Buffer) => this.doWrite(buf),  // 实际写入函数
  2000,                                 // 2 秒安静期
);

// write() 方法中使用
async write(content: Buffer): Promise<void> {
  return this.debounceHandle.push(content);
}
```

**延迟选择指南**：

| 场景 | 推荐延迟 | 理由 |
|------|---------|------|
| 写入成本低（REST PUT） | 1~2 秒 | 快速响应 |
| 写入成本高（需要复杂转换） | 2~5 秒 | 等用户编辑完一段再推送 |
| 写入有严格限流 | 5~10 秒 | 最大程度合并请求 |

### 9.3 增量 Diff (`markdownDiff`)

**问题场景**：用户只改了标题的一个字，但整个文件内容被重新 PUT。如果平台 API 基于块/行操作（如 Notion），全量覆盖会导致评论和修改历史丢失。

**解决方式**：

```typescript
import { markdownDiff } from "@warpfs/utils";

private async doWrite(newContentBuffer: Buffer): Promise<void> {
  const newContent = newContentBuffer.toString("utf-8");

  // 计算新旧内容差异
  const ops = markdownDiff(this.currentContent, newContent);

  if (ops.length === 0) return; // 内容未变

  // 将 PatchOp[] 转换为平台特定的 Patch 请求
  for (const op of ops) {
    if (op.type === "add") {
      // 调用平台 API 插入新行/块
    } else if (op.type === "remove") {
      // 调用平台 API 删除行/块
    }
  }

  this.currentContent = newContent;
}
```

**`PatchOp` 结构**：

```typescript
interface PatchOp {
  type: "add" | "remove" | "modify";
  lineIndex: number;    // 在原文中的行号（0-based）
  oldValue?: string;    // remove 时有值
  newValue?: string;    // add 时有值
}
```

> 💡 **提示**：如果你的平台不支持增量更新（只有全量覆盖 API），那么 Diff 的作用是**避免无变化时的无效请求**，仍然有价值。

---

## 10. 第八步：启动服务并验证

### 创建入口文件

```typescript
// packages/myplatform/src/index.ts

export { MyPlatformAPI } from "./myplatform-api.js";
export { MyPlatformFolder } from "./myplatform-folder.js";
export { MyPlatformFile } from "./myplatform-file.js";
```

### 编写启动脚本

创建一个临时的启动脚本来验证你的驱动（可以放在 `packages/myplatform/src/dev-server.ts`）：

```typescript
// packages/myplatform/src/dev-server.ts

import { WarpFSServer } from "@warpfs/core";
import { MyPlatformAPI } from "./myplatform-api.js";
import { MyPlatformFolder } from "./myplatform-folder.js";

const api = new MyPlatformAPI({
  baseUrl: "https://api.myplatform.com/v1",
  token: process.env.MYPLATFORM_TOKEN!,
});

const rootFolder = new MyPlatformFolder(
  "MyPlatform",
  process.env.MYPLATFORM_CONTAINER_ID!,
  api,
);

const server = new WarpFSServer({
  port: 8080,
  rootFolder,
  blockOsFiles: true,  // 自动拦截 .DS_Store 等系统文件
});

server.start().then(() => {
  console.log("🚀 WarpFS 服务已启动：http://127.0.0.1:8080");
  console.log("现在可以用以下命令测试：");
  console.log("  curl http://127.0.0.1:8080/");
  console.log("  curl -X PROPFIND -H 'Depth: 1' http://127.0.0.1:8080/");
});
```

### 用 curl 进行冒烟测试

```bash
# 设置环境变量
export MYPLATFORM_TOKEN="your-api-token"
export MYPLATFORM_CONTAINER_ID="your-container-id"

# 启动服务
npx tsx packages/myplatform/src/dev-server.ts

# --- 在另一个终端中 ---

# 1. 查看根目录结构（WebDAV PROPFIND）
curl -X PROPFIND -H "Depth: 1" http://127.0.0.1:8080/
# 应该看到 XML 响应，列出你的平台条目对应的文件名

# 2. 读取某个文件
curl http://127.0.0.1:8080/某个文件名.md
# 应该看到从平台拉取并转换后的内容

# 3. 修改文件内容
curl -X PUT -d "# 新标题\n\n新内容" http://127.0.0.1:8080/某个文件名.md
# 应该返回 204 或 200

# 4. 再次读取，确认修改生效
curl http://127.0.0.1:8080/某个文件名.md

# 5. 创建新文件
curl -X PUT -d "# 新页面\n\n内容" http://127.0.0.1:8080/新页面.md
# 返回 201 Created

# 6. 删除文件
curl -X DELETE http://127.0.0.1:8080/新页面.md
# 返回 204 No Content

# 7. 验证 .DS_Store 被拦截
curl -X PUT -d "junk" http://127.0.0.1:8080/.DS_Store
# 返回 200，但实际不会触发 API 调用
curl http://127.0.0.1:8080/.DS_Store
# 返回 404
```

### 验证清单

- [ ] PROPFIND 返回正确的文件列表？
- [ ] GET 返回正确的文件内容？
- [ ] PUT 修改后，内容真的写入了平台？（到平台 Web 界面确认）
- [ ] DELETE 真的删除了条目？
- [ ] `.DS_Store` 被正确拦截了？
- [ ] 连续快速保存只触发一次 API 写入？（观察日志）

---

## 11. 第九步：编写测试

WarpFS 使用 **vitest** 作为测试框架。所有测试文件放在 `src/` 目录下，以 `.test.ts` 结尾。

### 11.1 API 客户端测试（Mock HTTP）

```typescript
// packages/myplatform/src/myplatform-api.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { MyPlatformAPI } from "./myplatform-api.js";

describe("MyPlatformAPI", () => {
  let api: MyPlatformAPI;

  beforeEach(() => {
    api = new MyPlatformAPI({
      baseUrl: "https://api.example.com",
      token: "test-token",
    });
    // Mock fetch
    vi.stubGlobal("fetch", vi.fn());
  });

  it("listItems 返回正确结构", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { id: "1", title: "文档一", updated_at: "2024-01-01" },
          { id: "2", title: "文档二", updated_at: "2024-01-02" },
        ],
      }),
    });

    const items = await api.listItems("container-1");
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("文档一");
  });

  it("getItemContent 返回文本内容", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      text: async () => "# 标题\n\n正文内容",
    });

    const content = await api.getItemContent("item-1");
    expect(content).toContain("# 标题");
  });

  it("API 错误时抛出异常", async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    });

    await expect(api.listItems("x")).rejects.toThrow("API Error: 429");
  });
});
```

### 11.2 VirtualFile 测试（Mock API 客户端）

```typescript
// packages/myplatform/src/myplatform-file.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { MyPlatformFile } from "./myplatform-file.js";
import { MyPlatformAPI } from "./myplatform-api.js";

describe("MyPlatformFile", () => {
  let mockApi: any;

  beforeEach(() => {
    mockApi = {
      getItemContent: vi.fn().mockResolvedValue("# 测试\n\n原始内容"),
      updateItemContent: vi.fn().mockResolvedValue(undefined),
    };
  });

  it("read() 返回平台内容", async () => {
    const file = new MyPlatformFile("test.md", "item-1", mockApi as MyPlatformAPI);
    const buf = await file.read();
    expect(buf.toString()).toContain("# 测试");
    expect(mockApi.getItemContent).toHaveBeenCalledWith("item-1");
  });

  it("read() 在 TTL 内走缓存", async () => {
    const file = new MyPlatformFile("test.md", "item-1", mockApi as MyPlatformAPI);
    await file.read();
    await file.read();
    await file.read();
    expect(mockApi.getItemContent).toHaveBeenCalledTimes(1); // 只调了一次！
  });

  it("write() 防抖合并", async () => {
    const file = new MyPlatformFile("test.md", "item-1", mockApi as MyPlatformAPI);
    await file.read(); // 先读取，建立基准线

    // 快速连续写入 3 次
    file.write(Buffer.from("版本1"));
    file.write(Buffer.from("版本2"));
    file.write(Buffer.from("版本3"));

    // 等待防抖安静期结束
    await new Promise(r => setTimeout(r, 3000));

    // 应该只触发了一次实际的 API 调用，且内容是最后一版
    expect(mockApi.updateItemContent).toHaveBeenCalledTimes(1);
    expect(mockApi.updateItemContent).toHaveBeenCalledWith("item-1", "版本3");
  });
});
```

### 11.3 格式转换器测试

```typescript
// packages/myplatform/src/converter.test.ts

import { describe, it, expect } from "vitest";
import { blocksToMarkdown, markdownToBlocks } from "./converter.js";

describe("blocksToMarkdown", () => {
  it("转换标题", () => {
    const md = blocksToMarkdown([
      { type: "heading", content: "Hello", level: 1 },
    ]);
    expect(md).toContain("# Hello");
  });

  it("转换段落", () => {
    const md = blocksToMarkdown([
      { type: "paragraph", content: "正文内容" },
    ]);
    expect(md).toContain("正文内容");
  });
});

describe("markdownToBlocks（往返测试）", () => {
  it("Markdown → Blocks → Markdown 保持一致", () => {
    const original = "# 标题\n\n正文段落\n\n- 列表项";
    const blocks = markdownToBlocks(original);
    const roundTripped = blocksToMarkdown(blocks);
    expect(roundTripped).toContain("# 标题");
    expect(roundTripped).toContain("正文段落");
    expect(roundTripped).toContain("- 列表项");
  });
});
```

### 运行测试

```bash
# 运行所有测试
pnpm test

# 只运行你的包的测试
pnpm test -- --filter packages/myplatform

# 监听模式
pnpm test -- --watch
```

---

## 12. 第十步：构建与发布

### 构建

```bash
pnpm build
```

这会按依赖顺序构建所有包：`utils → core → myplatform → cli`。

### 注册到 vitest.config.ts（重要！）

如果你的包依赖 `@warpfs/core` 或 `@warpfs/utils`，需要在根目录的 `vitest.config.ts` 中添加别名，这样测试时无需先构建：

```typescript
// vitest.config.ts
resolve: {
  alias: {
    "@warpfs/utils": path.resolve(__dirname, "packages/utils/src/index.ts"),
    "@warpfs/core": path.resolve(__dirname, "packages/core/src/index.ts"),
    "@warpfs/myplatform": path.resolve(__dirname, "packages/myplatform/src/index.ts"),
  },
},
```

### 与 CLI 集成（可选）

如果希望通过 `warpfs start --driver myplatform` 启动你的驱动，可以在 `packages/cli` 中添加相关命令。当前阶段，使用独立的 `dev-server.ts` 启动即可。

---

## 13. 完整示例：以 GitHub Issues 为假想平台

以下是一个简化但完整的示例，将 GitHub 仓库的 Issues 映射为本地 Markdown 文件：

```
📁 my-repo/
  📄 001-修复登录bug.md        ← Issue #1
  📄 002-添加暗黑模式.md        ← Issue #2
  📄 003-性能优化方案.md        ← Issue #3
```

### 映射关系

| GitHub 概念 | WarpFS 映射 | 文件名格式 |
|------------|-------------|-----------|
| Repository | VirtualFolder | `<owner>-<repo>/` |
| Issue | VirtualFile | `<编号>-<标题>.md` |
| Issue Body | 文件内容 | Markdown |

### 代码骨架

```typescript
// github-api.ts
class GitHubAPI {
  async listIssues(owner: string, repo: string): Promise<Issue[]> { ... }
  async getIssue(owner: string, repo: string, number: number): Promise<Issue> { ... }
  async updateIssue(owner: string, repo: string, number: number, body: string): Promise<void> { ... }
}

// github-folder.ts
class GitHubRepoFolder extends VirtualFolder {
  async listChildren(): Promise<VirtualNode[]> {
    const issues = await this.cachedList();
    return issues;
  }
  private async fetchChildren() {
    const issues = await this.api.listIssues(this.owner, this.repo);
    return issues.map(issue =>
      new GitHubIssueFile(
        `${String(issue.number).padStart(3, "0")}-${sanitize(issue.title)}.md`,
        issue.number,
        this.api, this.owner, this.repo,
      )
    );
  }
}

// github-file.ts
class GitHubIssueFile extends VirtualFile {
  async fetchContent(): Promise<Buffer> {
    const issue = await this.api.getIssue(this.owner, this.repo, this.issueNumber);
    const md = `# ${issue.title}\n\n${issue.body}`;
    this.currentContent = md;
    return Buffer.from(md);
  }
  async doWrite(buf: Buffer): Promise<void> {
    const md = buf.toString("utf-8");
    const body = md.replace(/^# .+\n\n/, ""); // 去掉标题行
    await this.api.updateIssue(this.owner, this.repo, this.issueNumber, body);
    this.currentContent = md;
  }
}
```

---

## 14. 常见问题与排坑指南

### Q1: Finder 打开文件夹时卡顿 / 很慢

**原因**：`listChildren()` 或 `read()` 的 API 调用太慢，且没有缓存。

**解决**：
1. 确保 `createCachedFn` 的 TTL 不为 0
2. 考虑在 `listChildren()` 返回时不预加载文件内容，只返回文件名和大小估算值
3. `getSize()` 可以返回一个估算值（如 `this.currentContent.length || 1024`），不需要精确

### Q2: 保存文件后，平台上没有更新

**原因**：
- 防抖还没结束，你关闭了服务
- API 调用失败但错误被吞掉了

**解决**：
1. 在 `doWrite()` 中加日志：`console.log("[WarpFS/MyPlatform] Writing:", this.name)`
2. 检查 API 返回的 HTTP 状态码
3. 服务关闭前调用 `debounceHandle.flush()` 确保待处理内容被推送

### Q3: API 限流 (HTTP 429)

**原因**：缓存 TTL 太短，或并发请求过多。

**解决**：
1. 加大 `createCachedFn` 的 TTL
2. 使用 `p-queue` 限制并发数（`pnpm add p-queue`）
3. 在 API 客户端中实现指数退避重试

### Q4: 文件名出现乱码或非法字符

**原因**：平台条目标题包含 `/`、`\` 等文件系统不支持的字符。

**解决**：务必使用 `sanitizeFilename()` 处理所有来自平台的文件名。

### Q5: macOS 不断写入 `.DS_Store`

**原因**：这是 macOS 的默认行为。

**解决**：`WarpFSServer` 的 `blockOsFiles: true` 选项会自动拦截这类请求。确保启动服务时开启了此选项。

### Q6: 测试时报 `Failed to resolve entry for package "@warpfs/core"`

**原因**：vitest 找不到 workspace 包的入口。

**解决**：确保 `vitest.config.ts` 中配置了别名（见[第十步](#12-第十步构建与发布)）。

---

## 15. 自检清单

在提交 PR 之前，用这个清单检查你的工作：

### 代码完整性

- [ ] `myplatform-api.ts` — API 客户端，封装所有网络请求
- [ ] `myplatform-folder.ts` — 目录节点，实现 `listChildren()`
- [ ] `myplatform-file.ts` — 文件节点，实现 `read()` 和 `write()`
- [ ] `converter.ts` — 格式转换器（如需要）
- [ ] `index.ts` — 统一导出入口
- [ ] `package.json` — 正确声明依赖和构建脚本
- [ ] `tsconfig.json` — 继承根目录配置
- [ ] `tsup.config.ts` — 构建配置

### 保护策略

- [ ] `read()` 使用了 `createCachedFn`（防止读取风暴）
- [ ] `write()` 使用了 `createDebouncedWrite`（防止写入风暴）
- [ ] `doWrite()` 使用了 `markdownDiff`（避免无变化时的无效请求）
- [ ] 服务启动时开启了 `blockOsFiles: true`

### 测试覆盖

- [ ] API 客户端的 Mock 测试
- [ ] VirtualFile 的读取缓存测试
- [ ] VirtualFile 的写入防抖测试
- [ ] 格式转换器的往返（round-trip）测试
- [ ] `pnpm test` 全部通过

### 构建与运行

- [ ] `pnpm build` 无错误
- [ ] `pnpm lint` 无错误
- [ ] `vitest.config.ts` 中已添加包别名
- [ ] 用 `curl` 完成了冒烟测试
- [ ] 到平台 Web 界面确认了读写操作的正确性

---

> 📝 **维护说明**：本文档随 WarpFS 代码库一起维护。如有 API 变更或新的最佳实践，请同步更新此文档。
