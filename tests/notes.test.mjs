import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_NOTES,
  addMindChild,
  createNote,
  createQuickNote,
  deleteMindNode,
  formatUpdatedAt,
  insertTextAfterImageBlock,
  matchesNote,
  migrateNoteContent,
  removeImageFromContentBlocks,
  updateMindNode,
} from "../app/lib/notes.ts";

test("新建笔记具备默认思维导图和类型", () => {
  const now = new Date("2026-08-05T12:00:00+08:00").getTime();
  const note = createNote("video", now);
  assert.equal(note.type, "video");
  assert.equal(note.createdAt, now);
  assert.equal(note.mindMap.children.length, 3);
  assert.equal(note.mindMap.children[0].text, "核心观点");
  assert.deepEqual(note.images, []);
});

test("旧笔记会自动迁移为文字与图片混排内容块", () => {
  const legacy = {
    ...DEFAULT_NOTES[0],
    contentBlocks: undefined,
    content: "第一段旧正文",
    images: [{ id: "image-1", caption: "书页", createdAt: 1 }],
  };
  const migrated = migrateNoteContent(legacy);

  assert.deepEqual(migrated.contentBlocks?.map((block) => block.type), ["text", "image", "text"]);
  assert.equal(migrated.contentBlocks?.[0].type === "text" && migrated.contentBlocks[0].text, "第一段旧正文");
  assert.equal(migrated.contentBlocks?.[1].type === "image" && migrated.contentBlocks[1].imageId, "image-1");
});

test("删除夹在两段文字之间的图片后会无损合并原文字", () => {
  const blocks = [
    { id: "before", type: "text", text: "第一部分，" },
    { id: "image-block", type: "image", imageId: "image-1" },
    { id: "after", type: "text", text: "第二部分。" },
  ];
  const merged = removeImageFromContentBlocks(blocks, "image-1");

  assert.deepEqual(merged, [{ id: "before", type: "text", text: "第一部分，第二部分。" }]);
  assert.equal(blocks.length, 3);
});

test("连续图片只在最后一张被删除后重新合并文字", () => {
  const blocks = [
    { id: "before", type: "text", text: "前" },
    { id: "image-a", type: "image", imageId: "image-a" },
    { id: "image-b", type: "image", imageId: "image-b" },
    { id: "after", type: "text", text: "后" },
  ];
  const afterFirstDelete = removeImageFromContentBlocks(blocks, "image-a");
  assert.deepEqual(afterFirstDelete.map((block) => block.type), ["text", "image", "text"]);

  const afterSecondDelete = removeImageFromContentBlocks(afterFirstDelete, "image-b");
  assert.deepEqual(afterSecondDelete, [{ id: "before", type: "text", text: "前后" }]);
});

test("识别文字会插入图片下方的空白文字块", () => {
  const blocks = [
    { id: "before", type: "text", text: "图片之前" },
    { id: "image", type: "image", imageId: "image-1" },
    { id: "after", type: "text", text: "" },
  ];
  const updated = insertTextAfterImageBlock(blocks, "image-1", "  识别出的文字  ", "new-text");

  assert.deepEqual(updated, [
    { id: "before", type: "text", text: "图片之前" },
    { id: "image", type: "image", imageId: "image-1" },
    { id: "after", type: "text", text: "识别出的文字" },
  ]);
});

test("图片下方已有文字时会保留原文并把识别结果放在前面", () => {
  const blocks = [
    { id: "image", type: "image", imageId: "image-1" },
    { id: "after", type: "text", text: "原来写下的感想" },
  ];
  const updated = insertTextAfterImageBlock(blocks, "image-1", "书页摘录", "new-text");

  assert.equal(updated[1].type === "text" && updated[1].text, "书页摘录\n\n原来写下的感想");
  assert.equal(blocks[1].type === "text" && blocks[1].text, "原来写下的感想");
});

test("图片后没有文字块时会创建新的文字块", () => {
  const blocks = [{ id: "image", type: "image", imageId: "image-1" }];
  const updated = insertTextAfterImageBlock(blocks, "image-1", "识别内容", "new-text");

  assert.deepEqual(updated[1], { id: "new-text", type: "text", text: "识别内容" });
});

test("快速记录会创建可立即输入正文的空白笔记", () => {
  const now = new Date("2026-08-06T08:00:00+08:00").getTime();
  const note = createQuickNote(now);

  assert.equal(note.type, "book");
  assert.equal(note.title, "");
  assert.equal(note.source, "");
  assert.equal(note.content, "");
  assert.deepEqual(note.tags, []);
  assert.equal(note.createdAt, now);
});

test("搜索可匹配标题、正文和标签，并遵守类型筛选", () => {
  const book = DEFAULT_NOTES[0];
  assert.equal(matchesNote(book, "勇气", "all"), true);
  assert.equal(matchesNote(book, "课题分离", "book"), true);
  assert.equal(matchesNote(book, "心理学", "all"), true);
  assert.equal(matchesNote(book, "勇气", "video"), false);
  assert.equal(matchesNote(book, "不存在的内容", "all"), false);
});

test("思维导图节点可修改、添加和删除，且不改动原数据", () => {
  const original = DEFAULT_NOTES[0].mindMap;
  const target = original.children[0];
  const renamed = updateMindNode(original, target.id, "新的核心观点");
  assert.equal(renamed.children[0].text, "新的核心观点");
  assert.notEqual(renamed, original);
  assert.equal(original.children[0].text, "核心观点");

  const added = addMindChild(renamed, target.id);
  assert.equal(added.children[0].children.length, target.children.length + 1);
  const addedId = added.children[0].children.at(-1).id;
  const deleted = deleteMindNode(added, addedId);
  assert.equal(deleted.children[0].children.length, target.children.length);
});

test("更新时间可正确显示今天、昨天和日期", () => {
  const now = new Date("2026-08-05T16:00:00+08:00").getTime();
  assert.equal(formatUpdatedAt(new Date("2026-08-05T09:30:00+08:00").getTime(), now), "09:30");
  assert.equal(formatUpdatedAt(new Date("2026-08-04T09:30:00+08:00").getTime(), now), "昨天");
  assert.match(formatUpdatedAt(new Date("2026-07-20T09:30:00+08:00").getTime(), now), /7.*20/);
});
