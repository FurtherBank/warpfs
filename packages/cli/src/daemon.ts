import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PID_FILE = path.join(process.env.HOME ?? "/tmp", ".warpfs.pid");
const LOG_FILE = path.join(process.env.HOME ?? "/tmp", ".warpfs.log");

export function getPidFilePath(): string {
  return PID_FILE;
}

export function isRunning(): boolean {
  if (!fs.existsSync(PID_FILE)) return false;
  const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    fs.unlinkSync(PID_FILE);
    return false;
  }
}

export function getRunningPid(): number | null {
  if (!fs.existsSync(PID_FILE)) return null;
  const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    fs.unlinkSync(PID_FILE);
    return null;
  }
}

export function startDaemon(port: number): void {
  const serverScript = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "server-entry.js",
  );

  const logFd = fs.openSync(LOG_FILE, "a");
  const child = spawn(process.execPath, [serverScript, String(port)], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env, WARPFS_PORT: String(port) },
  });

  fs.writeFileSync(PID_FILE, String(child.pid));
  child.unref();
}

export function stopDaemon(): boolean {
  const pid = getRunningPid();
  if (pid === null) return false;
  try {
    process.kill(pid, "SIGTERM");
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    return true;
  } catch {
    return false;
  }
}
