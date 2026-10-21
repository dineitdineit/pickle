import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.116.0"

import { processDeletion } from "../retention-worker/worker.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })

    const token = authHeader.slice("Bearer ".length)
    const { data: userData, error: userError } =
      await userClient.auth.getUser(token)
    const user = userData.user

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError) throw profileError

    if (profile?.role === "admin" || profile?.role === "official") {
      return new Response(
        JSON.stringify({
          error: "Admin and official accounts cannot be deleted from the app.",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    const { data: preparation, error: preparationError } = await admin.rpc("prepare_account_deletion", { p_user: user.id })
    if (preparationError || preparation?.user_id !== user.id || preparation?.prepared !== true) throw new Error("Could not prepare account deletion")
    const jobId = preparation.job_id
    if (typeof jobId !== "string") throw new Error("Deletion job not confirmed")
    let result = { completed: preparation.completed === true }
    if (!result.completed) { try { result = await processDeletion(admin, jobId, user.id) } catch { /* A confirmed queued request is retried by the worker. */ } }
    return new Response(JSON.stringify({ accepted: true, ok: result.completed, completed: result.completed, user_id: user.id, job_id: jobId }), {
      status: result.completed ? 200 : 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("delete-account failed")
    return new Response(
      JSON.stringify({ error: "Could not delete account." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  }
})
