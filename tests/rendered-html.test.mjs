import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("首页可正常输出中文笔记界面", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /<title>杰森笔记 · 读后感与观后感<\/title>/i);
  assert.doesNotMatch(html, /记下触动，梳理思考/);
  assert.match(html, /新建读后感/);
  assert.match(html, /思维导图/);
  assert.match(html, /aria-label="快速记录一条想法"/);
  assert.match(html, />速记<\/button>/);
  assert.match(html, /数据管理/);
  assert.match(html, /导出\/分享/);
  assert.match(html, /内容仅保存在此浏览器/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("具备 iPhone 主屏幕安装所需配置", async () => {
  const response = await render();
  const html = await response.text();
  const manifest = JSON.parse(
    await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
  );
  const serviceWorker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/i);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/i);
  assert.match(html, /rel="apple-touch-icon" href="\/apple-touch-icon\.png"/i);
  assert.equal(manifest.name, "杰森笔记");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.icons.some((icon) => icon.sizes === "512x512"), true);
  assert.match(serviceWorker, /addEventListener\("fetch"/);
});
