import type { MindNode, Note } from "./notes";
import type { StoredImage } from "./image-store";

export const BACKUP_KIND = "jason-notes-backup";
export const BACKUP_VERSION = 2;

export type NotesBackup = {
  kind: typeof BACKUP_KIND;
  app: "杰森笔记";
  version: 1 | typeof BACKUP_VERSION;
  exportedAt: string;
  notes: Note[];
  images: StoredImage[];
};

export type MergeStats = {
  added: number;
  updated: number;
  unchanged: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function isMindNode(value: unknown, depth = 0): value is MindNode {
  if (depth > 30 || !isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.text === "string" &&
    Array.isArray(value.children) &&
    value.children.every((child) => isMindNode(child, depth + 1))
  );
}

function isNote(value: unknown): value is Note {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.title === "string" &&
    typeof value.source === "string" &&
    (value.type === "book" || value.type === "video") &&
    typeof value.rating === "number" &&
    Number.isInteger(value.rating) &&
    value.rating >= 0 &&
    value.rating <= 5 &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === "string") &&
    typeof value.content === "string" &&
    (value.images === undefined ||
      (Array.isArray(value.images) &&
        value.images.every(
          (image) =>
            isRecord(image) &&
            typeof image.id === "string" &&
            typeof image.caption === "string" &&
            typeof image.createdAt === "number",
        ))) &&
    isMindNode(value.mindMap) &&
    typeof value.createdAt === "number" &&
    Number.isFinite(value.createdAt) &&
    typeof value.updatedAt === "number" &&
    Number.isFinite(value.updatedAt)
  );
}

function isStoredImage(value: unknown): value is StoredImage {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.noteId === "string" &&
    typeof value.dataUrl === "string" &&
    value.dataUrl.startsWith("data:image/") &&
    typeof value.mimeType === "string" &&
    value.mimeType.startsWith("image/") &&
    typeof value.createdAt === "number" &&
    Number.isFinite(value.createdAt)
  );
}

export function createBackup(notes: Note[], exportedAt = Date.now(), images: StoredImage[] = []): NotesBackup {
  return {
    kind: BACKUP_KIND,
    app: "杰森笔记",
    version: BACKUP_VERSION,
    exportedAt: new Date(exportedAt).toISOString(),
    notes,
    images,
  };
}

export function serializeBackup(notes: Note[], exportedAt = Date.now(), images: StoredImage[] = []) {
  return JSON.stringify(createBackup(notes, exportedAt, images), null, 2);
}

export function parseBackup(text: string): NotesBackup {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("备份文件不是有效的 JSON 文件。");
  }

  if (!isRecord(value) || value.kind !== BACKUP_KIND || value.app !== "杰森笔记") {
    throw new Error("这不是杰森笔记生成的备份文件。");
  }
  if (value.version !== 1 && value.version !== BACKUP_VERSION) {
    throw new Error("该备份版本暂不支持，请使用最新版杰森笔记恢复。");
  }
  if (
    typeof value.exportedAt !== "string" ||
    Number.isNaN(Date.parse(value.exportedAt)) ||
    !Array.isArray(value.notes) ||
    !value.notes.every(isNote) ||
    (value.version === BACKUP_VERSION &&
      (!Array.isArray(value.images) || !value.images.every(isStoredImage)))
  ) {
    throw new Error("备份文件内容不完整或已损坏。");
  }

  const latestById = new Map<string, Note>();
  for (const note of value.notes) {
    const existing = latestById.get(note.id);
    if (!existing || note.updatedAt > existing.updatedAt) latestById.set(note.id, note);
  }

  return {
    kind: BACKUP_KIND,
    app: "杰森笔记",
    version: value.version,
    exportedAt: value.exportedAt,
    notes: [...latestById.values()],
    images: value.version === 1 ? [] : value.images,
  };
}

export function mergeNotes(existing: Note[], incoming: Note[]) {
  const merged = new Map(existing.map((note) => [note.id, note]));
  const stats: MergeStats = { added: 0, updated: 0, unchanged: 0 };

  for (const note of incoming) {
    const current = merged.get(note.id);
    if (!current) {
      merged.set(note.id, note);
      stats.added += 1;
    } else if (note.updatedAt > current.updatedAt) {
      merged.set(note.id, note);
      stats.updated += 1;
    } else {
      stats.unchanged += 1;
    }
  }

  return { notes: [...merged.values()], stats };
}

export function createBackupFilename(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "00";
  return `杰森笔记备份-${part("year")}-${part("month")}-${part("day")}.json`;
}
