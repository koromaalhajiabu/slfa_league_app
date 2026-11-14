// Supabase Edge Function: start a real, isolated account session at the request of an active Developer.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}
const portalFor: Record<string, string> = {
  SUPER_ADMIN: "super-admin.html",
  CLUB_ADMIN: "club.html",
  REFEREE: "referee.html",
  DISCIPLINARY_OFFICER: "disciplinary.html",
  MEDIA_OFFICER: "media.html",
};
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed." });
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return reply(500, { error: "Server authentication is not configured." });
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return reply(401, { error: "Sign in as Developer first." });
  const callerClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) return reply(401, { error: "Your Developer session is invalid or expired." });
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: actor, error: actorError } = await admin.from("user_profiles")
    .select("id,system_role,status").eq("id", callerData.user.id).maybeSingle();
  if (actorError || !actor || String(actor.system_role).toUpperCase() !== "DEVELOPER" || String(actor.status).toLowerCase() !== "active") {
    return reply(403, { error: "Only an active Developer account can start managed account sessions." });
  }
  let body: { target_user_id?: string };
  try { body = await req.json(); } catch { return reply(400, { error: "Invalid request body." }); }
  const targetId = String(body.target_user_id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId)) {
    return reply(400, { error: "Select a valid account." });
  }
  if (targetId === actor.id) return reply(400, { error: "Your own Developer account is protected." });
  const { data: target, error: targetError } = await admin.from("user_profiles")
    .select("id,email,system_role,status,official_title").eq("id", targetId).maybeSingle();
  if (targetError || !target || !target.email) return reply(404, { error: "Target account was not found." });
  const role = String(target.system_role || "").toUpperCase();
  if (String(target.status).toLowerCase() !== "active") return reply(403, { error: "Only active accounts can be opened." });
  if (role === "DEVELOPER" || !portalFor[role]) return reply(403, { error: "This account type cannot be opened through managed login." });
  const portal = new URL(portalFor[role], req.headers.get("origin") || "https://koromaalhajiabu.github.io/slfa_league_app/").toString();
  // Log before issuing credentials; the audit table is service-role-only and append-only.
  const { error: auditError } = await admin.from("developer_account_sessions").insert({
    developer_id: actor.id, target_user_id: target.id, target_email: target.email,
    target_role: role, event: "SESSION_ISSUED", user_agent: req.headers.get("user-agent") || null
  });
  if (auditError) return reply(500, { error: "Could not write the required audit record. No session was issued." });
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink", email: target.email,
    options: { redirectTo: portal }
  });
  const tokenHash = linkData?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    await admin.from("developer_account_sessions").insert({
      developer_id: actor.id, target_user_id: target.id, target_email: target.email,
      target_role: role, event: "SESSION_ISSUE_FAILED"
    });
    return reply(500, { error: "Supabase could not issue a secure one-time sign-in token." });
  }
  return reply(200, { token_hash: tokenHash, portal });
});