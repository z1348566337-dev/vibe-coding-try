export type StoredImage = {
  id: string;
  noteId: string;
  dataUrl: string;
  mimeType: string;
  createdAt: number;
};

const DB_NAME = "jason-notes-images";
const DB_VERSION = 1;
const STORE_NAME = "images";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) {
      reject(new Error("当前浏览器不支持本地图片存储。"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("noteId", "noteId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开本地图片库。"));
  });
}

function runRequest<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const request = action(transaction.objectStore(STORE_NAME));
        let result: T;
        request.onsuccess = () => {
          result = request.result;
        };
        request.onerror = () => reject(request.error ?? new Error("本地图片操作失败。"));
        transaction.oncomplete = () => {
          database.close();
          resolve(result);
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error ?? new Error("本地图片操作失败。"));
        };
      }),
  );
}

export function saveStoredImage(image: StoredImage) {
  return runRequest("readwrite", (store) => store.put(image)).then(() => image);
}

export function getStoredImage(id: string) {
  return runRequest<StoredImage | undefined>("readonly", (store) => store.get(id));
}

export function getStoredImages(ids: string[]) {
  return Promise.all(ids.map((id) => getStoredImage(id))).then((images) =>
    images.filter((image): image is StoredImage => Boolean(image)),
  );
}

export function getAllStoredImages() {
  return runRequest<StoredImage[]>("readonly", (store) => store.getAll());
}

export function deleteStoredImage(id: string) {
  return runRequest("readwrite", (store) => store.delete(id)).then(() => undefined);
}

export async function deleteImagesForNote(noteId: string) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const index = transaction.objectStore(STORE_NAME).index("noteId");
    const request = index.openKeyCursor(IDBKeyRange.only(noteId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      transaction.objectStore(STORE_NAME).delete(cursor.primaryKey);
      cursor.continue();
    };
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("删除图片失败。"));
  });
}

export async function saveStoredImages(images: StoredImage[]) {
  if (!images.length) return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    images.forEach((image) => store.put(image));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("恢复图片失败。"));
  });
}

export async function replaceStoredImagesForNotes(noteIds: string[], images: StoredImage[]) {
  if (!noteIds.length) return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("noteId");
    let remaining = noteIds.length;

    const saveReplacements = () => {
      images.forEach((image) => store.put(image));
    };

    noteIds.forEach((noteId) => {
      const request = index.openKeyCursor(IDBKeyRange.only(noteId));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
          return;
        }
        remaining -= 1;
        if (remaining === 0) saveReplacements();
      };
    });
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("恢复图片失败。"));
    };
  });
}
