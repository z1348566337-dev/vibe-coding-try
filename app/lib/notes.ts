export type NoteType = "book" | "video";

export type MindNode = {
  id: string;
  text: string;
  children: MindNode[];
};

export type NoteImage = {
  id: string;
  caption: string;
  createdAt: number;
};

export type NoteContentBlock =
  | { id: string; type: "text"; text: string }
  | { id: string; type: "image"; imageId: string };

export type Note = {
  id: string;
  title: string;
  source: string;
  type: NoteType;
  rating: number;
  tags: string[];
  content: string;
  images?: NoteImage[];
  contentBlocks?: NoteContentBlock[];
  mindMap: MindNode;
  createdAt: number;
  updatedAt: number;
};

const id = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const sampleTime = new Date("2026-08-05T09:30:00+08:00").getTime();

export const DEFAULT_NOTES: Note[] = [
  {
    id: "sample-book",
    title: "《被讨厌的勇气》",
    source: "岸见一郎、古贺史健",
    type: "book",
    rating: 5,
    tags: ["心理学", "自我成长"],
    content:
      "课题分离，不是冷漠地不管别人，而是认清每个人需要对什么负责。\n\n我最有感触的是：如果总是把自己放在别人的目光里，就会慢慢失去选择生活的能力。真正的自由，是允许别人不理解，但仍愿意对自己的选择负责。\n\n行动：下次遇到分歧时，先问“这是谁的课题”，再决定自己要做什么。",
    contentBlocks: [
      {
        id: "sample-book-text",
        type: "text",
        text: "课题分离，不是冷漠地不管别人，而是认清每个人需要对什么负责。\n\n我最有感触的是：如果总是把自己放在别人的目光里，就会慢慢失去选择生活的能力。真正的自由，是允许别人不理解，但仍愿意对自己的选择负责。\n\n行动：下次遇到分歧时，先问“这是谁的课题”，再决定自己要做什么。",
      },
    ],
    mindMap: {
      id: "m-root-1",
      text: "被讨厌的勇气",
      children: [
        {
          id: "m-1-a",
          text: "核心观点",
          children: [
            { id: "m-1-a-1", text: "课题分离", children: [] },
            { id: "m-1-a-2", text: "活在当下", children: [] },
          ],
        },
        {
          id: "m-1-b",
          text: "我的触动",
          children: [{ id: "m-1-b-1", text: "不再寻求所有人认可", children: [] }],
        },
        {
          id: "m-1-c",
          text: "行动计划",
          children: [{ id: "m-1-c-1", text: "先判断是谁的课题", children: [] }],
        },
      ],
    },
    createdAt: sampleTime - 86400000 * 3,
    updatedAt: sampleTime,
  },
  {
    id: "sample-video",
    title: "纪录片《徒手攀岩》",
    source: "伊莉莎白·柴·瓦沙瑞莉",
    type: "video",
    rating: 4,
    tags: ["纪录片", "专注"],
    content:
      "真正打动我的不只是攀岩本身，而是为一个目标做几年细密准备的过程。\n\n当一件事足够困难，激情并不能代替训练。重复、记录、预演，都在把不可能慢慢变成可执行的路线。",
    contentBlocks: [
      {
        id: "sample-video-text",
        type: "text",
        text: "真正打动我的不只是攀岩本身，而是为一个目标做几年细密准备的过程。\n\n当一件事足够困难，激情并不能代替训练。重复、记录、预演，都在把不可能慢慢变成可执行的路线。",
      },
    ],
    mindMap: {
      id: "m-root-2",
      text: "徒手攀岩",
      children: [
        { id: "m-2-a", text: "细密准备", children: [] },
        { id: "m-2-b", text: "专注与风险", children: [] },
        { id: "m-2-c", text: "对教学的启发", children: [] },
      ],
    },
    createdAt: sampleTime - 86400000 * 5,
    updatedAt: sampleTime - 86400000,
  },
];

