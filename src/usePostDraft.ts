import { useAndroidBack } from "./lib/nativeNavigation"

import { useEffect, useRef, useState } from "react"

import { App } from "@capacitor/app"

import { Capacitor, type PluginListenerHandle } from "@capacitor/core"

import {
  PostDraftSession,
  hasPostDraftContent,
  type PostDraftSnapshot,
  type RecoveredPostDraft,
} from "./lib/postDrafts"

type Mode = "checking" | "offer" | "editing" | "storage-error" | "checking-share" | "closed"

interface Options {
  userId: string

  snapshot: PostDraftSnapshot

  restore: (snapshot: PostDraftSnapshot) => void

  checkShared: (id: string) => Promise<boolean>

  onShared: (id: string) => void

  onBack: () => void
}

export default function usePostDraft(options: Options) {
  const [mode, setMode] = useState<Mode>("checking")

  const [recovered, setRecovered] = useState<RecoveredPostDraft | null>(null)

  const [status, setStatus] = useState<"empty" | "saving" | "saved" | "error">(
    "empty",
  )

  const [error, setError] = useState("")

  const [revision, setRevision] = useState(0)

  const [memoryOnly, setMemoryOnly] = useState(false)

  const [openGallery, setOpenGallery] = useState(false)

  const latest = useRef(options)

  latest.current = options

  const currentMode = useRef<Mode>(mode)

  currentMode.current = mode

  const session = useRef<PostDraftSession | null>(null)

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const mounted = useRef(false)

  const memory = useRef(false)

  const move = (next: Mode) => {
    currentMode.current = next

    setMode(next)
  }

  function report(failure: unknown) {
    if (!mounted.current) return

    setStatus("error")

    setError(
      failure instanceof Error
        ? failure.message
        : "Could not save this draft on your device.",
    )
  }

  async function flush(snapshot = latest.current.snapshot) {
    clearTimeout(timer.current)

    if (memory.current) return

    if (!session.current) throw new Error("Draft storage is unavailable.")

    if (mounted.current) setStatus("saving")

    try {
      await session.current.save(snapshot)

      if (mounted.current) {
        setError("")

        setStatus(hasPostDraftContent(snapshot) ? "saved" : "empty")
      }
    } catch (failure) {
      report(failure)

      throw failure
    }
  }

  useEffect(() => {
    mounted.current = true

    let active = true

    const store = new PostDraftSession(options.userId)

    session.current = store

    memory.current = false

    setMemoryOnly(false)

    setOpenGallery(false)

    move("checking")

    setError("")

    void store

      .read()

      .then((value) => {
        if (!active) return

        setRecovered(value)

        if (value) move("offer")
        else {
          move("editing")

          setOpenGallery(true)
        }
      })

      .catch((failure) => {
        if (active) {
          report(failure)

          move("storage-error")
        }
      })

    return () => {
      active = false

      mounted.current = false

      clearTimeout(timer.current)

      if (currentMode.current === "editing" && !memory.current)
        void store.save(latest.current.snapshot).catch(() => {})

      store.stop()
    }
  }, [options.userId, revision])

  useEffect(() => {
    if (mode !== "editing" || memoryOnly) return

    setStatus("saving")

    timer.current = setTimeout(() => {
      void flush().catch(() => {})
    }, 250)

    return () => clearTimeout(timer.current)
  }, [options.snapshot, mode, memoryOnly])

  useEffect(() => {
    if (mode !== "editing") return

    const save = () => {
      if (!memory.current) void flush().catch(() => {})
    }

    const visibility = () => {
      if (document.visibilityState === "hidden") save()
    }

    window.addEventListener("pagehide", save)

    document.addEventListener("visibilitychange", visibility)

    const handles: PluginListenerHandle[] = []

    let disposed = false

    async function native() {
      if (Capacitor.getPlatform() !== "android") return

      const handle = await App.addListener("pause", save)

      if (disposed) await handle.remove()
      else handles.push(handle)
    }

    void native().catch(() => {})

    return () => {
      disposed = true

      window.removeEventListener("pagehide", save)

      document.removeEventListener("visibilitychange", visibility)

      void Promise.all(handles.map((handle) => handle.remove()))
    }
  }, [mode])

  useAndroidBack(() => {
    if (currentMode.current !== "editing") return false

    latest.current.onBack()

    return true
  }, 200)

  async function resume() {
    if (!recovered || !session.current) return

    try {
      const snapshot = recovered.snapshot

      if (snapshot.publishAttempted) {
        move("checking-share")

        if (await latest.current.checkShared(snapshot.id)) {
          await published(snapshot.id)

          return
        }
      }

      if (!mounted.current) return

      latest.current.restore({ ...snapshot, publishAttempted: false })

      setOpenGallery(false)

      setError("")

      move("editing")
    } catch (failure) {
      report(failure)

      move("offer")
    }
  }

  async function discard() {
    clearTimeout(timer.current)

    if (!memory.current) await session.current?.clear()

    move("closed")
  }

  async function startNew() {
    try {
      await discard()

      session.current = new PostDraftSession(options.userId)

      setRecovered(null)

      setError("")

      setStatus("empty")

      move("editing")

      setOpenGallery(true)
    } catch (failure) {
      report(failure)
    }
  }

  async function published(id: string) {
    clearTimeout(timer.current)

    move("closed")

    try {
      if (!memory.current) await session.current?.clear()
    } catch {
      /* The persisted attempted flag permits safe confirmation next time. */
    }

    if (mounted.current) latest.current.onShared(id)
  }

  function retryLoad() {
    move("checking")

    setRevision((value) => value + 1)
  }

  function continueWithoutSaving() {
    memory.current = true

    setMemoryOnly(true)

    setError("")

    move("editing")

    setOpenGallery(true)
  }

  function leaveWithoutSaving() {
    clearTimeout(timer.current)

    move("closed")

    session.current?.stop()
  }

  return {
    mode,

    recovered,

    status,

    error,

    memoryOnly,

    openGallery,

    flush,

    resume,

    discard,

    startNew,

    published,

    retryLoad,

    continueWithoutSaving,

    leaveWithoutSaving,
  }
}
