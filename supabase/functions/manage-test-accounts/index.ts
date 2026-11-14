// Deploy with Supabase Edge Functions. Required secret: SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), { status, headers: cors });
const allowed = ["TEST_SUPER_ADMIN","TEST_CLUB_ADMIN","TEST_REFEREE","TEST_DISCIPLINARY_OFFICER","TEST_MEDIA_OFFICER"];
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required." }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!service) return json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, 500);
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Developer sign-in required." }, 401);
  const caller = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: authData, error: authError } = await caller.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Invalid session." }, 401);
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await admin.from("user_profiles").select("system_role,status").eq("id", authData.user.id).maybeSingle();
  if (profileError || !profile || String(profile.system_role).toUpperCase() !== "DEVELOPER" || String(profile.status).toLowerCase() !== "active") {
    return json({ error: "Active Developer access required." }, 403);
  }
  try {
    const body = await req.json();
    if (body.action === "list") {
      const { data, error } = await admin.from("slfa_test_accounts").select("user_id,email,full_name,test_role,status,created_at").order("created_at", { ascending: false });
      if (error) throw error;
      return json({ accounts: data || [] });
    }
    if (body.action === "create") {
      const email = String(body.email || "").trim().toLowerCase();
      const fullName = String(body.full_name || "").trim();
      const password = String(body.password || "");
      const role = String(body.test_role || "");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
      if (fullName.length < 2 || fullName.length > 120) return json({ error: "Full name must be 2–120 characters." }, 400);
      if (password.length < 10) return json({ error: "Password must contain at least 10 characters." }, 400);
      if (!allowed.includes(role)) return json({ error: "Choose a valid test role." }, 400);
      // Do not let a test signup consume or inherit a pending production role invitation.
      const { data: invitation, error: inviteCheckError } = await admin.from("role_invitations").select("email").eq("email", email).maybeSingle();
      if (inviteCheckError) throw inviteCheckError;
      if (invitation) return json({ error: "This email already has a production staff invitation. Use a different email for testing." }, 409);
      const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { slfa_test_account: true, full_name: fullName } });
      if (createError) throw createError;
      // The project's auth.users trigger creates a Pending user_profiles row. Verify it
      // did not receive an active production role before registering the isolated test identity.
      const { data: productionProfile, error: productionProfileError } = await admin.from("user_profiles").select("system_role,status").eq("id", created.user.id).maybeSingle();
      if (productionProfileError || !productionProfile || String(productionProfile.status).toLowerCase() !== "pending") {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: "Safety check failed: the new identity did not remain a Pending production profile. No test account was created." }, 500);
      }
      const { error: insertError } = await admin.from("slfa_test_accounts").insert({ user_id: created.user.id, email, full_name: fullName, test_role: role, created_by: authData.user.id });
      if (insertError) { await admin.auth.admin.deleteUser(created.user.id); throw insertError; }
      return json({ created: { user_id: created.user.id, email, full_name: fullName, test_role: role, status: "ACTIVE" } }, 201);
    }
    if (body.action === "set_status") {
      const id = String(body.user_id || "");
      const status = body.status === "DISABLED" ? "DISABLED" : "ACTIVE";
      const { error } = await admin.from("slfa_test_accounts").update({ status }).eq("user_id", id);
      if (error) throw error;
      return json({ success: true, status });
    }
    if (body.action === "delete") {
      const id = String(body.user_id || "");
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw error;
      return json({ success: true });
    }
    return json({ error: "Unsupported action." }, 400);
  } catch (e) {
    return json({ error: e?.message || "Test account operation failed." }, 400);
  }
});