export function createNote(type: NoteType, now = Date.now()): Note {
  const noteId = id();
  return {
    id: noteId,
    title: "",
    source: "",
    type,
    rating: 0,
    tags: [],
    content: "",
    images: [],
    contentBlocks: [{ id: `${noteId}-text`, type: "text", text: "" }],
    mindMap: {
      id: `${noteId}-root`,
      text: "中心主题",
      children: [
        { id: `${noteId}-idea`, text: "核心观点", children: [] },
        { id: `${noteId}-feeling`, text: "我的感受", children: [] },
        { id: `${noteId}-action`, text: "启发与行动", children: [] },
      ],
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function mergeAdjacentTextBlocks(blocks: NoteContentBlock[]) {
  return blocks.reduce<NoteContentBlock[]>((merged, block) => {
    const previous = merged.at(-1);
    if (previous?.type === "text" && block.type === "text") {
      merged[merged.length - 1] = {
        ...previous,
        text: previous.text + block.text,
      };
      return merged;
    }

    merged.push(block);
    return merged;
  }, []);
}

export function migrateNoteContent(note: Note): Note {
  const images = note.images ?? [];
  if (Array.isArray(note.contentBlocks) && note.contentBlocks.length > 0) {
    const contentBlocks = mergeAdjacentTextBlocks(note.contentBlocks);
    return {
      ...note,
      images,
      contentBlocks,
      content: contentBlocksToText(contentBlocks),
    };
  }

  const contentBlocks: NoteContentBlock[] = [
    { id: `${note.id}-legacy-text`, type: "text", text: note.content },
    ...images.map((image) => ({ id: `${image.id}-block`, type: "image" as const, imageId: image.id })),
  ];
  if (images.length) {
    contentBlocks.push({ id: `${note.id}-legacy-tail`, type: "text", text: "" });
  }
  return { ...note, images, contentBlocks };
}

export function contentBlocksToText(blocks: NoteContentBlock[]) {
  return blocks
    .filter((block): block is Extract<NoteContentBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function removeImageFromContentBlocks(blocks: NoteContentBlock[], imageId: string) {
  const imageIndex = blocks.findIndex(
    (block) => block.type === "image" && block.imageId === imageId,
  );
  if (imageIndex < 0) return blocks;

  const next = [...blocks];
  next.splice(imageIndex, 1);
  return mergeAdjacentTextBlocks(next);
}

export function insertTextAfterImageBlock(
  blocks: NoteContentBlock[],
  imageId: string,
  text: string,
  textBlockId: string,
) {
  const normalizedText = text.trim();
  if (!normalizedText) return blocks;

  const imageIndex = blocks.findIndex(
    (block) => block.type === "image" && block.imageId === imageId,
  );
  if (imageIndex < 0) return blocks;

  const next = [...blocks];
  const followingBlock = next[imageIndex + 1];
  if (followingBlock?.type === "text") {
    next[imageIndex + 1] = {
      ...followingBlock,
      text: followingBlock.text.trim()
        ? `${normalizedText}\n\n${followingBlock.text}`
        : normalizedText,
    };
    return next;
  }

  next.splice(imageIndex + 1, 0, {
    id: textBlockId,
    type: "text",
    text: normalizedText,
  });
  return next;
}

export function createQuickNote(now = Date.now()): Note {
  return createNote("book", now);
}

export function matchesNote(note: Note, query: string, filter: "all" | NoteType) {
  if (filter !== "all" && note.type !== filter) return false;
  const term = query.trim().toLocaleLowerCase("zh-CN");
  if (!term) return true;
  const blockText = note.contentBlocks
    ?.filter((block): block is Extract<NoteContentBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join(" ");
  return [note.title, note.source, blockText ?? note.content, ...note.tags]
    .join(" ")
    .toLocaleLowerCase("zh-CN")
    .includes(term);
}

export function updateMindNode(root: MindNode, targetId: string, text: string): MindNode {
  if (root.id === targetId) return { ...root, text };
  return {
    ...root,
    children: root.children.map((child) => updateMindNode(child, targetId, text)),
  };
}

export function addMindChild(root: MindNode, targetId: string): MindNode {
  if (root.id === targetId) {
    return {
      ...root,
      children: [...root.children, { id: id(), text: "新主题", children: [] }],
    };
  }
  return {
    ...root,
    children: root.children.map((child) => addMindChild(child, targetId)),
  };
}

export function deleteMindNode(root: MindNode, targetId: string): MindNode {
  return {
    ...root,
    children: root.children
      .filter((child) => child.id !== targetId)
      .map((child) => deleteMindNode(child, targetId)),
  };
}

export function formatUpdatedAt(timestamp: number, now = Date.now()) {
  const value = new Date(timestamp);
  const dayKey = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  if (dayKey(value) === dayKey(new Date(now))) {
    return value.toLocaleTimeString("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  if (dayKey(value) === dayKey(new Date(now - 86400000))) return "昨天";
  return value.toLocaleDateString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
  });
}
