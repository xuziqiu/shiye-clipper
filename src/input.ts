import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseUrls } from "./utils.js";

function urlsFromText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed.filter((value): value is string => typeof value === "string");
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as { urls?: unknown }).urls)) {
        return (parsed as { urls: unknown[] }).urls.filter((value): value is string => typeof value === "string");
      }
    } catch {
      // Fall through to text/CSV URL detection.
    }
  }

  return [...trimmed.matchAll(/https?:\/\/[^\s"'<>]+/gi)].map((match) =>
    match[0].replace(/[，。；;、)）\]】}>]+$/g, "")
  );
}

export async function resolveUrlInputs(sources: string[], stdinText = ""): Promise<string[]> {
  const collected: string[] = [];

  for (const source of sources) {
    if (/^https?:\/\//i.test(source)) {
      collected.push(source);
      continue;
    }

    const candidate = path.resolve(source);
    let info;
    try {
      info = await stat(candidate);
    } catch {
      throw new Error(`输入文件不存在：${candidate}`);
    }
    if (!info.isFile()) throw new Error(`输入路径不是文件：${candidate}`);
    collected.push(...urlsFromText(await readFile(candidate, "utf8")));
  }

  if (stdinText.trim()) collected.push(...urlsFromText(stdinText));
  return parseUrls(collected);
}
