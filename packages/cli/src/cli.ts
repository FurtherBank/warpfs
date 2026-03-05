import { cac } from "cac";
import type { MountConfig } from "@warpfs/core";
import { startCommand } from "./commands/start.js";
import { stopCommand } from "./commands/stop.js";
import { linkCommand } from "./commands/link.js";
import { statusCommand } from "./commands/status.js";

const cli = cac("warpfs");

cli
  .command("start", "Start the WarpFS WebDAV server")
  .option("-p, --port <port>", "Server port", { default: 8080 })
  .option("--foreground", "Run in foreground (don't daemonize)")
  .option("-m, --mount <mount>", "Mount a provider (format: name=origin). Can be repeated.")
  .action(async (options: { port: number; foreground?: boolean; mount?: string | string[] }) => {
    let mounts: MountConfig[] | undefined;
    if (options.mount) {
      const mountArgs = Array.isArray(options.mount) ? options.mount : [options.mount];
      mounts = mountArgs.map((m) => {
        const eqIdx = m.indexOf("=");
        if (eqIdx === -1) {
          throw new Error(`Invalid mount format: "${m}". Expected name=origin`);
        }
        return { name: m.slice(0, eqIdx), origin: m.slice(eqIdx + 1) };
      });
    }
    await startCommand({ port: options.port, foreground: options.foreground, mounts });
  });

cli
  .command("stop", "Stop the WarpFS server")
  .action(async () => {
    await stopCommand();
  });

cli
  .command("link <name>", "Create a symlink to the WarpFS volume in CWD")
  .option("-p, --port <port>", "Server port", { default: 8080 })
  .action(async (name: string, options: { port: number }) => {
    await linkCommand(name, { port: options.port });
  });

cli
  .command("status", "Check if WarpFS server is running")
  .action(async () => {
    await statusCommand();
  });

cli.help();
cli.version("0.1.0");

cli.parse();
