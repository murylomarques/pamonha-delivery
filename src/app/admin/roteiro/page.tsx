"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type RouteDay = {
  id: number;
  cidade: string;
  dia_semana: number; // 1..7
  ativo: boolean;
  created_at: string;
};

const DIAS = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

function normalizeCity(s: string) {
  return s.trim().replace(/\s+/g, " ");
}

export default function AdminRoteiro() {
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [rows, setRows] = useState<RouteDay[]>([]);
  const [q, setQ] = useState("");

  // form
  const [editingId, setEditingId] = useState<number | null>(null);
  const [cidade, setCidade] = useState("");
  const [dia, setDia] = useState<number>(1);
  const [ativo, setAtivo] = useState(true);

  const [msg, setMsg] = useState<{ type: "error" | "ok"; text: string } | null>(null);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => r.cidade.toLowerCase().includes(t) || DIAS[r.dia_semana].toLowerCase().includes(t));
  }, [rows, q]);

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
      await loadRows();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadRows() {
    setLoading(true);
    setMsg(null);

    const { data, error } = await supabase
      .from("route_days")
      .select("id,cidade,dia_semana,ativo,created_at")
      .order("cidade", { ascending: true })
      .order("dia_semana", { ascending: true });

    if (error) setMsg({ type: "error", text: error.message });
    setRows((data || []) as RouteDay[]);
    setLoading(false);
  }

  function resetForm() {
    setEditingId(null);
    setCidade("");
    setDia(1);
    setAtivo(true);
    setMsg(null);
  }

  function startEdit(r: RouteDay) {
    setEditingId(r.id);
    setCidade(r.cidade);
    setDia(r.dia_semana);
    setAtivo(r.ativo);
    setMsg(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveRow() {
    setMsg(null);

    const c = normalizeCity(cidade);
    if (c.length < 2) return setMsg({ type: "error", text: "Informe uma cidade válida." });
    if (!(dia >= 1 && dia <= 7)) return setMsg({ type: "error", text: "Dia da semana inválido." });

    setSaving(true);
    try {
      if (!editingId) {
        // evita duplicado: mesma cidade + mesmo dia
        const { data: existing, error: exErr } = await supabase
          .from("route_days")
          .select("id")
          .eq("cidade", c)
          .eq("dia_semana", dia)
          .maybeSingle();

        if (exErr) throw new Error(exErr.message);
        if (existing?.id) {
          return setMsg({ type: "error", text: "Já existe essa cidade nesse dia. Edite o registro existente." });
        }

        const { error } = await supabase.from("route_days").insert({
          cidade: c,
          dia_semana: dia,
          ativo,
        });

        if (error) throw new Error(error.message);

        setMsg({ type: "ok", text: "Roteiro criado ✅" });
      } else {
        const { error } = await supabase
          .from("route_days")
          .update({ cidade: c, dia_semana: dia, ativo })
          .eq("id", editingId);

        if (error) throw new Error(error.message);

        setMsg({ type: "ok", text: "Roteiro atualizado ✅" });
      }

      resetForm();
      await loadRows();
    } catch (e: any) {
      setMsg({ type: "error", text: e?.message || "Erro ao salvar." });
    } finally {
      setSaving(false);
    }
  }

  async function toggleAtivo(r: RouteDay) {
    setMsg(null);
    const { error } = await supabase.from("route_days").update({ ativo: !r.ativo }).eq("id", r.id);
    if (error) return setMsg({ type: "error", text: error.message });
    await loadRows();
  }

  async function removeRow(r: RouteDay) {
    const sure = confirm(`Remover "${r.cidade}" de ${DIAS[r.dia_semana]}?`);
    if (!sure) return;

    setMsg(null);
    const { error } = await supabase.from("route_days").delete().eq("id", r.id);
    if (error) return setMsg({ type: "error", text: error.message });
    await loadRows();
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
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10">🗺️</div>
            <div className="leading-tight">
              <p className="text-xs text-zinc-400">Admin</p>
              <p className="text-base font-semibold tracking-tight">Roteiro</p>
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

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-8 lg:grid-cols-[380px_1fr]">
        {/* Form */}
        <section className="h-fit rounded-3xl border border-white/10 bg-white/5 p-6 lg:sticky lg:top-24">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                {editingId ? "Editar roteiro" : "Novo roteiro"}
              </h1>
              <p className="mt-1 text-sm text-zinc-400">
                Defina em quais dias o pai atende cada cidade.
              </p>
            </div>

            {editingId ? (
              <button
                onClick={resetForm}
                className="rounded-2xl border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-white/5"
              >
                Cancelar
              </button>
            ) : null}
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

          <div className="mt-5 space-y-3">
            <div>
              <label className="text-xs text-zinc-400">Cidade</label>
              <input
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                placeholder="Ex: Nova Odessa"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
              />
              <p className="mt-2 text-xs text-zinc-500">
                Dica: use o mesmo nome que o ViaCEP retorna (ex: “Nova Odessa”).
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-zinc-400">Dia da semana</label>
                <select
                  value={dia}
                  onChange={(e) => setDia(Number(e.target.value))}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none focus:border-white/20"
                >
                  {DIAS.slice(1).map((d, idx) => (
                    <option key={idx + 1} value={idx + 1}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <label className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-zinc-950/30 px-4 py-3">
                  <span className="text-sm font-semibold text-zinc-200">Ativo</span>
                  <input
                    type="checkbox"
                    checked={ativo}
                    onChange={(e) => setAtivo(e.target.checked)}
                    className="h-5 w-5 accent-white"
                  />
                </label>
              </div>
            </div>

            <button
              onClick={saveRow}
              disabled={saving}
              className={`mt-2 w-full rounded-2xl px-4 py-4 text-sm font-semibold transition ${
                saving
                  ? "cursor-not-allowed bg-white/10 text-zinc-400"
                  : "bg-white text-zinc-900 hover:bg-zinc-200 active:scale-[0.99]"
              }`}
            >
              {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Criar roteiro"}
            </button>
          </div>
        </section>

        {/* List */}
        <section className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Roteiros cadastrados</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Cidades e dias disponíveis no checkout.
                </p>
              </div>

              <div className="w-full sm:w-80">
                <label className="text-xs text-zinc-400">Buscar</label>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Cidade ou dia..."
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-3xl border border-white/10 bg-white/5" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
              Nenhum roteiro cadastrado.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {filtered.map((r) => (
                <div key={r.id} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold tracking-tight">{r.cidade}</p>
                      <p className="mt-1 text-sm text-zinc-400">{DIAS[r.dia_semana]}</p>
                    </div>

                    <div
                      className={`shrink-0 rounded-2xl border px-3 py-2 text-xs font-semibold ${
                        r.ativo
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                          : "border-zinc-500/20 bg-zinc-500/10 text-zinc-200"
                      }`}
                    >
                      {r.ativo ? "ATIVO" : "INATIVO"}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <button
                      onClick={() => startEdit(r)}
                      className="w-full rounded-2xl bg-white px-3 py-2.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-200 whitespace-nowrap"
                    >
                      Editar
                    </button>

                    <button
                      onClick={() => toggleAtivo(r)}
                      className="w-full rounded-2xl border border-white/10 bg-white/0 px-3 py-2.5 text-xs font-semibold text-zinc-100 hover:bg-white/5 whitespace-nowrap"
                    >
                      {r.ativo ? "Desativar" : "Ativar"}
                    </button>

                    <button
                      onClick={() => removeRow(r)}
                      className="col-span-2 sm:col-span-1 w-full rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/15 whitespace-nowrap"
                    >
                      Remover
                    </button>
                  </div>

                  <p className="mt-3 text-xs text-zinc-500">
                    ID: <span className="text-zinc-300">{r.id}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
