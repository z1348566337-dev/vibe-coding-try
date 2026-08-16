import assert from "node:assert/strict";
import test from "node:test";
import {
  BACKUP_KIND,
  BACKUP_VERSION,
  createBackupFilename,
  mergeNotes,
  parseBackup,
  serializeBackup,
} from "../app/lib/backup.ts";
import { DEFAULT_NOTES } from "../app/lib/notes.ts";

test("导出文件包含应用标识、版本和全部笔记", () => {
  const exportedAt = new Date("2026-08-06T10:00:00+08:00").getTime();
  const backup = JSON.parse(serializeBackup(DEFAULT_NOTES, exportedAt));

  assert.equal(backup.kind, BACKUP_KIND);
  assert.equal(backup.version, BACKUP_VERSION);
  assert.equal(backup.notes.length, DEFAULT_NOTES.length);
  assert.deepEqual(backup.images, []);
  assert.equal(createBackupFilename(exportedAt), "杰森笔记备份-2026-08-06.json");
});

test("新版备份会包含图片，旧版无图片备份仍可恢复", () => {
  const image = {
    id: "image-1",
    noteId: DEFAULT_NOTES[0].id,
    dataUrl: "data:image/jpeg;base64,AA==",
    mimeType: "image/jpeg",
    createdAt: 123,
  };
  const parsed = parseBackup(serializeBackup(DEFAULT_NOTES, 456, [image]));
  assert.deepEqual(parsed.images, [image]);

  const oldBackup = JSON.parse(serializeBackup(DEFAULT_NOTES, 456));
  oldBackup.version = 1;
  delete oldBackup.images;
  assert.deepEqual(parseBackup(JSON.stringify(oldBackup)).images, []);
});

test("有效备份可以解析，并自动保留重复笔记中的较新版本", () => {
  const older = { ...DEFAULT_NOTES[0], updatedAt: 100, content: "旧内容" };
  const newer = { ...DEFAULT_NOTES[0], updatedAt: 200, content: "新内容" };
  const text = serializeBackup([older, newer], new Date("2026-08-06T10:00:00+08:00").getTime());
  const parsed = parseBackup(text);

  assert.equal(parsed.notes.length, 1);
  assert.equal(parsed.notes[0].content, "新内容");
});

test("恢复时只新增缺少的笔记，并用备份中的较新版本更新", () => {
  const current = [
    { ...DEFAULT_NOTES[0], updatedAt: 300, content: "本地较新" },
    { ...DEFAULT_NOTES[1], updatedAt: 100, content: "本地较旧" },
  ];
  const incoming = [
    { ...DEFAULT_NOTES[0], updatedAt: 200, content: "备份较旧" },
    { ...DEFAULT_NOTES[1], updatedAt: 400, content: "备份较新" },
    { ...DEFAULT_NOTES[0], id: "new-note", updatedAt: 500, content: "新增内容" },
  ];
  const result = mergeNotes(current, incoming);

  assert.deepEqual(result.stats, { added: 1, updated: 1, unchanged: 1 });
  assert.equal(result.notes.find((note) => note.id === DEFAULT_NOTES[0].id)?.content, "本地较新");
  assert.equal(result.notes.find((note) => note.id === DEFAULT_NOTES[1].id)?.content, "备份较新");
  assert.equal(result.notes.some((note) => note.id === "new-note"), true);
});

test("损坏文件、其他应用文件和不支持的版本会被拒绝", () => {
  assert.throws(() => parseBackup("not-json"), /有效的 JSON/);
  assert.throws(() => parseBackup(JSON.stringify({ notes: [] })), /不是杰森笔记/);

  const unsupported = JSON.parse(serializeBackup(DEFAULT_NOTES));
  unsupported.version = 999;
  assert.throws(() => parseBackup(JSON.stringify(unsupported)), /版本暂不支持/);

  const damaged = JSON.parse(serializeBackup(DEFAULT_NOTES));
  damaged.notes[0].mindMap = null;
  assert.throws(() => parseBackup(JSON.stringify(damaged)), /不完整或已损坏/);
});
