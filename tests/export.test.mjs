import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNotePrintHtml,
  calculateMindMapLayout,
  createExportBaseName,
  noteToMarkdown,
  noteToPlainText,
} from "../app/lib/export.ts";
import { DEFAULT_NOTES } from "../app/lib/notes.ts";

test("笔记可生成 Markdown 和纯文本，并包含元数据及思维导图", () => {
  const note = DEFAULT_NOTES[0];
  const markdown = noteToMarkdown(note);
  const text = noteToPlainText(note);

  assert.match(markdown, /^# 《被讨厌的勇气》/);
  assert.match(markdown, /评分：★★★★★（5\.0）/);
  assert.match(markdown, /## 思维导图/);
  assert.match(markdown, /  - 课题分离/);
  assert.match(text, /【笔记正文】/);
  assert.match(text, /#心理学/);
});

test("导出文件名会清理系统不支持的字符并保留中文", () => {
  const note = { ...DEFAULT_NOTES[0], title: '我的/笔记:第一章?* "测试"' };
  const name = createExportBaseName(note);

  assert.equal(name.includes("我的"), true);
  assert.doesNotMatch(name, /[<>:"/\\|?*]/);
});

test("思维导图布局会完整计算节点、连线和画布尺寸", () => {
  const map = DEFAULT_NOTES[0].mindMap;
  const layout = calculateMindMapLayout(map);

  assert.equal(layout.nodes.length, 8);
  assert.equal(layout.edges.length, 7);
  assert.equal(layout.nodes.find((node) => node.id === map.id)?.depth, 0);
  assert.equal(layout.width > layout.nodeWidth * 2, true);
  assert.equal(layout.height >= 360, true);
});

test("PDF 打印页面会转义笔记内容并使用中文阅读版式", () => {
  const note = {
    ...DEFAULT_NOTES[0],
    title: "<script>危险标题</script>",
    content: "第一行\n第二行 <b>不是标签</b>",
    contentBlocks: [{ id: "text-1", type: "text", text: "第一行\n第二行 <b>不是标签</b>" }],
  };
  const html = buildNotePrintHtml(note);

  assert.doesNotMatch(html, /<script>危险标题<\/script>/);
  assert.match(html, /&lt;script&gt;危险标题&lt;\/script&gt;/);
  assert.match(html, /第一行\n第二行 &lt;b&gt;不是标签&lt;\/b&gt;/);
  assert.match(html, /@page \{ size: A4/);
});

test("PDF 打印页面会按正文顺序嵌入图片，并过滤非法图片地址", () => {
  const note = {
    ...DEFAULT_NOTES[0],
    images: [{ id: "image-1", caption: "重点页", createdAt: 1 }],
    contentBlocks: [
      { id: "text-before", type: "text", text: "图片前面的文字" },
      { id: "image-block", type: "image", imageId: "image-1" },
      { id: "text-after", type: "text", text: "图片后面的文字" },
    ],
  };
  const html = buildNotePrintHtml(note, [
    { id: "image-1", dataUrl: "data:image/jpeg;base64,AA==", caption: "<重点页>" },
    { id: "image-2", dataUrl: "javascript:alert(1)", caption: "危险地址" },
  ]);

  assert.equal(html.indexOf("图片前面的文字") < html.indexOf("data:image/jpeg"), true);
  assert.equal(html.indexOf("data:image/jpeg") < html.indexOf("图片后面的文字"), true);
  assert.match(html, /data:image\/jpeg;base64,AA==/);
  assert.match(html, /&lt;重点页&gt;/);
  assert.doesNotMatch(html, /javascript:alert/);
  assert.match(noteToMarkdown(note), /\[图片：重点页\]/);
  assert.match(noteToPlainText(note), /\[图片：重点页\]/);
});
