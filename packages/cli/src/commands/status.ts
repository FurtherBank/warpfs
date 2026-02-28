import pc from "picocolors";
import { isRunning, getRunningPid } from "../daemon.js";

export async function statusCommand(): Promise<void> {
  if (isRunning()) {
    const pid = getRunningPid();
    console.log(pc.green(`✅ WarpFS is running (PID: ${pid})`));
  } else {
    console.log(pc.dim("⭘ WarpFS is not running."));
  }
}
