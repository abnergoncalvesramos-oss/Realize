import { createClient } from "@supabase/supabase-js";

// service_role: ignora RLS. NUNCA importe isso em código de cliente.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
