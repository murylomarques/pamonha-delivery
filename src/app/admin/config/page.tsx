"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseMoney(input: string) {
  // aceita "7", "7.5", "7,5", "7,50"
  const s = input.trim().replace(/\s/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export default function AdminConfig() {
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [frete, setFrete] = useState<string>("7.00");

  const [msg, setMsg] = useState<{ type: "error" | "ok"; text: string } | null>(null);

  const fretePreview = useMemo(() => {
    const n = parseMoney(frete);
    if (!Number.isFinite(n)) return null;
    return n;
  }, [frete]);

  useEffect(() => {
    (async () => {
      // 1) logado
      const { data } = await supabase.auth.getUser();
      if (!data.user) return (window.location.href = "/login");

      // 2) admin
      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      if (profErr || profile?.role !== "admin") {
        alert("Sem permissão de admin.");
        window.location.href = "/";
        return;
      }

      setOk(true);
      await loadSettings();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSettings() {
    setLoading(true);
    setMsg(null);

    const { data, error } = await supabase
      .from("settings")
      .select("key,value")
      .in("key", ["frete_valor"]);

    if (error) {
      setMsg({ type: "error", text: error.message });
      setLoading(false);
      return;
    }

    const map = new Map((data || []).map((r: any) => [r.key, r.value]));
    setFrete(String(map.get("frete_valor") ?? "7.00"));
    setLoading(false);
  }

  async function save() {
    setMsg(null);

    const n = parseMoney(frete);
    if (!Number.isFinite(n) || n < 0) {
      return setMsg({ type: "error", text: "Frete inválido. Ex: 7.00" });
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("settings")
        .upsert({ key: "frete_valor", value: n.toFixed(2) }, { onConflict: "key" });

      if (error) throw new Error(error.message);

      setMsg({ type: "ok", text: "Configurações salvas ✅" });
      await loadSettings();
    } catch (e: any) {
      setMsg({ type: "error", text: e?.message || "Erro ao salvar." });
    } finally {
      setSaving(false);
    }
  }

  if (!ok) {
    return <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <a href="/admin" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10">⚙️</div>
            <div className="leading-tight">
              <p className="text-xs text-zinc-400">Admin</p>
              <p className="text-base font-semibold tracking-tight">Config</p>
            </div>
          </a>

          <div className="flex items-center gap-2">
            <a
              href="/admin"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
            >
              ← Admin
            </a>
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
            >
              Loja
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Configurações da loja</h1>
              <p className="mt-1 text-sm text-zinc-400">
                Ajuste frete e opções gerais.
              </p>
            </div>
          </div>

          {msg && (
            <div
              className={`mt-4 rounded-2xl border p-4 text-sm ${
                msg.type === "ok"
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                  : "border-rose-500/20 bg-rose-500/10 text-rose-200"
              }`}
            >
              {msg.text}
            </div>
          )}

          {loading ? (
            <div className="mt-6 space-y-3">
              <div className="h-12 w-full animate-pulse rounded-2xl border border-white/10 bg-white/5" />
              <div className="h-12 w-full animate-pulse rounded-2xl border border-white/10 bg-white/5" />
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div>
                <label className="text-xs text-zinc-400">Frete (R$)</label>
                <input
                  value={frete}
                  onChange={(e) => setFrete(e.target.value)}
                  placeholder="7.00"
                  inputMode="decimal"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
                />
                <p className="mt-2 text-xs text-zinc-500">
                  Preview:{" "}
                  <span className="text-zinc-200 font-semibold">
                    {fretePreview === null ? "—" : formatBRL(fretePreview)}
                  </span>
                </p>
              </div>

              <button
                onClick={save}
                disabled={saving}
                className={`w-full rounded-2xl px-4 py-4 text-sm font-semibold transition ${
                  saving
                    ? "cursor-not-allowed bg-white/10 text-zinc-400"
                    : "bg-white text-zinc-900 hover:bg-zinc-200 active:scale-[0.99]"
                }`}
              >
                {saving ? "Salvando..." : "Salvar configurações"}
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
