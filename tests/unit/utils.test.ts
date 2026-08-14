import test from "node:test";
import assert from "node:assert/strict";
import { parseUrls, safeFilename } from "../../src/utils.js";

test("parseUrls validates, normalizes and deduplicates URLs", () => {
  assert.deepEqual(
    parseUrls([" https://example.com/a#one ", "https://example.com/a#two", "http://example.org"]),
    ["https://example.com/a", "http://example.org/"]
  );
});

test("parseUrls rejects unsupported protocols", () => {
  assert.throws(() => parseUrls(["file:///C:/secret.txt"]), /只支持 http\/https/);
});

test("safeFilename removes Windows-reserved characters", () => {
  assert.equal(safeFilename('A: story? <today> | news'), "A- story- -today- - news");
});
