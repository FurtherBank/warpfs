import { cac } from "cac";
import { startCommand } from "./commands/start.js";
import { stopCommand } from "./commands/stop.js";
import { linkCommand } from "./commands/link.js";
import { statusCommand } from "./commands/status.js";

const cli = cac("warpfs");

cli
  .command("start", "Start the WarpFS WebDAV server")
  .option("-p, --port <port>", "Server port", { default: 8080 })
  .option("--foreground", "Run in foreground (don't daemonize)")
  .action(async (options: { port: number; foreground?: boolean }) => {
    await startCommand({ port: options.port, foreground: options.foreground });
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
