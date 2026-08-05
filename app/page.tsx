"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_NOTES,
  addMindChild,
  createNote,
  deleteMindNode,
  formatUpdatedAt,
  matchesNote,
  updateMindNode,
  type MindNode,
  type Note,
  type NoteType,
} from "./lib/notes";

const STORAGE_KEY = "inspiration-notes-v1";

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

  useEffect(() => {
    const hydrateTimer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        const parsed = saved ? (JSON.parse(saved) as Note[]) : DEFAULT_NOTES;
        const validNotes = Array.isArray(parsed) ? parsed : DEFAULT_NOTES;
        setNotes(validNotes);
        setSelectedId(validNotes[0]?.id ?? "");
      } catch {
        setNotes(DEFAULT_NOTES);
        setSelectedId(DEFAULT_NOTES[0].id);
      }
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(hydrateTimer);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
      setSaveState("已保存");
    }, 220);
    return () => window.clearTimeout(timer);
  }, [notes, loaded]);

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

  const confirmDelete = () => {
    if (!current) return;
    const remaining = notes.filter((note) => note.id !== current.id);
    setSaveState("保存中…");
    setNotes(remaining);
    setSelectedId(remaining[0]?.id ?? "");
    setPendingDelete(false);
  };

  const addTag = () => {
    const tag = tagDraft.trim().replace(/^#/, "");
    if (!current || !tag || current.tags.includes(tag)) return;
    updateCurrent({ tags: [...current.tags, tag] });
    setTagDraft("");
  };

  const wordCount = current?.content.replace(/\s/g, "").length ?? 0;

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
            <strong>拾光笔记</strong>
            <p>记下触动，梳理思考</p>
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

        <div className="local-note">
          <span className="status-dot" />
          内容仅保存在此浏览器
        </div>
      </aside>

      <section className="workspace">
        <div className="mobile-bar">
          <button onClick={() => setSidebarOpen(true)} aria-label="打开笔记列表">☰</button>
          <strong>拾光笔记</strong>
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
                  <div className="writing-area">
                    <textarea
                      value={current.content}
                      onChange={(event) => updateCurrent({ content: event.target.value })}
                      placeholder={"从这里开始记录…\n\n• 哪个情节或观点最触动你？\n• 它让你想到了什么？\n• 你会如何将它应用在生活中？"}
                      aria-label="笔记正文"
                    />
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
    </main>
  );
}
