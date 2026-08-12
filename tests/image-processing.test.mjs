import assert from "node:assert/strict";
import test from "node:test";
import { calculateCropRect, calculateImageSize } from "../app/lib/image-processing.ts";

test("大图会等比例压缩到最长边 1600 像素", () => {
  assert.deepEqual(calculateImageSize(4000, 3000), { width: 1600, height: 1200 });
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
