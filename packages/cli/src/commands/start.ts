import pc from "picocolors";
import { WarpFSServer, MemoryFolder, MemoryFile } from "@warpfs/core";
import { isRunning } from "../daemon.js";

export interface StartOptions {
  port: number;
  foreground?: boolean;
}

/**
 * Starts the WarpFS WebDAV server.
 * In foreground mode, runs directly in the current process.
 */
export async function startCommand(options: StartOptions): Promise<void> {
  if (isRunning()) {
    console.log(pc.yellow("⚡ WarpFS server is already running."));
    return;
  }

  const root = new MemoryFolder("WarpFS");
  root.addChild(
    new MemoryFile(
      "welcome.md",
      "# Welcome to WarpFS\n\nYour warp gate is open. Drop files here or connect a driver.\n",
    ),
  );

  const server = new WarpFSServer({
    port: options.port,
    rootFolder: root,
    blockOsFiles: true,
  });

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
