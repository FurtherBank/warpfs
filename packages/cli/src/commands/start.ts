import pc from "picocolors";
import { WarpFSServer, MemoryFolder, MemoryFile } from "@warpfs/core";
import type { MountConfig } from "@warpfs/core";
import { isRunning } from "../daemon.js";

export interface StartOptions {
  port: number;
  foreground?: boolean;
  /** Provider mount configurations. */
  mounts?: MountConfig[];
}

/**
 * Starts the WarpFS WebDAV server.
 * When mounts are provided, uses provider-based routing.
 * Otherwise falls back to an in-memory root with a welcome file.
 */
export async function startCommand(options: StartOptions): Promise<void> {
  if (isRunning()) {
    console.log(pc.yellow("⚡ WarpFS server is already running."));
    return;
  }

  let server: WarpFSServer;

  if (options.mounts && options.mounts.length > 0) {
    server = new WarpFSServer({
      port: options.port,
      mounts: options.mounts,
      blockOsFiles: true,
    });
    console.log(pc.dim(`Mounting ${options.mounts.length} provider(s):`));
    for (const m of options.mounts) {
      console.log(pc.dim(`  /${m.name} → ${m.origin}`));
    }
  } else {
    const root = new MemoryFolder("WarpFS");
    root.addChild(
      new MemoryFile(
        "welcome.md",
        "# Welcome to WarpFS\n\nYour warp gate is open. Drop files here or connect a driver.\n",
      ),
    );
    server = new WarpFSServer({
      port: options.port,
      rootFolder: root,
      blockOsFiles: true,
    });
  }

  await server.start();
  console.log(
    pc.green(`✅ WarpFS server started at ${pc.bold(server.address)}`),
  );
  console.log(pc.dim("Press Ctrl+C to stop."));

  const shutdown = async () => {
    console.log(pc.yellow("\n🛑 Stopping WarpFS..."));
    await server.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
