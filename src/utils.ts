import { randomUUID } from "node:crypto";

export function parseUrls(input: unknown): string[] {
  if (!Array.isArray(input)) {
    throw new Error("urls 必须是数组");
  }

  const unique = new Set<string>();
  for (const item of input) {
    if (typeof item !== "string" || !item.trim()) continue;
    const value = item.trim();
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(`无效网址：${value}`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`只支持 http/https：${value}`);
    }
    parsed.hash = "";
    unique.add(parsed.toString());
  }

  if (unique.size === 0) throw new Error("请至少输入一个网址");
  if (unique.size > 5_000) throw new Error("单批最多 5000 个网址");
  return [...unique];
}

export function safeFilename(value: string, fallback = "web-clipping"): string {
  const cleaned = value
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 90);
  return cleaned || fallback;
}

export function makeId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function timestampForPath(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

export function clampInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${label} 必须是 ${minimum} 到 ${maximum} 之间的整数`);
  }
  return number;
}
