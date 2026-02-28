/**
 * Standalone server entry point for the daemon process.
 * Spawned as a detached child by the CLI.
 */
import { WarpFSServer, MemoryFolder, MemoryFile } from "@warpfs/core";

const port = parseInt(process.env.WARPFS_PORT ?? process.argv[2] ?? "8080", 10);

const root = new MemoryFolder("WarpFS");
root.addChild(new MemoryFile("welcome.md", "# Welcome to WarpFS\n\nYour warp gate is open.\n"));

const server = new WarpFSServer({ port, rootFolder: root, blockOsFiles: true });

server.start().then(() => {
  console.log(`[WarpFS Daemon] Running on port ${port}`);
});

process.on("SIGTERM", () => {
  console.log("[WarpFS Daemon] Shutting down...");
  server.stop().then(() => process.exit(0));
});
