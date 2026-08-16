import assert from "node:assert/strict";
import test from "node:test";
import { getOcrStatusLabel, normalizeOcrText } from "../app/lib/ocr.ts";

test("识别结果会统一换行并清理多余空白", () => {
  assert.equal(
    normalizeOcrText("  第一行  \r\n\r\n\r\n第二行   \r\n"),
    "第一行\n\n第二行",
  );
});

test("识别进度会转换为中文提示", () => {
  assert.equal(getOcrStatusLabel("recognizing text"), "正在识别图片文字");
  assert.equal(getOcrStatusLabel("unknown status"), "正在准备本机识别");
});
