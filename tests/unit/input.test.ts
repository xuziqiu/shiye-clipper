import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveUrlInputs } from "../../src/input.js";

test("resolveUrlInputs reads text, CSV-like and JSON inputs", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "clipper-input-"));
  try {
    const textFile = path.join(directory, "urls.csv");
    const jsonFile = path.join(directory, "urls.json");
    await writeFile(textFile, "name,url\n一,https://example.com/a\n二,https://example.org/b", "utf8");
    await writeFile(jsonFile, JSON.stringify(["https://example.net/c"]), "utf8");
    assert.deepEqual(await resolveUrlInputs([textFile, jsonFile]), [
      "https://example.com/a",
      "https://example.org/b",
      "https://example.net/c"
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
