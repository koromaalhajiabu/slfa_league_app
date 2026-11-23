// Sends club-targeted league alerts with category preferences and per-device retry safety.
const enc = new TextEncoder();
const MAX_ATTEMPTS = 5;

function b64uToBytes(s: string): Uint8Array {
  let b = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4) b += '=';
  const bin = atob(b);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64u(bytes: Uint8Array): string {
  let s = '';
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function concat(...arrs: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
  return new Uint8Array(bits);
}
async function vapidAuthorization(endpoint: string, publicKey: string, privateKey: string, subject: string): Promise<string> {
  const audience = new URL(endpoint).origin;
  const header = bytesToB64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = bytesToB64u(enc.encode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const pub = b64uToBytes(publicKey);
  const key = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', d: privateKey,
    x: bytesToB64u(pub.slice(1, 33)), y: bytesToB64u(pub.slice(33, 65)), ext: true,
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(header + '.' + payload)));
  return `vapid t=${header}.${payload}.${bytesToB64u(sig)}, k=${publicKey}`;
}
async function encryptForSubscriber(plaintext: string, p256dh: string, authSecret: string): Promise<Uint8Array> {
  const uaPublic = b64uToBytes(p256dh);
  const auth = b64uToBytes(authSecret);
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(plaintext), new Uint8Array([2]))));
  return concat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([asPublic.length]), asPublic, ct);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return new Response('Server configuration is incomplete', { status: 500 });

  const h = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  const keyRes = await fetch(`${supabaseUrl}/rest/v1/push_vapid_keys?id=eq.1&select=public_key,private_key`, { headers: h });
  if (!keyRes.ok) return new Response('Could not load push keys', { status: 500 });
  const keys = await keyRes.json();
  const vapid = keys[0];
  if (!vapid) return new Response('Push keys are not set', { status: 500 });

  const qRes = await fetch(`${supabaseUrl}/rest/v1/league_alerts?delivery_status=eq.PENDING&attempts=lt.${MAX_ATTEMPTS}&select=id,title,body,url,attempts,club_names,target_endpoints,alert_type,delivery_status&order=created_at.asc&limit=10`, { headers: h });
  if (!qRes.ok) return new Response('Could not read the alerts queue', { status: 500 });
  const alerts: Array<{ id: number; title: string; body: string; url: string; attempts: number; club_names: string[] | null; target_endpoints: string[] | null; alert_type: string }> = await qRes.json();

  const sRes = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?select=endpoint,p256dh,auth,club_names,alert_types&limit=5000`, { headers: h });
  if (!sRes.ok) return new Response('Could not read push subscriptions', { status: 500 });
  const subs: Array<{ endpoint: string; p256dh: string; auth: string; club_names: string[] | null; alert_types: string[] | null }> = await sRes.json();

  let pushed = 0;
  let failed = 0;
  let noRecipients = 0;

  for (const a of alerts) {
    const dRes = await fetch(`${supabaseUrl}/rest/v1/league_alert_deliveries?alert_id=eq.${a.id}&select=endpoint,outcome&limit=5000`, { headers: h });
    if (!dRes.ok) return new Response(`Could not load delivery receipts for alert ${a.id}`, { status: 500 });
    const prior: Array<{ endpoint: string; outcome: string }> = await dRes.json();
    const completed = new Set(prior.map((x) => x.endpoint));
    let alertFailures: string[] = [];
    let attempted = 0;

    for (const sub of subs) {
      if (a.target_endpoints && !a.target_endpoints.includes(sub.endpoint)) continue;
      if (a.club_names && sub.club_names && !sub.club_names.some((c) => a.club_names!.includes(c))) continue;
      const categories = sub.alert_types || ['FIXTURES','KICKOFF','GOALS','CARDS','FULL_TIME','NEWS','ANNOUNCEMENTS','MATCH_UPDATES'];
      if (!categories.includes(a.alert_type || 'ANNOUNCEMENTS')) continue;
      if (completed.has(sub.endpoint)) continue;
      attempted++;

      try {
        const body = await encryptForSubscriber(JSON.stringify({ title: a.title, body: a.body, url: a.url || '/' }), sub.p256dh, sub.auth);
        const authz = await vapidAuthorization(sub.endpoint, vapid.public_key, vapid.private_key, 'mailto:koromaalhajiabu0@gmail.com');
        const pRes = await fetch(sub.endpoint, {
          method: 'POST',
          headers: { TTL: '86400', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', Authorization: authz },
          body,
        });

        if (pRes.status === 404 || pRes.status === 410) {
          const receipt = await fetch(`${supabaseUrl}/rest/v1/league_alert_deliveries?on_conflict=alert_id,endpoint`, {
            method: 'POST',
            headers: { ...h, Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify({ alert_id: a.id, endpoint: sub.endpoint, outcome: 'EXPIRED', last_error: 'Subscription endpoint expired.' }),
          });
          if (!receipt.ok) throw new Error(`Expired endpoint receipt failed: ${receipt.status}`);
          completed.add(sub.endpoint);
          await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE', headers: h });
        } else if (pRes.ok) {
          const receipt = await fetch(`${supabaseUrl}/rest/v1/league_alert_deliveries?on_conflict=alert_id,endpoint`, {
            method: 'POST',
            headers: { ...h, Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify({ alert_id: a.id, endpoint: sub.endpoint, outcome: 'DELIVERED', last_error: null }),
          });
          if (!receipt.ok) throw new Error(`Delivery receipt failed: ${receipt.status}`);
          completed.add(sub.endpoint);
          pushed++;
        } else {
          alertFailures.push(`Push ${pRes.status} for one subscriber`);
        }
      } catch (e) {
        alertFailures.push(String(e).slice(0, 240));
      }
    }

    const currentReceipts = await fetch(`${supabaseUrl}/rest/v1/league_alert_deliveries?alert_id=eq.${a.id}&outcome=eq.DELIVERED&select=endpoint&limit=5000`, { headers: h });
    if (!currentReceipts.ok) return new Response(`Could not count delivery receipts for alert ${a.id}`, { status: 500 });
    const totalDelivered = (await currentReceipts.json()).length;

    const attempts = a.attempts + (alertFailures.length ? 1 : 0);
    let deliveryStatus: string;
    let sentAt: string | null = null;
    let failedAt: string | null = null;

    if (alertFailures.length) {
      deliveryStatus = attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING';
      if (deliveryStatus === 'FAILED') failedAt = new Date().toISOString();
      failed++;
    } else if (totalDelivered > 0) {
      deliveryStatus = 'SENT';
      sentAt = new Date().toISOString();
    } else {
      deliveryStatus = 'NO_RECIPIENTS';
      sentAt = new Date().toISOString();
      noRecipients++;
    }

    const patch = await fetch(`${supabaseUrl}/rest/v1/league_alerts?id=eq.${a.id}`, {
      method: 'PATCH',
      headers: { ...h, Prefer: 'return=minimal' },
      body: JSON.stringify({
        delivery_status: deliveryStatus,
        sent_at: sentAt,
        failed_at: failedAt,
        attempts,
        delivered_count: totalDelivered,
        last_attempt_at: new Date().toISOString(),
        last_error: alertFailures.length ? alertFailures.slice(0, 4).join('; ').slice(0, 1000) : null,
      }),
    });
    if (!patch.ok) return new Response(`Could not update alert ${a.id}`, { status: 500 });
  }

  return new Response(JSON.stringify({ alerts: alerts.length, pushed, failed, noRecipients }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
