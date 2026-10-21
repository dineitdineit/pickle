import { Capacitor, type PluginListenerHandle } from "@capacitor/core"
import { PushNotifications } from "@capacitor/push-notifications"
import { supabase } from "./supabase"

export const androidPushAvailable = Capacitor.getPlatform() === "android"
export type PushStatus = "off" | "connecting" | "enabled" | "denied" | "error"
export interface PushTarget {
  recipient: string
  installation: string
  kind: "message" | "activity"
  target: string
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function checkedPushTarget(value: unknown): PushTarget | null {
  const row = value as Partial<PushTarget> | null
  if (
    !row ||
    !uuid.test(row.recipient ?? "") ||
    !uuid.test(row.installation ?? "") ||
    !(
      (row.kind === "message" && /^[1-9][0-9]{0,18}$/.test(row.target ?? "")) ||
      (row.kind === "activity" && uuid.test(row.target ?? ""))
    )
  )
    return null
  return {
    recipient: row.recipient!,
    installation: row.installation!,
    kind: row.kind!,
    target: row.target!,
  }
}
interface Installation {
  id: string
  secret: string
}
const installationKey = "pickle:push:installation"
const ownerKey = "pickle:push:owner"
let user: string | null = null
let userInitialized = false
let status: PushStatus = "off"
let generation = 0
let queue: Promise<unknown> = Promise.resolve()
let setup: Promise<void> | undefined
let registerWaiter: {
  resolve: (token: string) => void
  reject: () => void
} | null = null
let target: PushTarget | null = null
const subscribers = new Set<() => void>()
const targetSubscribers = new Set<() => void>()
function serial<T>(action: () => Promise<T>) {
  const next = queue.catch(() => {}).then(action)
  queue = next
  return next
}
function emit(value: PushStatus) {
  status = value
  subscribers.forEach((notify) => notify())
}
export const pushStatus = () => status
export function subscribePush(notify: () => void) {
  subscribers.add(notify)
  return () => {
    subscribers.delete(notify)
  }
}
function installation(): Installation {
  const raw = localStorage.getItem(installationKey)
  if (raw) {
    const row = JSON.parse(raw)
    if (uuid.test(row?.id) && /^[a-f0-9]{64}$/.test(row?.secret)) return row
    throw new Error("Invalid installation")
  }
  const row = {
    id: crypto.randomUUID(),
    secret: Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join(""),
  }
  localStorage.setItem(installationKey, JSON.stringify(row))
  return row
}
async function bind(token: string, owner: string, version: number) {
  if (user !== owner || generation !== version) return
  const device = installation()
  const result = await supabase.rpc("register_push_device", {
    p_id: device.id,
    p_secret: device.secret,
    p_token: token,
  })
  if (result.error || result.data !== true)
    throw new Error("Registration unavailable")
  if (user !== owner || generation !== version) {
    await unlink()
    return
  }
  localStorage.setItem(ownerKey, owner)
  emit("enabled")
}
async function unlink() {
  const raw = localStorage.getItem(installationKey)
  if (!raw) return
  const device = installation()
  const result = await supabase.rpc("remove_push_device", {
    p_id: device.id,
    p_secret: device.secret,
  })
  if (result.error || result.data !== true)
    throw new Error("Unlink unavailable")
}
async function initialize() {
  if (setup) return setup
  setup = (async () => {
    const handles: PluginListenerHandle[] = []
    try {
      handles.push(
        await PushNotifications.addListener("registration", (event) => {
          if (registerWaiter) registerWaiter.resolve(event.value)
          else {
            const owner = user,
              version = generation
            if (owner && localStorage.getItem(ownerKey) === owner)
              void serial(() => bind(event.value, owner, version)).catch(() =>
                emit("error"),
              )
          }
        }),
      )
      handles.push(
        await PushNotifications.addListener("registrationError", () =>
          registerWaiter?.reject(),
        ),
      )
      handles.push(
        await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (event) => {
            const parsed = checkedPushTarget(event.notification.data)
            if (!parsed || parsed.installation !== installation().id) return
            target = parsed
            targetSubscribers.forEach((notify) => notify())
          },
        ),
      )
      handles.push(
        await PushNotifications.addListener("pushNotificationReceived", () => {
          window.dispatchEvent(new Event("pickle:push-received"))
        }),
      )
      await PushNotifications.createChannel({
        id: "pickle_activity",
        name: "Pickle activity",
        description: "Messages and activity you choose to receive",
        importance: 3,
        visibility: 0,
      })
    } catch (error) {
      await Promise.all(handles.map((handle) => handle.remove()))
      setup = undefined
      throw error
    }
  })()
  return setup
}
async function register(owner: string, version: number, ask: boolean) {
  if (user !== owner || generation !== version) return
  emit("connecting")
  await initialize()
  let permission = await PushNotifications.checkPermissions()
  if (ask && permission.receive !== "granted")
    permission = await PushNotifications.requestPermissions()
  if (permission.receive !== "granted") {
    await unlink()
    localStorage.removeItem(ownerKey)
    if (generation === version) emit("denied")
    return
  }
  const token = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      registerWaiter = null
      reject(new Error("Registration timeout"))
    }, 20000)
    registerWaiter = {
      resolve: (value) => {
        clearTimeout(timer)
        registerWaiter = null
        resolve(value)
      },
      reject: () => {
        clearTimeout(timer)
        registerWaiter = null
        reject(new Error("Registration failed"))
      },
    }
    void PushNotifications.register().catch(() => registerWaiter?.reject())
  })
  await bind(token, owner, version)
}
export async function enableAndroidPush(owner: string) {
  if (!androidPushAvailable || owner !== user) return
  const version = generation
  return serial(() => register(owner, version, true)).catch(() => {
    if (generation === version) emit("error")
  })
}
export async function disableAndroidPush() {
  if (!androidPushAvailable) return
  ++generation
  try {
    localStorage.removeItem(ownerKey)
  } catch {
    /* Native unregister must still run. */
  }
  target = null
  return serial(async () => {
    // Delete the FCM token even when offline unlinking cannot complete.
    await PushNotifications.unregister()
    await PushNotifications.removeAllDeliveredNotifications()
    await unlink()
    emit("off")
  }).catch(() => emit("error"))
}
export function syncAndroidPushUser(next: string | null) {
  if (!androidPushAvailable) return
  if (userInitialized && user === next) return
  userInitialized = true
  const previous = user
  user = next
  const version = ++generation
  emit("off")
  void serial(async () => {
    await initialize()
    const owner = localStorage.getItem(ownerKey)
    // Cold-start taps can wait for authentication restoration for the same user.
    if ((previous && previous !== next) || (owner && owner !== next)) {
      target = null
      localStorage.removeItem(ownerKey)
      await PushNotifications.unregister()
      await PushNotifications.removeAllDeliveredNotifications()
      await unlink()
    }
    if (next && owner === next && generation === version)
      await register(next, version, false)
    targetSubscribers.forEach((notify) => notify())
  }).catch(() => {
    if (generation === version) emit("error")
  })
}
export function listenPushTargets(notify: () => void) {
  targetSubscribers.add(notify)
  return () => {
    targetSubscribers.delete(notify)
  }
}
export function takePushTarget(owner: string): PushTarget | null {
  if (
    !target ||
    target.recipient !== owner ||
    target.installation !== installation().id
  )
    return null
  const value = target
  target = null
  return value
}
