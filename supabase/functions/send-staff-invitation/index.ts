import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP_ORIGIN = "https://koromaalhajiabu.github.io";
const INVITE_REDIRECT = APP_ORIGIN + "/slfa_league_app/reset-password.html";
const corsHeaders = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json",
};
const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "POST required." }, 405);
  if (origin && origin !== APP_ORIGIN) return reply({ error: "Origin not allowed." }, 403);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return reply({ error: "The secure invitation service is not fully configured." }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return reply({ error: "Staff sign-in is required." }, 401);

  const caller = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: authData, error: authError } = await caller.auth.getUser(token);
  if (authError || !authData.user) return reply({ error: "Your session is invalid or has expired. Sign in again." }, 401);

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: callerProfile, error: callerProfileError } = await admin
    .from("user_profiles").select("system_role,status")
    .eq("id", authData.user.id).maybeSingle();
  const callerRole = String(callerProfile?.system_role || "").toUpperCase();
  if (callerProfileError || !callerProfile ||
      !["DEVELOPER", "SUPER_ADMIN"].includes(callerRole) ||
      String(callerProfile.status).toLowerCase() !== "active") {
    return reply({ error: "Only an active Developer or Super Admin can send operational staff invitations." }, 403);
  }

  try {
    const body = await req.json();
    const email = String(body?.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply({ error: "Enter a valid email address." }, 400);
    }

    const { data: invitation, error: invitationError } = await admin
      .from("role_invitations")
      .select("email,system_role,invitation_status,email_delivery_status,email_attempts,full_name")
      .eq("email", email)
      .in("invitation_status", ["PENDING", "ACCOUNT_CREATED"])
      .maybeSingle();
    if (invitationError) throw invitationError;

    if (!invitation) {
      const { data: existing, error: existingError } = await admin
        .from("user_profiles").select("system_role,status")
        .eq("email", email).maybeSingle();
      if (existingError) throw existingError;
      if (existing && String(existing.status).toLowerCase() === "active") {
        return reply({
          ok: true,
          already_active: true,
          message: "This staff account is already active. No new invitation email is needed.",
        });
      }
      return reply({ error: "No pending staff invitation was found for this email. Save the role invitation first." }, 404);
    }

    if (callerRole === "SUPER_ADMIN" && String(invitation.system_role).toUpperCase() === "SUPER_ADMIN") {
      return reply({ error: "Only the Developer can send or manage a Super Admin invitation." }, 403);
    }

    if (Number(invitation.email_attempts || 0) >= 5) {
      return reply({ error: "The invitation has reached its retry limit. Check the email address and Supabase Auth email configuration before trying again." }, 429);
    }
    if (invitation.email_delivery_status === "SENT") {
      return reply({
        ok: true,
        already_sent: true,
        message: "The invitation email has already been sent. If its link expired, the person should use Forgot password on the SLFA sign-in page.",
      });
    }

    const attempt = Number(invitation.email_attempts || 0) + 1;
    const { error: markError } = await admin.from("role_invitations").update({
      email_attempts: attempt,
      email_delivery_status: "NOT_SENT",
      email_delivery_error: null,
    }).eq("email", email);
    if (markError) throw markError;

    let deliveryError: { message?: string } | null = null;
    if (invitation.invitation_status === "PENDING") {
      const { error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: invitation.full_name || "" },
        redirectTo: INVITE_REDIRECT,
      });
      deliveryError = error;
    } else {
      const { error } = await admin.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: INVITE_REDIRECT },
      });
      deliveryError = error;
    }

    if (deliveryError) {
      const safeError = String(deliveryError.message || "Auth invitation delivery failed.").slice(0, 500);
      await admin.from("role_invitations").update({
        email_delivery_status: "FAILED",
        email_delivery_error: safeError,
      }).eq("email", email);
      return reply({ error: safeError, retryable: true }, 502);
    }

    const { error: updateError } = await admin.from("role_invitations").update({
      email_delivery_status: "SENT",
      email_sent_at: new Date().toISOString(),
      email_delivery_error: null,
    }).eq("email", email);
    if (updateError) {
      return reply({
        ok: true,
        email_sent: true,
        tracking_warning: updateError.message,
        message: "The invitation email was sent. Delivery tracking could not be updated.",
      });
    }

    return reply({
      ok: true,
      email_sent: true,
      message: "Invitation email sent to " + email + ". The person must verify the email, accept the terms and set a password before signing in.",
    });
  } catch (error) {
    const message = String((error as Error)?.message || "Invitation operation failed.").slice(0, 500);
    return reply({ error: message }, 400);
  }
});
