import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCropRect,
  calculateImageSize,
  calculateOcrImageSize,
  stretchOcrLuminance,
} from "../app/lib/image-processing.ts";

test("大图会保留足够的OCR细节并等比例压缩到最长边2200像素", () => {
  assert.deepEqual(calculateImageSize(4000, 3000), { width: 2200, height: 1650 });
  assert.deepEqual(calculateImageSize(800, 600), { width: 800, height: 600 });
});

test("裁剪比例会转换为有效像素区域并限制极端输入", () => {
  assert.deepEqual(
    calculateCropRect(1000, 800, { cropTop: 10, cropRight: 5, cropBottom: 15, cropLeft: 20 }),
    { x: 200, y: 80, width: 750, height: 600 },
  );
  const bounded = calculateCropRect(100, 100, {
    cropTop: 80,
    cropRight: 80,
    cropBottom: 80,
    cropLeft: 80,
  });
  assert.deepEqual(bounded, { x: 35, y: 35, width: 30, height: 30 });
});

test("OCR图片会适度放大，但不会超过尺寸和倍率上限", () => {
  assert.deepEqual(calculateOcrImageSize(1600, 1200), { width: 2800, height: 2100 });
  assert.deepEqual(calculateOcrImageSize(800, 600), { width: 1600, height: 1200 });
  assert.deepEqual(calculateOcrImageSize(4000, 3000), { width: 2800, height: 2100 });
});

test("OCR灰度拉伸会增强文字与纸张的明暗差异", () => {
  assert.equal(stretchOcrLuminance(60, 60, 220), 0);
  assert.equal(stretchOcrLuminance(140, 60, 220), 128);
  assert.equal(stretchOcrLuminance(220, 60, 220), 255);
  assert.equal(stretchOcrLuminance(240, 60, 220), 255);
});
