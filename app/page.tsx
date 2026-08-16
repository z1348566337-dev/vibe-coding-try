"use client";
/* eslint-disable @next/next/no-img-element -- 图片来自本机 IndexedDB 的 data URL，无法使用远程图片优化器。 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createBackupFilename,
  mergeNotes,
  parseBackup,
  serializeBackup,
  type NotesBackup,
} from "./lib/backup";
import {
  buildMindMapPrintHtml,
  buildNotePrintHtml,
  canvasToPngFile,
  createExportBaseName,
  noteToMarkdown,
  noteToPlainText,
  openPrintPreview,
  renderMindMapCanvas,
} from "./lib/export";
import {
  deleteImagesForNote,
  deleteStoredImage,
  getAllStoredImages,
  replaceStoredImagesForNotes,
  saveStoredImage,
  type StoredImage,
} from "./lib/image-store";
import {
  DEFAULT_IMAGE_TRANSFORM,
  processImageDataUrl,
  processImageFile,
  type ImageTransform,
} from "./lib/image-processing";
import {
  DEFAULT_NOTES,
  addMindChild,
  createNote,
  createQuickNote,
  contentBlocksToText,
  deleteMindNode,
  formatUpdatedAt,
  insertTextAfterImageBlock,
  matchesNote,
  mergeAdjacentTextBlocks,
  migrateNoteContent,
  removeImageFromContentBlocks,
  updateMindNode,
  type MindNode,
  type Note,
  type NoteContentBlock,
  type NoteImage,
  type NoteType,
} from "./lib/notes";
import {
  recognizeImageText,
  type OcrLanguage,
  type OcrProgress,
} from "./lib/ocr";

const STORAGE_KEY = "inspiration-notes-v1";
const MAX_BACKUP_BYTES = 100 * 1024 * 1024;

const createImageId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `image-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createImageMetadata = () => ({ id: createImageId(), createdAt: Date.now() });

type ImportPreview = {
  fileName: string;
  backup: NotesBackup;
  result: ReturnType<typeof mergeNotes>;
};

type EditingImage = {
  image: NoteImage;
  dataUrl: string;
};

function MindMapBranch({
  node,
  isRoot = false,
  onRename,
  onAdd,
  onDelete,
}: {
  node: MindNode;
  isRoot?: boolean;
  onRename: (id: string, text: string) => void;
  onAdd: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <li className={isRoot ? "mind-root" : ""}>
      <div className="mind-node-wrap">
        <input
          className="mind-node"
          aria-label={isRoot ? "中心主题" : "分支主题"}
          value={node.text}
          onChange={(event) => onRename(node.id, event.target.value)}
        />
        <div className="node-actions">
          <button type="button" onClick={() => onAdd(node.id)} title="添加子主题">
            ＋
          </button>
          {!isRoot && (
            <button
              type="button"
              className="node-delete"
              onClick={() => onDelete(node.id)}
              title="删除此分支"
            >
              ×
            </button>
          )}
        </div>
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <MindMapBranch
              key={child.id}
              node={child}
              onRename={onRename}
              onAdd={onAdd}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function Home() {
  const [notes, setNotes] = useState<Note[]>(DEFAULT_NOTES);
  const [selectedId, setSelectedId] = useState(DEFAULT_NOTES[0].id);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | NoteType>("all");
  const [view, setView] = useState<"writing" | "mindmap">("writing");
  const [tagDraft, setTagDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [saveState, setSaveState] = useState("已保存");
  const [pendingDelete, setPendingDelete] = useState(false);
  const [dataDialogOpen, setDataDialogOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [dataMessage, setDataMessage] = useState("");
  const [dataError, setDataError] = useState("");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [exportError, setExportError] = useState("");
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [imageMessage, setImageMessage] = useState("");
  const [imageError, setImageError] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [editingImage, setEditingImage] = useState<EditingImage | null>(null);
  const [imageTransform, setImageTransform] = useState<ImageTransform>(DEFAULT_IMAGE_TRANSFORM);
  const [ocrTarget, setOcrTarget] = useState<EditingImage | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [ocrProgress, setOcrProgress] = useState<OcrProgress>({
    status: "正在准备本机识别",
    progress: 0,
  });
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const [ocrLanguage, setOcrLanguage] = useState<OcrLanguage>("chi_sim");
  const writingAreaRef = useRef<HTMLTextAreaElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const pendingImageInsertRef = useRef<{ blockId: string; offset: number } | null>(null);
  const textCaretRef = useRef<Record<string, number>>({});
  const ocrRequestIdRef = useRef(0);

  useEffect(() => {
    const hydrateTimer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        const parsed = saved ? (JSON.parse(saved) as Note[]) : DEFAULT_NOTES;
        const validNotes = (Array.isArray(parsed) ? parsed : DEFAULT_NOTES).map(migrateNoteContent);
        setNotes(validNotes);
        setSelectedId(validNotes[0]?.id ?? "");
      } catch {
        setNotes(DEFAULT_NOTES.map(migrateNoteContent));
        setSelectedId(DEFAULT_NOTES[0].id);
      }
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(hydrateTimer);
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const registerServiceWorker = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };

    if (document.readyState === "complete") {
      registerServiceWorker();
      return;
    }

    window.addEventListener("load", registerServiceWorker, { once: true });
    return () => window.removeEventListener("load", registerServiceWorker);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
      setSaveState("已保存");
    }, 220);
    return () => window.clearTimeout(timer);
  }, [notes, loaded]);

  useEffect(() => {
    getAllStoredImages()
      .then((images) => setImageUrls(Object.fromEntries(images.map((image) => [image.id, image.dataUrl]))))
      .catch(() => setImageError("本地图片库暂时无法读取，请重新打开应用。"));
  }, []);

  const visibleNotes = useMemo(
    () =>
      [...notes]
        .filter((note) => matchesNote(note, query, filter))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [notes, query, filter],
  );

  const current = notes.find((note) => note.id === selectedId) ?? null;

  const updateCurrent = (patch: Partial<Note>) => {
    if (!current) return;
    setSaveState("保存中…");
    setNotes((items) =>
      items.map((note) =>
        note.id === current.id ? { ...note, ...patch, updatedAt: Date.now() } : note,
      ),
    );
  };

  const handleCreate = (type: NoteType) => {
    const note = createNote(type);
    setSaveState("保存中…");
    setNotes((items) => [note, ...items]);
    setSelectedId(note.id);
    setFilter("all");
    setQuery("");
    setView("writing");
    setSidebarOpen(false);
  };

  const handleQuickCapture = () => {
    const note = createQuickNote();
    setSaveState("保存中…");
    setNotes((items) => [note, ...items]);
    setSelectedId(note.id);
    setFilter("all");
    setQuery("");
    setView("writing");
    setSidebarOpen(false);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => writingAreaRef.current?.focus());
    });
  };

  const updateContentBlocks = (contentBlocks: NoteContentBlock[]) => {
    const mergedBlocks = mergeAdjacentTextBlocks(contentBlocks);
    updateCurrent({ contentBlocks: mergedBlocks, content: contentBlocksToText(mergedBlocks) });
  };

  const updateTextBlock = (blockId: string, text: string) => {
    if (!current) return;
    updateContentBlocks(
      (current.contentBlocks ?? []).map((block) =>
        block.id === blockId && block.type === "text" ? { ...block, text } : block,
      ),
    );
  };

  const addTextBlockAfter = (blockId: string) => {
    if (!current) return;
    const blocks = [...(current.contentBlocks ?? [])];
    const index = blocks.findIndex((block) => block.id === blockId);
    if (index < 0) return;
    const textBlock: NoteContentBlock = { id: `${createImageId()}-text`, type: "text", text: "" };
    blocks.splice(index + 1, 0, textBlock);
    updateContentBlocks(blocks);
  };

  const prepareImageInsert = (blockId: string, source: "gallery" | "camera") => {
    const block = current?.contentBlocks?.find((item) => item.id === blockId);
    pendingImageInsertRef.current = {
      blockId,
      offset: block?.type === "text" ? (textCaretRef.current[blockId] ?? block.text.length) : 0,
    };
    if (source === "gallery") galleryInputRef.current?.click();
    else cameraInputRef.current?.click();
  };

  const downloadFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const handleExportBackup = async () => {
    setDataError("");
    setDataMessage("");
    const fileName = createBackupFilename();
    let storedImages: StoredImage[] = [];
    try {
      storedImages = await getAllStoredImages();
      const referencedIds = new Set(notes.flatMap((note) => (note.images ?? []).map((image) => image.id)));
      storedImages = storedImages.filter((image) => referencedIds.has(image.id));
    } catch {
      setDataError("读取本地图片失败，暂时无法生成完整备份。");
      return;
    }
    const file = new File([serializeBackup(notes, Date.now(), storedImages)], fileName, { type: "application/json" });

    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "杰森笔记备份",
          text: `${notes.length} 篇笔记的本地备份`,
          files: [file],
        });
        setDataMessage("备份文件已生成，请确认已保存到“文件”App。");
      } else {
        downloadFile(file);
        setDataMessage(`已导出 ${fileName}`);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      downloadFile(file);
      setDataMessage(`已导出 ${fileName}`);
    }
  };

  const handleBackupFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setDataError("");
    setDataMessage("");
    setImportPreview(null);

    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error("备份文件超过 100 MB，无法导入。");
      const backup = parseBackup(await file.text());
      setImportPreview({ fileName: file.name, backup, result: mergeNotes(notes, backup.notes) });
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "无法读取该备份文件。");
    } finally {
      input.value = "";
    }
  };

  const applyImport = async () => {
    if (!importPreview) return;
    const mergedNotes = importPreview.result.notes;
    const acceptedNoteIds = new Set(
      importPreview.backup.notes
        .filter((incoming) => {
          const existing = notes.find((note) => note.id === incoming.id);
          return !existing || incoming.updatedAt > existing.updatedAt;
        })
        .map((note) => note.id),
    );
    const referencedImageIds = new Set(
      mergedNotes.flatMap((note) => (note.images ?? []).map((image) => image.id)),
    );
    const acceptedImages = importPreview.backup.images.filter(
      (image) => acceptedNoteIds.has(image.noteId) && referencedImageIds.has(image.id),
    );

    try {
      await replaceStoredImagesForNotes([...acceptedNoteIds], acceptedImages);
      const storedImages = await getAllStoredImages();
      setImageUrls(Object.fromEntries(storedImages.map((image) => [image.id, image.dataUrl])));
      setNotes(mergedNotes.map(migrateNoteContent));
    } catch {
      setDataError("恢复图片时发生错误，笔记尚未合并，请重试。");
      return;
    }
    setSelectedId((id) =>
      mergedNotes.some((note) => note.id === id)
        ? id
        : [...mergedNotes].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id ?? "",
    );
    setSaveState("保存中…");
    setImportPreview(null);
    setDataError("");
    setDataMessage(
      `恢复完成：新增 ${importPreview.result.stats.added} 篇，更新 ${importPreview.result.stats.updated} 篇。`,
    );
  };

  const openDataDialog = () => {
    setDataDialogOpen(true);
    setImportPreview(null);
    setDataMessage("");
    setDataError("");
  };

  const openExportDialog = () => {
    setExportDialogOpen(true);
    setExportMessage("");
    setExportError("");
  };

  const shareOrDownload = async (file: File, successMessage: string) => {
    setExportMessage("");
    setExportError("");
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: file.name, files: [file] });
        setExportMessage("文件已生成，请确认已经分享或保存。");
      } else {
        downloadFile(file);
        setExportMessage(successMessage);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      downloadFile(file);
      setExportMessage(successMessage);
    }
  };

  const exportMarkdown = () => {
    if (!current) return;
    const fileName = `${createExportBaseName(current)}.md`;
    void shareOrDownload(
      new File([noteToMarkdown(current)], fileName, { type: "text/markdown;charset=utf-8" }),
      `已导出 ${fileName}`,
    );
  };

  const exportPlainText = () => {
    if (!current) return;
    const fileName = `${createExportBaseName(current)}.txt`;
    void shareOrDownload(
      new File([noteToPlainText(current)], fileName, { type: "text/plain;charset=utf-8" }),
      `已导出 ${fileName}`,
    );
  };

  const exportMindMapPng = () => {
    if (!current) return;
    setExportMessage("");
    setExportError("");
    try {
      const canvas = renderMindMapCanvas(current.mindMap);
      const fileName = `${createExportBaseName(current)}-思维导图.png`;
      void shareOrDownload(canvasToPngFile(canvas, fileName), `已导出 ${fileName}`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "无法生成思维导图图片。");
    }
  };

  const exportNotePdf = () => {
    if (!current) return;
    setExportMessage("");
    setExportError("");
    try {
      const images = (current.images ?? [])
        .map((image) => ({ id: image.id, dataUrl: imageUrls[image.id], caption: image.caption }))
        .filter((image) => Boolean(image.dataUrl));
      openPrintPreview(buildNotePrintHtml(current, images));
      setExportMessage("已打开系统打印预览，可从预览中保存或分享 PDF。");
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "无法打开 PDF 打印预览。");
    }
  };

  const exportMindMapPdf = () => {
    if (!current) return;
    setExportMessage("");
    setExportError("");
    try {
      const canvas = renderMindMapCanvas(current.mindMap);
      openPrintPreview(buildMindMapPrintHtml(current, canvas.toDataURL("image/png")));
      setExportMessage("已打开横向打印预览，可从预览中保存或分享 PDF。");
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "无法生成思维导图 PDF。");
    }
  };

  const confirmDelete = () => {
    if (!current) return;
    const remaining = notes.filter((note) => note.id !== current.id);
    setSaveState("保存中…");
    setNotes(remaining);
    setSelectedId(remaining[0]?.id ?? "");
    setPendingDelete(false);
    void deleteImagesForNote(current.id);
    setImageUrls((urls) => {
      const next = { ...urls };
      (current.images ?? []).forEach((image) => delete next[image.id]);
      return next;
    });
  };

  const handleImageFiles = async (files: FileList | null) => {
    if (!current || !files?.length) return;
    const remainingSlots = 20 - (current.images?.length ?? 0);
    if (remainingSlots <= 0) {
      setImageError("每篇笔记最多插入 20 张图片。");
      return;
    }
    const selected = [...files].slice(0, remainingSlots);
    setImageBusy(true);
    setImageError("");
    setImageMessage("");
    try {
      const additions: NoteImage[] = [];
      const stored: StoredImage[] = [];
      for (const file of selected) {
        const processed = await processImageFile(file);
        const { id: imageId, createdAt } = createImageMetadata();
        additions.push({ id: imageId, caption: "", createdAt });
        stored.push({ id: imageId, noteId: current.id, dataUrl: processed.dataUrl, mimeType: processed.mimeType, createdAt });
      }
      await Promise.all(stored.map(saveStoredImage));
      const blocks = [...(current.contentBlocks ?? [])];
      const pendingInsert = pendingImageInsertRef.current;
      const requestedIndex = blocks.findIndex((block) => block.id === pendingInsert?.blockId);
      let insertionIndex = requestedIndex >= 0 ? requestedIndex + 1 : blocks.length;
      const requestedBlock = blocks[requestedIndex];
      if (pendingInsert && requestedBlock?.type === "text") {
        const offset = Math.max(0, Math.min(requestedBlock.text.length, pendingInsert.offset));
        const afterText = requestedBlock.text.slice(offset);
        blocks[requestedIndex] = { ...requestedBlock, text: requestedBlock.text.slice(0, offset) };
        blocks.splice(requestedIndex + 1, 0, {
          id: `${createImageId()}-text`,
          type: "text",
          text: afterText,
        });
        insertionIndex = requestedIndex + 1;
      }
      const imageBlocks: NoteContentBlock[] = additions.map((image) => ({
        id: `${image.id}-block`,
        type: "image",
        imageId: image.id,
      }));
      blocks.splice(insertionIndex, 0, ...imageBlocks);
      const followingBlock = blocks[insertionIndex + imageBlocks.length];
      if (!followingBlock || followingBlock.type !== "text") {
        blocks.splice(insertionIndex + imageBlocks.length, 0, {
          id: `${createImageId()}-text`,
          type: "text",
          text: "",
        });
      }
      const mergedBlocks = mergeAdjacentTextBlocks(blocks);
      updateCurrent({
        images: [...(current.images ?? []), ...additions],
        contentBlocks: mergedBlocks,
        content: contentBlocksToText(mergedBlocks),
      });
      setImageUrls((urls) => ({ ...urls, ...Object.fromEntries(stored.map((image) => [image.id, image.dataUrl])) }));
      setImageMessage(`已添加 ${additions.length} 张图片。`);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "图片处理失败，请换一张重试。");
    } finally {
      setImageBusy(false);
      if (galleryInputRef.current) galleryInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      pendingImageInsertRef.current = null;
    }
  };

  const updateImageCaption = (imageId: string, caption: string) => {
    if (!current) return;
    updateCurrent({
      images: (current.images ?? []).map((image) => (image.id === imageId ? { ...image, caption } : image)),
    });
  };

  const moveContentBlock = (blockId: string, direction: -1 | 1) => {
    if (!current) return;
    const blocks = [...(current.contentBlocks ?? [])];
    const index = blocks.findIndex((block) => block.id === blockId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= blocks.length) return;
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    updateContentBlocks(blocks);
  };

  const removeImage = async (imageId: string) => {
    if (!current) return;
    if (!window.confirm("删除这张图片？此操作无法撤销。")) return;
    try {
      await deleteStoredImage(imageId);
      const blocks = removeImageFromContentBlocks(current.contentBlocks ?? [], imageId);
      updateCurrent({
        images: (current.images ?? []).filter((image) => image.id !== imageId),
        contentBlocks: blocks,
        content: contentBlocksToText(blocks),
      });
      setImageUrls((urls) => {
        const next = { ...urls };
        delete next[imageId];
        return next;
      });
      setImageMessage("图片已删除。");
      setImageError("");
    } catch {
      setImageError("图片删除失败，请重试。");
    }
  };

  const startEditingImage = (image: NoteImage) => {
    const dataUrl = imageUrls[image.id];
    if (!dataUrl) return;
    setEditingImage({ image, dataUrl });
    setImageTransform(DEFAULT_IMAGE_TRANSFORM);
    setImageError("");
  };

  const applyImageEdit = async () => {
    if (!current || !editingImage) return;
    setImageBusy(true);
    try {
      const processed = await processImageDataUrl(editingImage.dataUrl, imageTransform);
      const stored: StoredImage = {
        id: editingImage.image.id,
        noteId: current.id,
        dataUrl: processed.dataUrl,
        mimeType: processed.mimeType,
        createdAt: editingImage.image.createdAt,
      };
      await saveStoredImage(stored);
      setImageUrls((urls) => ({ ...urls, [stored.id]: stored.dataUrl }));
      setEditingImage(null);
      updateCurrent({ images: [...(current.images ?? [])] });
      setImageMessage("图片处理已保存。");
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "无法保存图片处理结果。");
    } finally {
      setImageBusy(false);
    }
  };

  const runOcr = async (target: EditingImage, language: OcrLanguage = ocrLanguage) => {
    const requestId = ++ocrRequestIdRef.current;
    setOcrBusy(true);
    setOcrError("");
    setOcrText("");
    setOcrProgress({ status: "正在准备本机识别", progress: 0 });
    try {
      const text = await recognizeImageText(
        target.dataUrl,
        (progress) => {
          if (ocrRequestIdRef.current === requestId) setOcrProgress(progress);
        },
        language,
      );
      if (ocrRequestIdRef.current !== requestId) return;
      if (!text) {
        setOcrError("没有识别到清晰文字。可以先裁剪、旋转或开启“文档增强”后再试。");
        return;
      }
      setOcrText(text);
      setOcrProgress({ status: "识别完成，可以校对文字", progress: 1 });
    } catch {
      if (ocrRequestIdRef.current !== requestId) return;
      setOcrError("文字识别失败。请检查网络后重试；首次使用需要下载中英文识别模型。");
    } finally {
      if (ocrRequestIdRef.current === requestId) setOcrBusy(false);
    }
  };

  const startOcr = (image: NoteImage) => {
    const dataUrl = imageUrls[image.id];
    if (!dataUrl) return;
    const target = { image, dataUrl };
    setOcrTarget(target);
    void runOcr(target);
  };

  const closeOcr = () => {
    ocrRequestIdRef.current += 1;
    setOcrTarget(null);
    setOcrText("");
    setOcrError("");
    setOcrBusy(false);
  };

  const insertOcrText = () => {
    if (!current || !ocrTarget || !ocrText.trim()) return;
    const blocks = insertTextAfterImageBlock(
      current.contentBlocks ?? [],
      ocrTarget.image.id,
      ocrText,
      `${createImageId()}-text`,
    );
    updateContentBlocks(blocks);
    setImageMessage("识别文字已插入图片下方。");
    closeOcr();
  };

  const addTag = () => {
    const tag = tagDraft.trim().replace(/^#/, "");
    if (!current || !tag || current.tags.includes(tag)) return;
    updateCurrent({ tags: [...current.tags, tag] });
    setTagDraft("");
  };

  const wordCount = current ? contentBlocksToText(current.contentBlocks ?? []).replace(/\s/g, "").length : 0;

  return (
    <main className="app-shell">
      <div
        className={`mobile-overlay ${sidebarOpen ? "show" : ""}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} aria-label="笔记列表">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">
            <span />
          </div>
          <div>
            <strong>杰森笔记</strong>
          </div>
          <button className="close-sidebar" onClick={() => setSidebarOpen(false)} aria-label="关闭笔记列表">
            ×
          </button>
        </div>

        <div className="create-row">
          <button className="create-primary" onClick={() => handleCreate("book")}>
            <span aria-hidden="true">＋</span> 新建读后感
          </button>
          <button className="create-secondary" onClick={() => handleCreate("video")} title="新建观后感">
            影
          </button>
        </div>

        <label className="search-box">
          <span aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索作品、标签或内容…"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="清空搜索">
              ×
            </button>
          )}
        </label>

        <div className="filters" aria-label="笔记类型筛选">
          {([
            ["all", "全部"],
            ["book", "书籍"],
            ["video", "视频"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
              <small>
                {value === "all" ? notes.length : notes.filter((note) => note.type === value).length}
              </small>
            </button>
          ))}
        </div>

        <div className="note-list">
          {visibleNotes.length ? (
            visibleNotes.map((note) => (
              <button
                className={`note-card ${selectedId === note.id ? "selected" : ""}`}
                key={note.id}
                onClick={() => {
                  setSelectedId(note.id);
                  setSidebarOpen(false);
                }}
              >
                <div className="note-card-top">
                  <span className={`type-dot ${note.type}`} />
                  <span className="note-title">{note.title || "未命名笔记"}</span>
                  <time>{formatUpdatedAt(note.updatedAt)}</time>
                </div>
                <p>{note.content || "还没有写下内容…"}</p>
                <div className="note-tags">
                  <span>{note.type === "book" ? "读后感" : "观后感"}</span>
                  {note.tags.slice(0, 2).map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
              </button>
            ))
          ) : (
            <div className="empty-list">
              <span>⌕</span>
              <p>没有找到匹配的笔记</p>
              <button onClick={() => { setQuery(""); setFilter("all"); }}>清除筛选</button>
            </div>
          )}
        </div>

        <button className="data-manage-button" onClick={openDataDialog} disabled={!loaded}>
          <span aria-hidden="true">⇅</span>
          数据管理
        </button>
        <div className="local-note">
          <span className="status-dot" />
          内容仅保存在此浏览器
        </div>
      </aside>

      <section className="workspace">
        <div className="mobile-bar">
          <button onClick={() => setSidebarOpen(true)} aria-label="打开笔记列表">☰</button>
          <strong>杰森笔记</strong>
          <span>{saveState}</span>
        </div>

        {current ? (
          <>
            <header className="editor-header">
              <div className="editor-location">
                <span>{current.type === "book" ? "书籍" : "视频"}</span>
                <b>/</b>
                <span>{current.type === "book" ? "读后感" : "观后感"}</span>
              </div>
              <div className="save-indicator">
                <span className={saveState === "已保存" ? "saved" : "saving"} />
                {saveState}
              </div>
              <button className="export-note" onClick={openExportDialog}>导出/分享</button>
              <button className="delete-note" onClick={() => setPendingDelete(true)}>删除笔记</button>
            </header>

            <div className="editor-scroll">
              <div className="editor-content">
                <div className="title-kicker">
                  <span className={`type-icon ${current.type}`}>{current.type === "book" ? "书" : "影"}</span>
                  <select
                    value={current.type}
                    onChange={(event) => updateCurrent({ type: event.target.value as NoteType })}
                    aria-label="笔记类型"
                  >
                    <option value="book">读后感</option>
                    <option value="video">观后感</option>
                  </select>
                </div>
                <input
                  className="title-input"
                  value={current.title}
                  onChange={(event) => updateCurrent({ title: event.target.value })}
                  placeholder="输入作品名称"
                  aria-label="作品名称"
                />

                <div className="metadata-grid">
                  <label>
                    <span>{current.type === "book" ? "作者" : "创作者"}</span>
                    <input
                      value={current.source}
                      onChange={(event) => updateCurrent({ source: event.target.value })}
                      placeholder={current.type === "book" ? "作者或出版社" : "导演或频道"}
                    />
                  </label>
                  <label>
                    <span>评分</span>
                    <select
                      value={current.rating}
                      onChange={(event) => updateCurrent({ rating: Number(event.target.value) })}
                    >
                      {[5, 4, 3, 2, 1, 0].map((score) => (
                        <option value={score} key={score}>{score ? `${"★".repeat(score)} ${score}.0` : "暂未评分"}</option>
                      ))}
                    </select>
                  </label>
                  <div className="tag-editor">
                    <span>标签</span>
                    <div>
                      {current.tags.map((tag) => (
                        <button
                          type="button"
                          key={tag}
                          title="点击移除标签"
                          onClick={() => updateCurrent({ tags: current.tags.filter((item) => item !== tag) })}
                        >
                          #{tag} <b>×</b>
                        </button>
                      ))}
                      <input
                        value={tagDraft}
                        onChange={(event) => setTagDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") { event.preventDefault(); addTag(); }
                        }}
                        onBlur={addTag}
                        placeholder="＋ 添加标签"
                        aria-label="添加标签"
                      />
                    </div>
                  </div>
                </div>

                <div className="mode-tabs">
                  <button className={view === "writing" ? "active" : ""} onClick={() => setView("writing")}>
                    <span className="pen-icon" /> 文字笔记
                  </button>
                  <button className={view === "mindmap" ? "active" : ""} onClick={() => setView("mindmap")}>
                    <span className="map-icon"><i /><i /><i /></span> 思维导图
                  </button>
                </div>

                {view === "writing" ? (
                  <div className="writing-area block-editor">
                    <div className="block-editor-tip">
                      <span>图文笔记</span>
                      <p>在文字段落下方插入图片，图片后可以继续书写。</p>
                      <strong>{current.images?.length ?? 0}/20 张</strong>
                    </div>
                    <div className="content-block-list">
                      {(current.contentBlocks ?? []).map((block, blockIndex, blocks) => {
                        if (block.type === "text") {
                          return (
                            <section className="text-content-block" key={block.id}>
                              <textarea
                                ref={blockIndex === 0 ? writingAreaRef : undefined}
                                value={block.text}
                                onChange={(event) => updateTextBlock(block.id, event.target.value)}
                                onSelect={(event) => {
                                  textCaretRef.current[block.id] = event.currentTarget.selectionStart;
                                }}
                                placeholder={blockIndex === 0
                                  ? "从这里开始记录…\n\n哪个情节或观点最触动你？它让你想到了什么？"
                                  : "继续写下你的想法…"}
                                aria-label={`正文第 ${blockIndex + 1} 段`}
                              />
                              <div className="insert-block-toolbar">
                                <span>在这里插入</span>
                                <button
                                  type="button"
                                  onClick={() => prepareImageInsert(block.id, "gallery")}
                                  disabled={imageBusy || (current.images?.length ?? 0) >= 20}
                                >
                                  ▧ 图片
                                </button>
                                <button
                                  type="button"
                                  className="scan-button"
                                  onClick={() => prepareImageInsert(block.id, "camera")}
                                  disabled={imageBusy || (current.images?.length ?? 0) >= 20}
                                >
                                  ⌁ 拍照扫描
                                </button>
                                {blockIndex > 0 && block.text.trim() === "" && (
                                  <button
                                    type="button"
                                    className="remove-text-block"
                                    onClick={() => updateContentBlocks(blocks.filter((item) => item.id !== block.id))}
                                  >
                                    删除空段
                                  </button>
                                )}
                              </div>
                            </section>
                          );
                        }

                        const image = (current.images ?? []).find((item) => item.id === block.imageId);
                        if (!image) return null;
                        return (
                          <figure className="inline-image-block" key={block.id}>
                            <button
                              type="button"
                              className="inline-image-preview"
                              onClick={() => startEditingImage(image)}
                              aria-label={`预览并处理图片 ${image.caption || blockIndex + 1}`}
                            >
                              {imageUrls[image.id] ? (
                                <img src={imageUrls[image.id]} alt={image.caption || "笔记插图"} />
                              ) : (
                                <span>图片加载中…</span>
                              )}
                            </button>
                            <input
                              value={image.caption}
                              onChange={(event) => updateImageCaption(image.id, event.target.value)}
                              placeholder="添加图片说明（可选）"
                              aria-label="图片说明"
                            />
                            <figcaption>
                              <div>
                                <button type="button" disabled={blockIndex === 0} onClick={() => moveContentBlock(block.id, -1)}>↑ 上移</button>
                                <button type="button" disabled={blockIndex === blocks.length - 1} onClick={() => moveContentBlock(block.id, 1)}>↓ 下移</button>
                                <button type="button" onClick={() => startEditingImage(image)}>处理图片</button>
                                <button
                                  type="button"
                                  onClick={() => startOcr(image)}
                                  disabled={!imageUrls[image.id]}
                                >
                                  识别文字
                                </button>
                                {blocks[blockIndex + 1]?.type !== "text" && (
                                  <button type="button" onClick={() => addTextBlockAfter(block.id)}>＋ 下方写文字</button>
                                )}
                              </div>
                              <button type="button" className="inline-image-delete" onClick={() => void removeImage(image.id)}>删除</button>
                            </figcaption>
                          </figure>
                        );
                      })}
                    </div>
                    <input
                      ref={galleryInputRef}
                      className="image-file-input"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(event) => void handleImageFiles(event.currentTarget.files)}
                    />
                    <input
                      ref={cameraInputRef}
                      className="image-file-input"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(event) => void handleImageFiles(event.currentTarget.files)}
                    />
                    {imageBusy && <p className="image-feedback success" role="status">正在处理图片…</p>}
                    {imageError && <p className="image-feedback error" role="alert">{imageError}</p>}
                    {imageMessage && <p className="image-feedback success" role="status">{imageMessage}</p>}
                    <div className="writing-footer">
                      <span>{wordCount} 字</span>
                      <span>最后编辑 {formatUpdatedAt(current.updatedAt)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="mindmap-panel">
                    <div className="mindmap-help">
                      <div>
                        <strong>把想法从中心主题向外展开</strong>
                        <p>直接修改节点文字，“＋”添加子主题，“×”删除分支。</p>
                      </div>
                      <button onClick={() => updateCurrent({ mindMap: { ...current.mindMap, text: current.title || "中心主题" } })}>
                        使用笔记标题
                      </button>
                    </div>
                    <div className="mindmap-stage">
                      <ul className="mind-tree">
                        <MindMapBranch
                          node={current.mindMap}
                          isRoot
                          onRename={(id, text) => updateCurrent({ mindMap: updateMindNode(current.mindMap, id, text) })}
                          onAdd={(id) => updateCurrent({ mindMap: addMindChild(current.mindMap, id) })}
                          onDelete={(id) => updateCurrent({ mindMap: deleteMindNode(current.mindMap, id) })}
                        />
                      </ul>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </>
        ) : (
          <div className="empty-workspace">
            <div className="empty-symbol"><span /></div>
            <h1>开始记录一次触动</h1>
            <p>选择左侧笔记，或新建一篇读后感。</p>
            <button onClick={() => handleCreate("book")}>新建读后感</button>
          </div>
        )}
      </section>

      <button
        className="quick-capture"
        type="button"
        onClick={handleQuickCapture}
        aria-label="快速记录一条想法"
      >
        <span aria-hidden="true">＋</span>
        速记
      </button>

      {pendingDelete && current && (
        <div className="dialog-backdrop" role="presentation" onClick={() => setPendingDelete(false)}>
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="dialog-mark" aria-hidden="true">!</span>
            <h2 id="delete-dialog-title">删除这篇笔记？</h2>
            <p>“{current.title || "未命名笔记"}”删除后无法恢复。</p>
            <div>
              <button className="dialog-cancel" onClick={() => setPendingDelete(false)}>取消</button>
              <button className="dialog-confirm" onClick={confirmDelete}>确认删除</button>
            </div>
          </section>
        </div>
      )}

      {dataDialogOpen && (
        <div className="dialog-backdrop" role="presentation" onClick={() => setDataDialogOpen(false)}>
          <section
            className="data-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="data-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span>本地数据</span>
                <h2 id="data-dialog-title">备份与恢复</h2>
              </div>
              <button type="button" onClick={() => setDataDialogOpen(false)} aria-label="关闭数据管理">
                ×
              </button>
            </header>

            <div className="data-action-card">
              <div>
                <strong>导出全部笔记</strong>
                <p>生成普通备份文件，可保存到 iPhone“文件”App或 iCloud Drive。</p>
              </div>
              <button type="button" className="data-primary" onClick={handleExportBackup}>
                导出备份
              </button>
            </div>

            <div className="data-action-card">
              <div>
                <strong>从备份恢复</strong>
                <p>导入前会检查文件并预览结果，不会用旧内容覆盖较新的笔记。</p>
              </div>
              <button type="button" className="data-secondary" onClick={() => backupInputRef.current?.click()}>
                选择文件
              </button>
              <input
                ref={backupInputRef}
                className="backup-file-input"
                type="file"
                accept=".json,application/json"
                onChange={handleBackupFile}
              />
            </div>

            {importPreview && (
              <div className="import-preview" aria-live="polite">
                <div>
                  <strong>可以恢复这个备份</strong>
                  <span>{importPreview.fileName}</span>
                </div>
                <dl>
                  <div><dt>备份时间</dt><dd>{new Date(importPreview.backup.exportedAt).toLocaleString("zh-CN")}</dd></div>
                  <div><dt>笔记数量</dt><dd>{importPreview.backup.notes.length} 篇</dd></div>
                  <div><dt>预计新增</dt><dd>{importPreview.result.stats.added} 篇</dd></div>
                  <div><dt>预计更新</dt><dd>{importPreview.result.stats.updated} 篇</dd></div>
                  <div><dt>保留现状</dt><dd>{importPreview.result.stats.unchanged} 篇</dd></div>
                </dl>
                <button
                  type="button"
                  onClick={applyImport}
                  disabled={importPreview.result.stats.added + importPreview.result.stats.updated === 0}
                >
                  {importPreview.result.stats.added + importPreview.result.stats.updated === 0
                    ? "没有需要恢复的内容"
                    : "确认合并到现有笔记"}
                </button>
              </div>
            )}

            {dataError && <p className="data-feedback error" role="alert">{dataError}</p>}
            {dataMessage && <p className="data-feedback success" role="status">{dataMessage}</p>}
            <p className="backup-privacy">备份文件未加密，包含完整笔记内容，请妥善保存。</p>
          </section>
        </div>
      )}

      {exportDialogOpen && current && (
        <div className="dialog-backdrop" role="presentation" onClick={() => setExportDialogOpen(false)}>
          <section
            className="data-dialog export-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span>当前笔记</span>
                <h2 id="export-dialog-title">导出与分享</h2>
              </div>
              <button type="button" onClick={() => setExportDialogOpen(false)} aria-label="关闭导出与分享">
                ×
              </button>
            </header>

            <div className="export-section">
              <div className="export-section-heading">
                <strong>笔记内容</strong>
                <p>包含作品信息、正文和思维导图大纲。</p>
              </div>
              <div className="export-grid">
                <button type="button" onClick={exportNotePdf}>
                  <span className="format-badge pdf">PDF</span>
                  <strong>阅读版 PDF</strong>
                  <small>进入系统打印与分享</small>
                </button>
                <button type="button" onClick={exportMarkdown}>
                  <span className="format-badge markdown">MD</span>
                  <strong>Markdown</strong>
                  <small>适合继续编辑和迁移</small>
                </button>
                <button type="button" onClick={exportPlainText}>
                  <span className="format-badge text">TXT</span>
                  <strong>纯文本</strong>
                  <small>兼容微信和备忘录</small>
                </button>
              </div>
            </div>

            <div className="export-section">
              <div className="export-section-heading">
                <strong>思维导图</strong>
                <p>自动展开完整层级，不包含编辑按钮。</p>
              </div>
              <div className="export-grid two-column">
                <button type="button" onClick={exportMindMapPng}>
                  <span className="format-badge image">PNG</span>
                  <strong>高清图片</strong>
                  <small>适合相册、微信和课件</small>
                </button>
                <button type="button" onClick={exportMindMapPdf}>
                  <span className="format-badge pdf">PDF</span>
                  <strong>横向 PDF</strong>
                  <small>适合打印和归档</small>
                </button>
              </div>
            </div>

            {exportError && <p className="data-feedback error" role="alert">{exportError}</p>}
            {exportMessage && <p className="data-feedback success" role="status">{exportMessage}</p>}
            <p className="backup-privacy">文件仅在当前设备生成，不会上传笔记内容。</p>
          </section>
        </div>
      )}

      {editingImage && (
        <div className="dialog-backdrop" role="presentation" onClick={() => setEditingImage(null)}>
          <section
            className="image-editor-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="image-editor-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span>基础扫描处理</span>
                <h2 id="image-editor-title">预览与调整</h2>
              </div>
              <button type="button" onClick={() => setEditingImage(null)} aria-label="关闭图片处理">×</button>
            </header>
            <div className="image-editor-preview">
              <img
                src={editingImage.dataUrl}
                alt={editingImage.image.caption || "待处理图片"}
                style={{
                  transform: `rotate(${imageTransform.rotation}deg)`,
                  filter: imageTransform.enhance ? "contrast(1.24) brightness(1.05)" : "none",
                }}
              />
            </div>
            <div className="image-editor-tools">
              <div className="image-tool-row">
                <button
                  type="button"
                  onClick={() => setImageTransform((value) => ({ ...value, rotation: ((value.rotation + 270) % 360) as ImageTransform["rotation"] }))}
                >
                  ↶ 左转
                </button>
                <button
                  type="button"
                  onClick={() => setImageTransform((value) => ({ ...value, rotation: ((value.rotation + 90) % 360) as ImageTransform["rotation"] }))}
                >
                  ↷ 右转
                </button>
                <button
                  type="button"
                  className={imageTransform.enhance ? "active" : ""}
                  onClick={() => setImageTransform((value) => ({ ...value, enhance: !value.enhance }))}
                >
                  文档增强
                </button>
              </div>
              <fieldset>
                <legend>裁剪边缘（百分比）</legend>
                {([
                  ["cropTop", "上"],
                  ["cropRight", "右"],
                  ["cropBottom", "下"],
                  ["cropLeft", "左"],
                ] as const).map(([key, label]) => (
                  <label key={key}>
                    <span>{label} {imageTransform[key]}%</span>
                    <input
                      type="range"
                      min="0"
                      max="35"
                      value={imageTransform[key]}
                      onChange={(event) => setImageTransform((value) => ({ ...value, [key]: Number(event.target.value) }))}
                    />
                  </label>
                ))}
              </fieldset>
              <p>裁剪会在保存时生效；可配合旋转和“文档增强”让书页更清晰。</p>
            </div>
            <footer>
              <button type="button" className="dialog-cancel" onClick={() => setEditingImage(null)}>取消</button>
              <button type="button" className="dialog-confirm" onClick={() => void applyImageEdit()} disabled={imageBusy}>
                {imageBusy ? "处理中…" : "保存处理结果"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {ocrTarget && (
        <div className="dialog-backdrop" role="presentation" onClick={closeOcr}>
          <section
            className="ocr-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ocr-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span>本机中英文识别</span>
                <h2 id="ocr-dialog-title">识别并校对文字</h2>
              </div>
              <button type="button" onClick={closeOcr} aria-label="关闭文字识别">×</button>
            </header>

            <div className="ocr-preview">
              <img src={ocrTarget.dataUrl} alt={ocrTarget.image.caption || "待识别图片"} />
            </div>

            <label className="ocr-language-picker">
              <span>识别语言</span>
              <select
                value={ocrLanguage}
                onChange={(event) => setOcrLanguage(event.target.value as OcrLanguage)}
                disabled={ocrBusy}
              >
                <option value="chi_sim">中文为主（推荐）</option>
                <option value="eng">英文为主</option>
              </select>
              <small>中文模型也能识别常见英文；纯英文页面请选择“英文为主”。</small>
            </label>

            {ocrBusy ? (
              <div className="ocr-running" role="status" aria-live="polite">
                <div className="ocr-progress-heading">
                  <strong>{ocrProgress.status}</strong>
                  <span>{Math.round(ocrProgress.progress * 100)}%</span>
                </div>
                <div className="ocr-progress-track" aria-hidden="true">
                  <span style={{ width: `${Math.max(4, ocrProgress.progress * 100)}%` }} />
                </div>
                <p>首次使用会下载中英文模型，可能需要稍等；以后会使用浏览器缓存。</p>
              </div>
            ) : (
              <label className="ocr-result">
                <span>识别结果（可直接修改）</span>
                <textarea
                  value={ocrText}
                  onChange={(event) => setOcrText(event.target.value)}
                  placeholder="识别出的文字会显示在这里…"
                  autoFocus={Boolean(ocrText)}
                />
              </label>
            )}

            {ocrError && <p className="ocr-error" role="alert">{ocrError}</p>}
            <p className="ocr-privacy">图片和识别过程均在当前设备中完成，不会上传到我们的服务器。</p>

            <footer>
              <button type="button" className="dialog-cancel" onClick={closeOcr}>取消</button>
              {!ocrBusy && (
                <button type="button" className="ocr-retry" onClick={() => void runOcr(ocrTarget)}>
                  重新识别
                </button>
              )}
              <button
                type="button"
                className="dialog-confirm"
                onClick={insertOcrText}
                disabled={ocrBusy || !ocrText.trim()}
              >
                插入到图片下方
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
