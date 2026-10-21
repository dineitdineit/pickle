import type { PostPhotoDraft } from "./photoPosts"
import type { RecipeTagChoice } from "./postRecipeTags"
import { postFilters, type PhotoEdits, type Adjustment } from "./postPhoto"

export const POST_DRAFT_TTL = 30 * 86400000
export interface PostDraftSnapshot {
  id: string
  photos: PostPhotoDraft[]
  caption: string
  recipeTag: RecipeTagChoice | null
  stage: "select" | "edit" | "caption"
  selected: number
  tab: string
  tool: Adjustment
  publishAttempted: boolean
}
interface StoredPhoto {
  id: string
  originalKey: string
  fileKey: string
  edits: PhotoEdits
}
interface StoredDraft extends Omit<PostDraftSnapshot, "photos"> {
  version: 1
  owner: string
  revision: number
  updatedAt: number
  photos: StoredPhoto[]
}
interface Asset {
  key: string
  owner: string
  blob: Blob
  name: string
  lastModified: number
}
export interface RecoveredPostDraft {
  snapshot: PostDraftSnapshot
  updatedAt: number
}
export class DraftConflict extends Error {
  constructor() {
    super(
      "This draft changed in another window. Close and reopen the composer to load the saved version.",
    )
  }
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const tools = [
  "tilt",
  "brightness",
  "contrast",
  "sharpness",
  "temperature",
  "saturation",
  "highlights",
  "shadows",
  "vignette",
]
const queues = new Map<string, Promise<unknown>>()
const deleted = new Set<string>()
const fileKeys = new WeakMap<Blob, string>()
let channel: BroadcastChannel | null = null
function accountQueue<T>(owner: string, action: () => Promise<T>): Promise<T> {
  const next = (queues.get(owner) ?? Promise.resolve())
    .catch(() => {})
    .then(action)
  queues.set(owner, next)
  void next
    .finally(() => {
      if (queues.get(owner) === next) queues.delete(owner)
    })
    .catch(() => {})
  return next
}
function connectDeletionEvents() {
  if (
    typeof window === "undefined" ||
    typeof BroadcastChannel === "undefined" ||
    channel
  )
    return
  channel = new BroadcastChannel("pickle-post-draft-deletion")
  channel.onmessage = (event) => {
    if (event.data?.type === "account-deleted" && uuid.test(event.data.owner))
      void clearAccountPostDrafts(event.data.owner, false).catch(() => {})
  }
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Draft storage is unavailable."))
      return
    }
    let settled = false
    const request = indexedDB.open("pickle-post-drafts", 1)
    const timer = setTimeout(() => {
      settled = true
      reject(
        new Error(
          "Draft storage is unavailable. Close other Pickle windows and retry.",
        ),
      )
    }, 8000)
    request.onupgradeneeded = () => {
      request.result.createObjectStore("drafts", { keyPath: "owner" })
      request.result
        .createObjectStore("assets", { keyPath: "key" })
        .createIndex("owner", "owner")
    }
    request.onsuccess = () => {
      clearTimeout(timer)
      if (settled) {
        request.result.close()
        return
      }
      request.result.onversionchange = () => request.result.close()
      const db = request.result
      const tx = db.transaction(["drafts", "assets"], "readwrite")
      const expired = tx.objectStore("drafts").openCursor()
      expired.onsuccess = () => {
        const cursor = expired.result
        if (!cursor) return
        if (
          Number.isFinite(cursor.value?.updatedAt) &&
          cursor.value.updatedAt <= Date.now() - POST_DRAFT_TTL
        )
          removeOwner(tx, String(cursor.key))
        cursor.continue()
      }
      tx.oncomplete = () => resolve(db)
      tx.onabort = () => {
        db.close()
        reject(new Error("Could not clear expired post drafts."))
      }
    }
    request.onerror = () => {
      clearTimeout(timer)
      settled = true
      reject(new Error("Could not access drafts on this device."))
    }
    request.onblocked = () => {
      clearTimeout(timer)
      settled = true
      reject(new Error("Close other Pickle windows and retry loading drafts."))
    }
  })
}
function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () =>
      reject(tx.error ?? new Error("Could not save your draft on this device."))
    tx.onerror = () => {
      /* onabort confirms rollback. */
    }
  })
}
function removeOwner(tx: IDBTransaction, owner: string) {
  tx.objectStore("drafts").delete(owner)
  const request = tx
    .objectStore("assets")
    .index("owner")
    .openCursor(IDBKeyRange.only(owner))
  request.onsuccess = () => {
    const cursor = request.result
    if (cursor) {
      cursor.delete()
      cursor.continue()
    }
  }
}
function validEdits(e: PhotoEdits) {
  if (
    !e ||
    !postFilters.includes(e.filter) ||
    ![0, 90, 180, 270].includes(e.rotation) ||
    typeof e.text !== "string" ||
    e.text.length > 120 ||
    !/^#[0-9a-f]{6}$/i.test(e.textColor)
  )
    return false
  const limits: Record<string, [number, number]> = {
    tilt: [-15, 15],
    brightness: [-100, 100],
    contrast: [-100, 100],
    sharpness: [0, 100],
    temperature: [-100, 100],
    saturation: [-100, 100],
    highlights: [-100, 100],
    shadows: [-100, 100],
    vignette: [0, 100],
    textSize: [2, 10],
    textX: [0.1, 0.9],
    textY: [0, 1],
  }
  return Object.entries(limits).every(([key, [min, max]]) => {
    const value = e[(key as keyof PhotoEdits)]
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= min &&
      value <= max
    )
  })
}
function validHeader(row: StoredDraft, owner: string, now: number) {
  return (
    row?.version === 1 &&
    row.owner === owner &&
    uuid.test(row.id) &&
    Number.isInteger(row.revision) &&
    row.revision > 0 &&
    Number.isFinite(row.updatedAt) &&
    row.updatedAt <= now + 60000 &&
    row.updatedAt > now - POST_DRAFT_TTL &&
    typeof row.caption === "string" &&
    row.caption.length <= 2200 &&
    ["select", "edit", "caption"].includes(row.stage) &&
    Number.isInteger(row.selected) &&
    row.selected >= 0 &&
    row.selected < Math.max(1, row.photos?.length ?? 0) &&
    ["Filters", "Edit", "Text"].includes(row.tab) &&
    tools.includes(row.tool) &&
    typeof row.publishAttempted === "boolean" &&
    (!row.recipeTag ||
      (uuid.test(row.recipeTag.id) &&
        typeof row.recipeTag.title === "string" &&
        row.recipeTag.title.length <= 1000 &&
        typeof row.recipeTag.author_name === "string" &&
        (row.recipeTag.cover_image === null ||
          typeof row.recipeTag.cover_image === "string"))) &&
    Array.isArray(row.photos) &&
    row.photos.length <= 10 &&
    (row.stage === "select" || row.photos.length > 0) &&
    row.photos.every((photo) => !!photo) &&
    new Set(row.photos.map((photo) => photo.id)).size === row.photos.length &&
    row.photos.every(
      (photo) =>
        uuid.test(photo.id) &&
        typeof photo.originalKey === "string" &&
        typeof photo.fileKey === "string" &&
        photo.originalKey.startsWith(`${owner}/${row.id}/`) &&
        photo.fileKey.startsWith(`${owner}/${row.id}/`) &&
        validEdits(photo.edits),
    )
  )
}
function validBlob(blob: Blob) {
  return (
    blob instanceof Blob &&
    blob.size > 0 &&
    blob.size <= 5 * 1024 * 1024 &&
    ["image/jpeg", "image/png", "image/webp"].includes(blob.type)
  )
}
export function hasPostDraftContent(snapshot: PostDraftSnapshot) {
  return !!(
    snapshot.photos.length ||
    snapshot.caption.length ||
    snapshot.recipeTag
  )
}
export class PostDraftSession {
  private revision = 0
  private accepting = true
  constructor(readonly owner: string) {
    if (!uuid.test(owner)) throw new Error("Invalid draft account.")
    connectDeletionEvents()
  }
  async read(): Promise<RecoveredPostDraft | null> {
    return accountQueue(this.owner, async () => {
      if (deleted.has(this.owner)) throw new Error("This account was deleted.")
      const db = await openDatabase()
      try {
        const tx = db.transaction(["drafts", "assets"], "readwrite")
        let recovered: RecoveredPostDraft | null = null
        const request = tx.objectStore("drafts").get(this.owner)
        request.onsuccess = () => {
          const row = request.result as StoredDraft | undefined
          this.revision = 0
          if (!row) return
          if (!validHeader(row, this.owner, Date.now())) {
            removeOwner(tx, this.owner)
            return
          }
          this.revision = row.revision
          const snapshot: PostDraftSnapshot = {
            id: row.id,
            photos: [],
            caption: row.caption,
            recipeTag: row.recipeTag,
            stage: row.stage,
            selected: row.selected,
            tab: row.tab,
            tool: row.tool,
            publishAttempted: row.publishAttempted,
          }
          recovered = { snapshot, updatedAt: row.updatedAt }
          for (const photo of row.photos) {
            const restored = {
              id: photo.id,
              edits: photo.edits,
            } as PostPhotoDraft
            snapshot.photos.push(restored)
            for (const [field, key] of [
              ["original", photo.originalKey],
              ["file", photo.fileKey],
            ] as const) {
              const asset = tx.objectStore("assets").get(key)
              asset.onsuccess = () => {
                const value = asset.result as Asset | undefined
                if (
                  !value ||
                  value.owner !== this.owner ||
                  !validBlob(value.blob) ||
                  typeof value.name !== "string" ||
                  value.name.length > 200 ||
                  !Number.isFinite(value.lastModified)
                ) {
                  recovered = null
                  this.revision = 0
                  removeOwner(tx, this.owner)
                  return
                }
                const file = new File([value.blob], value.name, {
                  type: value.blob.type,
                  lastModified: value.lastModified,
                })
                fileKeys.set(file, key)
                restored[field] = file
              }
            }
          }
        }
        await done(tx)
        return recovered
      } finally {
        db.close()
      }
    })
  }
  save(snapshot: PostDraftSnapshot): Promise<void> {
    if (!this.accepting)
      return Promise.reject(new Error("Draft editor is closed."))
    return accountQueue(this.owner, async () => {
      if (deleted.has(this.owner)) throw new Error("This account was deleted.")
      const blobs = new Map<string, Asset>()
      const keyFor = (file: File) => {
        if (!validBlob(file))
          throw new Error("Could not preserve a selected photo.")
        let key = fileKeys.get(file)
        if (!key || !key.startsWith(`${this.owner}/${snapshot.id}/`)) {
          key = `${this.owner}/${snapshot.id}/${crypto.randomUUID()}`
          fileKeys.set(file, key)
        }
        blobs.set(key, {
          key,
          owner: this.owner,
          blob: file,
          name: file.name,
          lastModified: file.lastModified,
        })
        return key
      }
      const row: StoredDraft = {
        ...snapshot,
        owner: this.owner,
        version: 1,
        revision: this.revision + 1,
        updatedAt: Date.now(),
        photos: snapshot.photos.map((photo) => ({
          id: photo.id,
          originalKey: keyFor(photo.original),
          fileKey: keyFor(photo.file),
          edits: photo.edits,
        })),
      }
      if (!validHeader(row, this.owner, Date.now()))
        throw new Error(
          "Could not preserve this draft. Keep the composer open and retry.",
        )
      const db = await openDatabase()
      let conflict = false
      try {
        const tx = db.transaction(["drafts", "assets"], "readwrite")
        const request = tx.objectStore("drafts").get(this.owner)
        request.onsuccess = () => {
          const old = request.result as StoredDraft | undefined
          if (
            (old?.revision ?? 0) !== this.revision ||
            (old && old.id !== snapshot.id)
          ) {
            conflict = true
            tx.abort()
            return
          }
          if (!hasPostDraftContent(snapshot)) {
            removeOwner(tx, this.owner)
            return
          }
          for (const asset of blobs.values()) {
            const exists = tx.objectStore("assets").getKey(asset.key)
            exists.onsuccess = () => {
              if (!exists.result) tx.objectStore("assets").put(asset)
            }
          }
          const keep = new Set(blobs.keys())
          for (const photo of old?.photos ?? [])
            for (const key of [photo.originalKey, photo.fileKey])
              if (!keep.has(key)) tx.objectStore("assets").delete(key)
          tx.objectStore("drafts").put(row)
        }
        try {
          await done(tx)
        } catch (error) {
          if (conflict) throw new DraftConflict()
          throw error
        }
        this.revision = hasPostDraftContent(snapshot) ? row.revision : 0
      } finally {
        db.close()
      }
    })
  }
  clear(): Promise<void> {
    this.accepting = false
    return accountQueue(this.owner, async () => {
      const db = await openDatabase()
      let conflict = false
      try {
        const tx = db.transaction(["drafts", "assets"], "readwrite")
        const request = tx.objectStore("drafts").get(this.owner)
        request.onsuccess = () => {
          if ((request.result?.revision ?? 0) !== this.revision) {
            conflict = true
            tx.abort()
            return
          }
          removeOwner(tx, this.owner)
        }
        try {
          await done(tx)
        } catch (error) {
          this.accepting = true
          if (conflict) throw new DraftConflict()
          throw error
        }
        this.revision = 0
      } finally {
        db.close()
      }
    }).catch((error) => {
      this.accepting = true
      throw error
    })
  }
  stop() {
    this.accepting = false
  }
}
/** Invalidate active editors before clearing this device's account-owned blobs. */
export function clearAccountPostDrafts(
  owner: string,
  broadcast = true,
): Promise<void> {
  deleted.add(owner)
  if (broadcast) {
    connectDeletionEvents()
    channel?.postMessage({ type: "account-deleted", owner })
  }
  return accountQueue(owner, async () => {
    const db = await openDatabase()
    try {
      const tx = db.transaction(["drafts", "assets"], "readwrite")
      removeOwner(tx, owner)
      await done(tx)
    } finally {
      db.close()
    }
  })
}
