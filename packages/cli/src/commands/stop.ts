import pc from "picocolors";
import { stopDaemon, isRunning } from "../daemon.js";

export async function stopCommand(): Promise<void> {
  if (!isRunning()) {
    console.log(pc.yellow("⚡ No WarpFS server is running."));
    return;
  }

  const stopped = stopDaemon();
  if (stopped) {
    console.log(pc.green("✅ WarpFS server stopped."));
  } else {
    console.log(pc.red("❌ Failed to stop WarpFS server."));
  }
}
