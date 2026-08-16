import type { MindNode, Note } from "./notes";

const NODE_WIDTH = 184;
const NODE_HEIGHT = 64;
const COLUMN_GAP = 94;
const ROW_GAP = 24;
const MARGIN = 58;

export type MindMapLayoutNode = {
  id: string;
  text: string;
  depth: number;
  x: number;
  y: number;
};

export type MindMapLayout = {
  width: number;
  height: number;
  nodeWidth: number;
  nodeHeight: number;
  nodes: MindMapLayoutNode[];
  edges: Array<{ fromId: string; toId: string }>;
};

const formatDate = (timestamp: number) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(timestamp));

const noteTypeLabel = (note: Note) => (note.type === "book" ? "读后感" : "观后感");
const sourceLabel = (note: Note) => (note.type === "book" ? "作者" : "创作者");
const ratingLabel = (rating: number) => (rating ? `${"★".repeat(rating)}（${rating}.0）` : "暂未评分");

export function createExportBaseName(note: Note) {
  const cleaned = (note.title.trim() || "未命名笔记")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .slice(0, 60);
  return cleaned || "未命名笔记";
}

function mindMapToMarkdown(node: MindNode, depth = 0): string[] {
  const line = `${"  ".repeat(depth)}- ${node.text.trim() || "未命名主题"}`;
  return [line, ...node.children.flatMap((child) => mindMapToMarkdown(child, depth + 1))];
}

export function noteToMarkdown(note: Note) {
  const title = note.title.trim() || "未命名笔记";
  const metadata = [
    `- 类型：${noteTypeLabel(note)}`,
    `- ${sourceLabel(note)}：${note.source.trim() || "未填写"}`,
    `- 评分：${ratingLabel(note.rating)}`,
    `- 标签：${note.tags.length ? note.tags.map((tag) => `#${tag}`).join(" ") : "无"}`,
    `- 最后编辑：${formatDate(note.updatedAt)}`,
  ];
  const imageById = new Map((note.images ?? []).map((image) => [image.id, image]));
  const body = note.contentBlocks?.length
    ? note.contentBlocks.flatMap((block) => {
        if (block.type === "text") return block.text.trim() ? [block.text.trim(), ""] : [];
        const image = imageById.get(block.imageId);
        return image ? [`[图片${image.caption ? `：${image.caption}` : ""}]`, ""] : [];
      })
    : [note.content.trim() || "暂无正文内容。", ""];
  return [
    `# ${title}`,
    "",
    ...metadata,
    "",
    "## 笔记正文",
    "",
    ...body,
    "",
    "## 思维导图",
    "",
    ...mindMapToMarkdown(note.mindMap),
    "",
    "---",
    "由杰森笔记导出",
    "",
  ].join("\n");
}

export function noteToPlainText(note: Note) {
  const title = note.title.trim() || "未命名笔记";
  const imageById = new Map((note.images ?? []).map((image) => [image.id, image]));
  const body = note.contentBlocks?.length
    ? note.contentBlocks.flatMap((block) => {
        if (block.type === "text") return block.text.trim() ? [block.text.trim(), ""] : [];
        const image = imageById.get(block.imageId);
        return image ? [`[图片${image.caption ? `：${image.caption}` : ""}]`, ""] : [];
      })
    : [note.content.trim() || "暂无正文内容。", ""];
  return [
    title,
    "=".repeat(Math.min(30, Math.max(8, title.length))),
    `类型：${noteTypeLabel(note)}`,
    `${sourceLabel(note)}：${note.source.trim() || "未填写"}`,
    `评分：${ratingLabel(note.rating)}`,
    `标签：${note.tags.length ? note.tags.map((tag) => `#${tag}`).join(" ") : "无"}`,
    `最后编辑：${formatDate(note.updatedAt)}`,
    "",
    "【笔记正文】",
    ...body,
    "",
    "【思维导图】",
    ...mindMapToMarkdown(note.mindMap),
    "",
    "由杰森笔记导出",
    "",
  ].join("\n");
}

