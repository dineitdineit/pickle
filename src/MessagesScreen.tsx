import { queryInbox } from "./lib/inboxSearch"

import { timeAgo } from "./lib/timeAgo"

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ChangeEvent,
} from "react"

import MessagePhoto from "./MessagePhoto"
import { ReportDialog } from "./ReportButton"

import {
  validateChatPhoto,
  uploadChatPhoto,
  sendPhotoMessage,
  insertEmoji,
  removeUnsentPhoto,
} from "./lib/chatPhotos"

import BackIcon from "./BackIcon"

import { requireContentConsent } from "./ContentConsent"

import { supabase } from "./lib/supabase"

import {
  conversationQuery,
  sendMessage,
  type DirectMessage,
  type InboxEntry,
  type MessagePeer,
} from "./lib/messages"

import "./messages.css"

interface Props {
  userId: string

  initialPeerId?: string

  onBack: () => void
}

interface PendingMessage {
  peer: string

  body: string

  clientId: string

  photoKey?: string

  imagePath?: string
}

interface SelectedPhoto {
  file: File

  key: string

  url: string
}

const EMOJIS = [
  "😀",

  "😊",

  "😂",

  "🥰",

  "😍",

  "😋",

  "😎",

  "🤔",

  "😢",

  "😭",

  "🥳",

  "🙏",

  "👍",

  "👏",

  "💪",

  "❤️",

  "🔥",

  "✨",

  "🎉",

  "🍴",

  "🍳",

  "🍕",

  "🍜",

  "🍲",

  "🥗",

  "🍚",

  "🥑",

  "🍅",

  "🍋",

  "🥕",

  "🥩",

  "🍗",

  "🍰",

  "☕",

  "🥂",

  "✅",
]

function nameOf(peer: MessagePeer | InboxEntry) {
  return peer.display_name || peer.username || "Pickle user"
}

function Avatar({ peer }: { peer: MessagePeer | InboxEntry }) {
  return peer.avatar_url && /^https?:\/\//.test(peer.avatar_url) ? (
    <img className="messages-avatar" src={peer.avatar_url} alt="" />
  ) : (
    <span className="messages-avatar">
      {nameOf(peer).charAt(0).toUpperCase()}
    </span>
  )
}

