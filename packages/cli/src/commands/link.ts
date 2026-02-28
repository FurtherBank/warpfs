import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";

export interface LinkOptions {
  target?: string;
  port: number;
}

/**
 * Creates a symlink in the current working directory pointing to the
 * mounted WebDAV volume. On non-macOS systems, the link points to a
 * placeholder directory for development purposes.
 */
export async function linkCommand(name: string, _options: LinkOptions): Promise<void> {
  const cwd = process.cwd();
  const linkPath = path.join(cwd, name);

  if (fs.existsSync(linkPath)) {
    console.log(pc.red(`❌ "${name}" already exists in the current directory.`));
    process.exit(1);
  }

  const volumePath = `/Volumes/localhost`;

  if (fs.existsSync(volumePath)) {
    fs.symlinkSync(volumePath, linkPath, "dir");
    console.log(pc.green(`✅ Linked: ${pc.bold(linkPath)} → ${volumePath}`));
  } else {
    console.log(
      pc.yellow(
        `⚠ WebDAV volume not mounted at ${volumePath}. Creating a placeholder link.`,
      ),
    );
    console.log(
      pc.dim(
        `On macOS, use Finder > Go > Connect to Server > http://localhost:${_options.port}`,
      ),
    );
    console.log(pc.dim(`Then re-run: warpfs link ${name}`));
  }

  console.log(
    pc.cyan(
      `💡 Open the linked folder in VS Code or Obsidian to edit remote content as local files.`,
    ),
  );
}