export function calculateMindMapLayout(root: MindNode): MindMapLayout {
  const nodes: MindMapLayoutNode[] = [];
  const edges: Array<{ fromId: string; toId: string }> = [];
  let cursorY = MARGIN + NODE_HEIGHT / 2;
  let maxDepth = 0;

  const visit = (node: MindNode, depth: number): number => {
    maxDepth = Math.max(maxDepth, depth);
    const childYs = node.children.map((child) => {
      edges.push({ fromId: node.id, toId: child.id });
      return visit(child, depth + 1);
    });
    const y = childYs.length
      ? (childYs[0] + childYs[childYs.length - 1]) / 2
      : (() => {
          const value = cursorY;
          cursorY += NODE_HEIGHT + ROW_GAP;
          return value;
        })();
    nodes.push({
      id: node.id,
      text: node.text.trim() || "未命名主题",
      depth,
      x: MARGIN + depth * (NODE_WIDTH + COLUMN_GAP),
      y,
    });
    return y;
  };

  visit(root, 0);
  return {
    width: MARGIN * 2 + (maxDepth + 1) * NODE_WIDTH + maxDepth * COLUMN_GAP,
    height: Math.max(360, cursorY - ROW_GAP + MARGIN - NODE_HEIGHT / 2),
    nodeWidth: NODE_WIDTH,
    nodeHeight: NODE_HEIGHT,
    nodes,
    edges,
  };
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const right = x + width;
  const bottom = y + height;
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(right - radius, y);
  context.quadraticCurveTo(right, y, right, y + radius);
  context.lineTo(right, bottom - radius);
  context.quadraticCurveTo(right, bottom, right - radius, bottom);
  context.lineTo(x + radius, bottom);
  context.quadraticCurveTo(x, bottom, x, bottom - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let current = "";
  for (const character of text) {
    const candidate = current + character;
    if (current && context.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= 3) return lines;
  const visible = lines.slice(0, 3);
  visible[2] = `${visible[2].slice(0, -1)}…`;
  return visible;
}

export function renderMindMapCanvas(root: MindNode) {
  const layout = calculateMindMapLayout(root);
  const pixelRatio = Math.max(0.65, Math.min(2, 8192 / layout.width, 8192 / layout.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(layout.width * pixelRatio);
  canvas.height = Math.ceil(layout.height * pixelRatio);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法生成思维导图图片。");
  context.scale(pixelRatio, pixelRatio);
  context.fillStyle = "#fdfcf9";
  context.fillRect(0, 0, layout.width, layout.height);

  const positions = new Map(layout.nodes.map((node) => [node.id, node]));
  context.lineWidth = 1.5;
  context.strokeStyle = "#c9b8aa";
  for (const edge of layout.edges) {
    const from = positions.get(edge.fromId);
    const to = positions.get(edge.toId);
    if (!from || !to) continue;
    const startX = from.x + layout.nodeWidth;
    const endX = to.x;
    const middleX = (startX + endX) / 2;
    context.beginPath();
    context.moveTo(startX, from.y);
    context.bezierCurveTo(middleX, from.y, middleX, to.y, endX, to.y);
    context.stroke();
  }

  for (const node of layout.nodes) {
    const top = node.y - layout.nodeHeight / 2;
    roundedRect(context, node.x, top, layout.nodeWidth, layout.nodeHeight, 10);
    if (node.depth === 0) {
      context.fillStyle = "#d97759";
      context.fill();
    } else {
      context.fillStyle = node.depth === 1 ? "#f7ebe5" : "#ffffff";
      context.fill();
      context.strokeStyle = node.depth === 1 ? "#dda08d" : "#d8d2c8";
      context.lineWidth = 1.25;
      context.stroke();
    }

    context.fillStyle = node.depth === 0 ? "#ffffff" : "#4d5866";
    context.font = `${node.depth === 0 ? "600" : "500"} 13px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    const lines = wrapCanvasText(context, node.text, layout.nodeWidth - 24);
    const lineHeight = 17;
    const startY = node.y - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, index) => context.fillText(line, node.x + layout.nodeWidth / 2, startY + index * lineHeight));
  }

  return canvas;
}

export function canvasToPngFile(canvas: HTMLCanvasElement, fileName: string) {
  const dataUrl = canvas.toDataURL("image/png");
  const binary = atob(dataUrl.split(",")[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], fileName, { type: "image/png" });
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function mindMapToHtml(node: MindNode, isRoot = false): string {
  const children = node.children.length
    ? `<ul>${node.children.map((child) => mindMapToHtml(child)).join("")}</ul>`
    : "";
  return `<li><span class="${isRoot ? "root-node" : ""}">${escapeHtml(node.text.trim() || "未命名主题")}</span>${children}</li>`;
}

const printStyles = `
  :root { color: #293548; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; color: #293548; }
  main { max-width: 820px; margin: 0 auto; }
  .brand { color: #d97759; font-size: 11px; font-weight: 700; letter-spacing: .18em; }
  h1 { margin: 12px 0 18px; font-family: Georgia, "Songti SC", serif; font-size: 32px; font-weight: 600; line-height: 1.25; }
  h2 { margin: 28px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e1d7; font-size: 15px; }
  .metadata { display: grid; grid-template-columns: repeat(2, 1fr); gap: 9px 24px; padding: 16px 18px; border-radius: 10px; background: #f8f5ef; }
  .metadata div { font-size: 11px; line-height: 1.6; }
  .metadata b { color: #8c867c; font-weight: 500; }
  .content { min-height: 160px; font-size: 13px; line-height: 1.95; white-space: pre-wrap; overflow-wrap: anywhere; }
  .content-flow { display: grid; gap: 14px; }
  .content-flow .text-block { font-size: 13px; line-height: 1.95; white-space: pre-wrap; overflow-wrap: anywhere; }
  .content-flow figure { break-inside: avoid; margin: 0; padding: 8px; border: 1px solid #e5e1d7; border-radius: 8px; }
  .content-flow img { display: block; width: 100%; height: auto; max-height: 150mm; object-fit: contain; }
  .content-flow figcaption { margin-top: 7px; color: #817c74; font-size: 10px; line-height: 1.5; text-align: center; }
  .note-images { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
  .note-images figure { break-inside: avoid; margin: 0; padding: 8px; border: 1px solid #e5e1d7; border-radius: 8px; }
  .note-images img { display: block; width: 100%; height: auto; max-height: 112mm; object-fit: contain; }
  .note-images figcaption { margin-top: 7px; color: #817c74; font-size: 10px; line-height: 1.5; text-align: center; }
  .mind-outline, .mind-outline ul { margin: 0; padding-left: 24px; list-style: none; }
  .mind-outline { padding-left: 0; }
  .mind-outline ul { margin: 7px 0 4px 11px; border-left: 1px solid #d6c8bc; }
  .mind-outline li { position: relative; margin: 7px 0; }
  .mind-outline ul > li::before { position: absolute; top: 15px; left: -24px; width: 18px; height: 1px; background: #d6c8bc; content: ""; }
  .mind-outline span { display: inline-block; padding: 7px 10px; border: 1px solid #ded8ce; border-radius: 6px; background: #fff; font-size: 11px; }
  .mind-outline .root-node { color: #fff; border-color: #d97759; background: #d97759; font-weight: 650; }
  footer { margin-top: 38px; padding-top: 12px; color: #aaa59b; border-top: 1px solid #ece8df; font-size: 9px; text-align: center; }
  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
`;

export function buildNotePrintHtml(
  note: Note,
  images: Array<{ id: string; dataUrl: string; caption: string }> = [],
) {
  const title = note.title.trim() || "未命名笔记";
  const tags = note.tags.length ? note.tags.map((tag) => `#${tag}`).join("　") : "无";
  const printableImages = new Map(
    images
      .filter((image) => /^data:image\/(?:jpeg|png|webp);base64,/i.test(image.dataUrl))
      .map((image) => [image.id, image]),
  );
  const flow = note.contentBlocks?.length
    ? note.contentBlocks
        .map((block, index) => {
          if (block.type === "text") {
            return block.text.trim() ? `<div class="text-block">${escapeHtml(block.text)}</div>` : "";
          }
          const image = printableImages.get(block.imageId);
          if (!image) return "";
          return `<figure><img src="${image.dataUrl}" alt="${escapeHtml(image.caption || `笔记图片 ${index + 1}`)}">${image.caption ? `<figcaption>${escapeHtml(image.caption)}</figcaption>` : ""}</figure>`;
        })
        .join("")
    : `<div class="text-block">${escapeHtml(note.content.trim() || "暂无正文内容。")}</div>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · 杰森笔记</title><style>@page { size: A4; margin: 16mm; }${printStyles}</style></head><body><main><div class="brand">杰森笔记 · ${noteTypeLabel(note)}</div><h1>${escapeHtml(title)}</h1><section class="metadata"><div><b>${sourceLabel(note)}：</b>${escapeHtml(note.source.trim() || "未填写")}</div><div><b>评分：</b>${escapeHtml(ratingLabel(note.rating))}</div><div><b>标签：</b>${escapeHtml(tags)}</div><div><b>最后编辑：</b>${escapeHtml(formatDate(note.updatedAt))}</div></section><h2>笔记正文</h2><section class="content-flow">${flow || '<div class="text-block">暂无正文内容。</div>'}</section><h2>思维导图</h2><ul class="mind-outline">${mindMapToHtml(note.mindMap, true)}</ul><footer>由杰森笔记导出 · ${escapeHtml(formatDate(Date.now()))}</footer></main></body></html>`;
}

export function buildMindMapPrintHtml(note: Note, imageDataUrl: string) {
  const title = note.title.trim() || "未命名笔记";
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · 思维导图</title><style>@page { size: A4 landscape; margin: 12mm; }${printStyles}main { max-width: none; }h1 { margin-bottom: 12px; font-size: 25px; }.map-image { display: block; width: 100%; max-height: 160mm; object-fit: contain; object-position: center top; }</style></head><body><main><div class="brand">杰森笔记 · 思维导图</div><h1>${escapeHtml(title)}</h1><img class="map-image" src="${imageDataUrl}" alt="${escapeHtml(title)}的思维导图"><footer>由杰森笔记导出 · ${escapeHtml(formatDate(Date.now()))}</footer></main></body></html>`;
}

export function openPrintPreview(html: string) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) throw new Error("浏览器阻止了打印预览，请允许打开新窗口后重试。");
  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  const images = Array.from(printWindow.document.images);
  const imageReady = images.map(
    (image) =>
      new Promise<void>((resolve) => {
        if (image.complete) {
          resolve();
          return;
        }
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      }),
  );
  void Promise.all(imageReady).then(() => window.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 120));
}