export default function MessagesScreen({
  userId,

  initialPeerId,

  onBack,
}: Props) {
  const [peerId, setPeerId] = useState<string | null>(initialPeerId ?? null)

  const [peer, setPeer] = useState<MessagePeer | null>(null)

  const [inbox, setInbox] = useState<InboxEntry[]>([])

  const [messages, setMessages] = useState<DirectMessage[]>([])

  const [draft, setDraft] = useState("")

  const [busy, setBusy] = useState(false)

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState("")

  const [sendError, setSendError] = useState("")

  const [limit, setLimit] = useState(50)

  const [hasMore, setHasMore] = useState(false)

  const [retry, setRetry] = useState(0)

  const guard = useRef(false)

  const composing = useRef(false)

  const generation = useRef(0)

  const pending = useRef<PendingMessage | null>(null)

  const [canContact, setCanContact] = useState(true)

  const cameFromInbox = useRef(false)

  const scroll = useRef<HTMLDivElement>(null)

  const loadedPeer = useRef<string | null>(null)

  const refreshChat = useRef<() => void>(() => {})
  const confirmedSendRevision = useRef(0)

  const [photo, setPhoto] = useState<SelectedPhoto | null>(null)

  const [emojiOpen, setEmojiOpen] = useState(false)

  const fileInput = useRef<HTMLInputElement>(null)

  const messageInput = useRef<HTMLInputElement>(null)

  const cursor = useRef({ start: 0, end: 0 })

  const [inboxSearch, setInboxSearch] = useState("")
  const inboxSearchValue = useRef("")

  const inboxSearchInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inboxSearchValue.current = ""
    setInboxSearch("")
    setInbox([])
    setHasMore(false)
    setLoading(true)
    setLimit(50)
  }, [userId])

  function changeInboxSearch(value: string) {
    inboxSearchValue.current = value
    setInboxSearch(value)

    setLimit(50)

    setLoading(true)

    setHasMore(false)
  }

  function clearPhoto() {
    if (guard.current) return

    if (pending.current?.imagePath && pending.current.photoKey === photo?.key)
      void removeUnsentPhoto(pending.current.imagePath)

    pending.current = null

    setPhoto(null)
  }

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url)
    },

    [photo],
  )

  useEffect(() => {
    setPhoto(null)

    setEmojiOpen(false)

    pending.current = null
  }, [peerId, userId])

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    event.target.value = ""

    if (!file || guard.current) return

    setSendError("")

    try {
      validateChatPhoto(file)

      clearPhoto()

      setPhoto({
        file,

        key: crypto.randomUUID(),

        url: URL.createObjectURL(file),
      })

      setEmojiOpen(false)

      messageInput.current?.focus()
    } catch (failure) {
      setSendError(
        failure instanceof Error
          ? failure.message
          : "Could not select this photo.",
      )
    }
  }

  function addEmoji(emoji: string) {
    if (guard.current || !canContact) return

    const next = insertEmoji(
      draft,

      emoji,

      cursor.current.start,

      cursor.current.end,
    )

    if (!next) return

    setDraft(next.text)

    setEmojiOpen(false)

    cursor.current = { start: next.position, end: next.position }

    requestAnimationFrame(() => {
      messageInput.current?.focus()

      messageInput.current?.setSelectionRange(next.position, next.position)
    })
  }

  useEffect(() => {
    generation.current++

    let ignore = false

    let inFlight = false

    let queued = false

    const changed = loadedPeer.current !== peerId

    if (changed) {
      setPeer(null)

      setMessages([])

      setLoading(true)
    }

    setError("")

    async function load() {
      if (ignore) return

      if (inFlight) {
        queued = true

        return
      }

      inFlight = true
      const sendRevision = confirmedSendRevision.current

      const firstLoad = loadedPeer.current !== peerId

      const box = scroll.current

      const oldHeight = box?.scrollHeight ?? 0

      const oldTop = box?.scrollTop ?? 0

      const atBottom = !box || oldHeight - oldTop - box.clientHeight < 80

      try {
        if (peerId) {
          const [person, conversation, block] = await Promise.all([
            supabase.rpc("get_recipe_author", { p_user_id: peerId }),

            conversationQuery(userId, peerId, limit),

            supabase.rpc("get_user_block_state", { p_user_id: peerId }),
          ])

          if (
            person.error ||
            person.data?.id !== peerId ||
            conversation.error ||
            block.error ||
            block.data?.user_id !== peerId
          )
            throw new Error("Conversation unavailable")

          let rows = (conversation.data ?? [])

            .slice(0, limit)

            .reverse() as DirectMessage[]

          if (ignore) return

          setCanContact(block.data.can_contact === true)

          setPeer(person.data)

          if (!block.data.can_contact) {
            setMessages([])

            setHasMore(false)

            setError("")

            return
          }

          setHasMore((conversation.data ?? []).length > limit)

          if (document.visibilityState === "visible") {
            const unread = rows

              .filter((row) => row.recipient_id === userId && !row.read_at)

              .map((row) => row.id)

            if (unread.length) {
              const receipt = await supabase

                .from("direct_messages")

                .update({ read_at: new Date().toISOString() })

                .eq("recipient_id", userId)

                .eq("sender_id", peerId)

                .in("id", unread)

                .is("read_at", null)

                .select("id,read_at")

              if (!receipt.error) {
                const confirmed = new Map(
                  (receipt.data ?? []).map((row) => [row.id, row.read_at]),
                )

                rows = rows.map((row) =>
                  confirmed.has(row.id)
                    ? { ...row, read_at: confirmed.get(row.id)! }
                    : row,
                )
              }
            }
          }

          if (ignore) return

          // A fresh server page must remove moderated/deleted messages, even
          // the newest one. Retry a read that raced a newly confirmed send.
          if (sendRevision !== confirmedSendRevision.current) {
            queued = true
            return
          }
          setMessages(rows)

          requestAnimationFrame(() => {
            if (ignore || !scroll.current) return

            const next = scroll.current

            if (firstLoad || atBottom) next.scrollTop = next.scrollHeight
            else if (next.scrollHeight > oldHeight)
              next.scrollTop = oldTop + next.scrollHeight - oldHeight
          })
        } else {
          const result = await queryInbox(supabase, inboxSearch, limit)

          if (result.error) throw result.error

          if (ignore || inboxSearchValue.current !== inboxSearch) return

          setInbox((result.data ?? []).slice(0, limit))

          setHasMore((result.data ?? []).length > limit)
        }

        loadedPeer.current = peerId

        if (!ignore) setError("")
      } catch {
        if (!ignore && (peerId || inboxSearchValue.current === inboxSearch))
          setError("Could not load messages. Please try again.")
      } finally {
        inFlight = false

        if (!ignore && (peerId || inboxSearchValue.current === inboxSearch))
          setLoading(false)

        if (queued && !ignore) {
          queued = false

          void load()
        }
      }
    }

    refreshChat.current = () => {
      void load()
    }

    const searchTimer =
      !peerId && inboxSearch.trim()
        ? window.setTimeout(() => void load(), 250)
        : undefined

    if (searchTimer === undefined) void load()

    const update = () => {
      if (document.visibilityState === "visible") void load()
    }

    const timer = window.setInterval(update, 15000)

    window.addEventListener("focus", update)

    window.addEventListener("pickle:blocks-changed", update)
    window.addEventListener("pickle:safety-refresh", update)

    document.addEventListener("visibilitychange", update)

    const channel = supabase

      .channel(`messages:${userId}:${peerId ?? "inbox"}`)

      .on(
        "postgres_changes",

        {
          event: "*",

          schema: "public",

          table: "direct_messages",

          filter: `recipient_id=eq.${userId}`,
        },

        update,
      )

      .on(
        "postgres_changes",

        {
          event: "*",

          schema: "public",

          table: "direct_messages",

          filter: `sender_id=eq.${userId}`,
        },

        update,
      )

      .subscribe()

    return () => {
      ignore = true

      generation.current++

      window.clearTimeout(searchTimer)

      window.clearInterval(timer)

      window.removeEventListener("focus", update)

      window.removeEventListener("pickle:blocks-changed", update)
      window.removeEventListener("pickle:safety-refresh", update)

      document.removeEventListener("visibilitychange", update)

      void supabase.removeChannel(channel)
    }
  }, [userId, peerId, limit, retry, inboxSearch])

  function handleMessageKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return

    event.preventDefault()

    if (
      composing.current ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229
    )
      return

    void submitMessage()
  }

  async function submitMessage() {
    if (
      !peerId ||
      !peer ||
      guard.current ||
      (!draft.trim() && !photo) ||
      draft.trim().length > 3000
    )
      return

    const body = draft.trim()

    if (
      !pending.current ||
      pending.current.peer !== peerId ||
      pending.current.body !== body ||
      pending.current.photoKey !== photo?.key
    )
      pending.current = {
        peer: peerId,

        body,

        clientId: crypto.randomUUID(),

        photoKey: photo?.key,
      }

    const attempt = pending.current

    const version = generation.current

    guard.current = true

    setBusy(true)

    setSendError("")

    try {
      if (
        !(await requireContentConsent(userId)) ||
        version !== generation.current
      )
        return

      let sent: DirectMessage

      if (photo) {
        attempt.imagePath ??= await uploadChatPhoto(
          photo.file,

          userId,

          peerId,

          attempt.clientId,
        )

        if (version !== generation.current) return

        sent = await sendPhotoMessage(
          peerId,

          body,

          attempt.clientId,

          userId,

          attempt.imagePath,
        )
      } else sent = await sendMessage(peerId, body, attempt.clientId, userId)

      if (version !== generation.current) return

      confirmedSendRevision.current++
      setMessages((current) =>
        current.some((row) => row.id === sent.id)
          ? current
          : [...current, sent],
      )

      setDraft("")

      setPhoto(null)

      pending.current = null

      requestAnimationFrame(() => {
        if (scroll.current)
          scroll.current.scrollTop = scroll.current.scrollHeight
      })

      refreshChat.current()
    } catch {
      if (version === generation.current)
        setSendError(
          "Message could not be confirmed. Your text is kept; press Enter to retry.",
        )
    } finally {
      guard.current = false

      setBusy(false)
    }
  }

  function openPeer(id: string) {
    cameFromInbox.current = true

    setPeerId(id)

    setLimit(50)

    setDraft("")

    setSendError("")

    setLoading(true)
  }

  return (
    <div className={`messages-screen${!peerId ? " is-inbox" : ""}`}>
      <header className="messages-header">
        <button
          type="button"
          aria-label="Back"
          disabled={busy}
          onClick={() =>
            peerId && cameFromInbox.current ? openPeerList() : onBack()
          }
        >
          <BackIcon />
        </button>
        {peerId && peer && <Avatar peer={peer} />}
        <div>
          <h1>
            {peerId ? (peer ? nameOf(peer) : "Conversation") : "Messages"}
          </h1>
          {peer?.username && peerId && <small>@{peer.username}</small>}
        </div>
        {peerId && (
          <button
            type="button"
            className="messages-inbox-link"
            disabled={busy}
            onClick={openPeerList}
          >
            Inbox
          </button>
        )}
      </header>
      {!peerId && (
        <form
          className="messages-inbox-search"
          role="search"
          aria-label="Search conversations"
          onSubmit={(event) => {
            event.preventDefault()
            inboxSearchInput.current?.blur()
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <circle cx="10.8" cy="10.8" r="6.8" />
            <path d="m16 16 4.5 4.5" />
          </svg>
          <input
            ref={inboxSearchInput}
            type="search"
            aria-label="Search conversations by name or username"
            aria-controls="messages-inbox-results"
            placeholder="Search name or username"
            value={inboxSearch}
            maxLength={80}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            onChange={(event) => changeInboxSearch(event.target.value)}
          />
          {inboxSearch && (
            <button
              type="button"
              aria-label="Clear conversation search"
              onClick={() => {
                changeInboxSearch("")
                inboxSearchInput.current?.focus()
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                <path d="m6 6 12 12M6 18 18 6" />
              </svg>
            </button>
          )}
        </form>
      )}
      {error && (
        <div className="messages-error" role="alert">
          {error}{" "}
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            Retry
          </button>
        </div>
      )}
      <div
        className="messages-body"
        id={!peerId ? "messages-inbox-results" : undefined}
        ref={scroll}
      >
        {loading ? (
          <p className="messages-empty" role="status">
            Loading messages…
          </p>
        ) : peerId ? (
          <>
            {hasMore && (
              <button
                type="button"
                className="messages-older"
                disabled={busy}
                onClick={() => setLimit((value) => value + 50)}
              >
                Load older messages
              </button>
            )}
            {!messages.length && !error && (
              <p className="messages-empty">
                Say hello to start your conversation.
              </p>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`message-row${
                  message.sender_id === userId ? " is-own" : ""
                }`}
              >
                <div className="message-bubble">
                  {message.image_path && (
                    <MessagePhoto
                      path={message.image_path}
                      onLoad={() => {
                        const box = scroll.current

                        if (
                          box &&
                          box.scrollHeight - box.scrollTop - box.clientHeight <
                            350
                        )
                          box.scrollTop = box.scrollHeight
                      }}
                    />
                  )}
                  {message.body && <p>{message.body}</p>}
                  <small>
                    {new Date(message.created_at).toLocaleString([], {
                      month: "short",

                      day: "numeric",

                      hour: "2-digit",

                      minute: "2-digit",
                    })}
                    {message.sender_id === userId &&
                      ` · ${message.read_at ? "Read" : "Sent"}`}
                  </small>
                  {message.sender_id !== userId && message.report_id && (
                    <MessageReport
                      targetId={message.report_id}
                      userId={userId}
                    />
                  )}
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            {inbox.map((entry) => (
              <button
                type="button"
                className={`messages-inbox-entry${
                  entry.unread_count > 0 ? " is-unread" : ""
                }`}
                key={entry.peer_id}
                onClick={() => openPeer(entry.peer_id)}
              >
                <Avatar peer={entry} />
                <span className="messages-inbox-content">
                  <strong>{nameOf(entry)}</strong>
                  <span className="messages-inbox-summary">
                    <span className="messages-inbox-preview">
                      {entry.latest_body}
                    </span>
                    <span aria-hidden="true">·</span>
                    <time
                      dateTime={entry.latest_at}
                      title={new Date(entry.latest_at).toLocaleString()}
                    >
                      {timeAgo(entry.latest_at)}
                    </time>
                  </span>
                  {entry.unread_count > 0 && (
                    <span className="sr-only">Unread messages</span>
                  )}
                </span>
              </button>
            ))}
            {!inbox.length && !error && (
              <p className="messages-empty">
                {inboxSearch.trim()
                  ? "No conversations found. Try another name or username."
                  : "No conversations yet. Open a cook’s profile and tap Message."}
              </p>
            )}
            {hasMore && (
              <button
                type="button"
                className="messages-older"
                onClick={() => setLimit((value) => value + 50)}
              >
                Load more conversations
              </button>
            )}
          </>
        )}
      </div>
      {peerId && (
        <form
          className="messages-composer"
          onSubmit={(event) => {
            event.preventDefault()

            if (!composing.current) void submitMessage()
          }}
        >
          {sendError && <p role="alert">{sendError}</p>}
          {!canContact && (
            <p role="status">Messaging is unavailable for this user.</p>
          )}
          {photo && (
            <div className="messages-photo-preview">
              <img src={photo.url} alt="Photo to send" />
              <span>Photo attached · Press Enter to send</span>
              <button
                type="button"
                aria-label="Remove attached photo"
                disabled={busy}
                onClick={clearPhoto}
              >
                ×
              </button>
            </div>
          )}
          {emojiOpen && (
            <div
              className="messages-emoji-picker"
              role="group"
              aria-label="Choose an emoji"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setEmojiOpen(false)

                  messageInput.current?.focus()
                }
              }}
            >
              {EMOJIS.map((emoji) => (
                <button
                  type="button"
                  key={emoji}
                  aria-label={`Insert ${emoji}`}
                  onClick={() => addEmoji(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
          <div className="messages-compose-row">
            <input
              ref={fileInput}
              className="messages-file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              tabIndex={-1}
              aria-label="Choose a chat photo"
              onChange={(event) => void choosePhoto(event)}
            />
            <button
              type="button"
              className="messages-camera-button"
              aria-label="Attach photo"
              disabled={busy || !peer || !canContact}
              onClick={() => fileInput.current?.click()}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 6h4l2-3h4l2 3h4v14H4z" />
                <circle cx="12" cy="12" r="4" />
              </svg>
            </button>
            <input
              ref={messageInput}
              type="text"
              aria-label="Message"
              enterKeyHint="send"
              placeholder="Write a message…"
              value={draft}
              disabled={busy || !peer || !canContact}
              maxLength={3000}
              onKeyDown={handleMessageKeyDown}
              onCompositionStart={() => {
                composing.current = true
              }}
              onCompositionEnd={() => {
                composing.current = false
              }}
              onSelect={(event) => {
                cursor.current = {
                  start: event.currentTarget.selectionStart ?? draft.length,

                  end: event.currentTarget.selectionEnd ?? draft.length,
                }
              }}
              onChange={(event) => {
                setDraft(event.target.value)

                setSendError("")
              }}
            />
            <button
              type="button"
              className="messages-emoji-button"
              aria-label="Add emoji"
              aria-expanded={emojiOpen}
              disabled={busy || !peer || !canContact}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => setEmojiOpen((value) => !value)}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <circle
                  cx="9"
                  cy="9"
                  r=".7"
                  fill="currentColor"
                  stroke="none"
                />
                <circle
                  cx="15"
                  cy="9"
                  r=".7"
                  fill="currentColor"
                  stroke="none"
                />
                <path d="M8 14q4 5 8 0" />
              </svg>
            </button>
          </div>
        </form>
      )}
    </div>
  )

  function openPeerList() {
    setPeerId(null)

    setPeer(null)

    setLimit(50)

    setDraft("")

    setSendError("")

    setLoading(true)
  }
}

function MessageReport({
  targetId,
  userId,
}: {
  targetId: string
  userId: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="message-report"
        aria-label="Report message"
        title="Report message"
        onClick={() => setOpen(true)}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path d="M5 21V4m0 0c5-5 9 5 14 0v10c-5 5-9-5-14 0" />
        </svg>
      </button>
      {open && (
        <ReportDialog
          targetType="message"
          targetId={targetId}
          userId={userId}
          onRequireLogin={() => setOpen(false)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
