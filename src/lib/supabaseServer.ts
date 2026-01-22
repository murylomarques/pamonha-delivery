// src/lib/supabaseServer.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing env: ${name}`);
  }
  return v;
}

/**
 * Supabase Admin (Service Role) - SERVER ONLY
 * - Cria o client "sob demanda" (lazy)
 * - Evita quebrar o build da Vercel quando o módulo é avaliado
 */
export function getSupabaseAdmin(): SupabaseClient {
  const url = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
