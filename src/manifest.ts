import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JobManifest } from "./types.js";

export class ManifestWriter {
  private writeChain = Promise.resolve();

  constructor(public readonly manifest: JobManifest) {}

  async save(): Promise<void> {
    this.manifest.updatedAt = new Date().toISOString();
    const snapshot = JSON.stringify(this.manifest, null, 2);
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(path.dirname(this.manifest.manifestPath), { recursive: true });
      const temporary = `${this.manifest.manifestPath}.tmp`;
      await writeFile(temporary, snapshot, "utf8");
      await rename(temporary, this.manifest.manifestPath);
    });
    await this.writeChain;
  }
}

export async function readManifest(manifestPath: string): Promise<JobManifest> {
  const absolute = path.resolve(manifestPath);
  const parsed = JSON.parse(await readFile(absolute, "utf8")) as JobManifest;
  if (parsed.version !== 1 || !Array.isArray(parsed.items) || !parsed.settings) {
    throw new Error(`不是有效的拾页 Shiye 任务清单：${absolute}`);
  }
  parsed.manifestPath = absolute;
  parsed.settings.outputDirectory = path.resolve(parsed.settings.outputDirectory);
  return parsed;
}
