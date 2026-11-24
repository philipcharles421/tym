// Supabase Edge Function: send-push
//
// Triggered by a Database Webhook on INSERT into public.messages.
// Looks up the recipient's push subscriptions and sends a Web Push
// notification to each one, carrying the current unread count so the
// service worker can update the installed app's badge even if no TYM
// tab/window is open at all.
//
// Required secrets (set via `supabase secrets set`):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   - from scripts/gen-vapid-keys.js
//   WEBHOOK_SECRET                        - shared secret checked against the
//                                           Database Webhook's custom header
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are provided automatically by
//   the Supabase Edge Runtime for every function - no need to set them.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

webpush.setVapidDetails("mailto:support@tym.app", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

Deno.serve(async (req) => {
    if (req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
        return new Response("unauthorized", { status: 401 });
    }

    let payload: any;
    try {
        payload = await req.json();
    } catch {
        return new Response("bad request", { status: 400 });
    }

    const record = payload?.record;
    const recipientId = record?.recipient_id;
    if (!recipientId) {
        return new Response("ignored", { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: subs, error: subsError } = await supabase
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", recipientId);

    if (subsError || !subs || subs.length === 0) {
        return new Response(JSON.stringify({ sent: 0 }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    }

    const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", recipientId)
        .eq("read", false);

    const notificationPayload = JSON.stringify({
        title: "TYM – New Message",
        body: record.content
            ? String(record.content).slice(0, 80)
            : "You received a new anonymous message!",
        badgeCount: count ?? 1
    });

    const results = await Promise.allSettled(
        subs.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    notificationPayload
                );
            } catch (err: any) {
                if (err?.statusCode === 404 || err?.statusCode === 410) {
                    await supabase.from("push_subscriptions").delete().eq("id", sub.id);
                }
                throw err;
            }
        })
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;

    return new Response(JSON.stringify({ sent, total: subs.length }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
    });
});
