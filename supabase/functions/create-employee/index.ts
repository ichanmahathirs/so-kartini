// Edge Function: buat akun karyawan. Hanya bisa dipanggil akun ber-role admin.
// Kunci service_role tinggal di server Supabase, tidak pernah menyentuh browser.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
    });
    const { data: { user } } = await caller.auth.getUser();
    if (!user || user.app_metadata?.role !== "admin") return json({ error: "bukan admin" }, 403);

    const { username, password } = await req.json();
    if (!/^[a-z0-9._-]{2,30}$/.test(username ?? "")) {
      return json({ error: "username: huruf kecil/angka/titik/strip, 2-30 karakter, tanpa spasi" }, 400);
    }
    if ((password ?? "").length < 6) return json({ error: "password minimal 6 karakter" }, 400);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error } = await admin.auth.admin.createUser({
      email: `${username}@so-kartini.local`,
      password,
      email_confirm: true,
    });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, username });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
