import { supabase } from "./supabase"
export interface DirectMessage {
  id: number
  report_id?: string
  sender_id: string
  recipient_id: string
  client_id: string
  body: string
  image_path?: string | null
  created_at: string
  read_at: string | null
}
export interface MessagePeer {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}
export interface InboxEntry {
  peer_id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  latest_body: string
  latest_at: string
  latest_id: number
  unread_count: number
}
export async function sendMessage(
  recipientId: string,
  body: string,
  clientId: string,
  userId: string,
): Promise<DirectMessage> {
  const content = body.trim()
  if (!content || content.length > 3000 || recipientId === userId)
    throw new Error("Invalid message")
  const { data, error } = await supabase.rpc("send_direct_message", {
    p_recipient_id: recipientId,
    p_body: content,
    p_client_id: clientId,
  })
  if (
    error ||
    !data?.id ||
    data.sender_id !== userId ||
    data.recipient_id !== recipientId ||
    data.client_id !== clientId ||
    data.body !== content
  )
    throw new Error("Message delivery was not confirmed")
  return data
}
export function conversationQuery(
  userId: string,
  peerId: string,
  limit: number,
) {
  return supabase
    .from("direct_messages")
    .select(
      "id,report_id,sender_id,recipient_id,client_id,body,image_path,created_at,read_at",
    )
    .in("sender_id", [userId, peerId])
    .in("recipient_id", [userId, peerId])
    .order("id", { ascending: false })
    .limit(limit + 1)
}
