"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Product = {
  id: number;
  nome: string;
  preco: number;
  ativo: boolean;
  image_url: string | null;
};

type CapacityRow = {
  id: number;
  dia_semana: number; // 1..7
  product_id: number;
  limite_total: number;
};

const DIAS = [
  "",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function clampInt(v: any, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

async function requireAdminOrRedirect() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    window.location.href = "/login";
    return { ok: false, userId: null as string | null };
  }

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  if (profErr || profile?.role !== "admin") {
    alert("Sem permissão de admin.");
    window.location.href = "/";
    return { ok: false, userId: null };
  }

  return { ok: true, userId: data.user.id };
}

export default function AdminCapacidade() {
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [caps, setCaps] = useState<CapacityRow[]>([]);

  const [dia, setDia] = useState<number>(1);
  const [productId, setProductId] = useState<number>(0);
  const [limite, setLimite] = useState<string>("");

  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ type: "error" | "ok"; text: string } | null>(
    null
  );

  // métricas
  const [soldPaidByProduct, setSoldPaidByProduct] = useState<Record<number, number>>({});
  const [soldPendingByProduct, setSoldPendingByProduct] = useState<Record<number, number>>({});

  const filteredProducts = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return products;
    return products.filter((p) => p.nome.toLowerCase().includes(t));
  }, [products, q]);

  useEffect(() => {
    (async () => {
      const guard = await requireAdminOrRedirect();
      if (!guard.ok) return;

      setOk(true);
      await loadAll();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ok) return;
    // sempre que mudar o dia, recalcula “vendidos”
    (async () => {
      await loadSoldMaps(dia);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok, dia]);

  async function loadAll() {
    setLoading(true);
    setMsg(null);

    const [{ data: prods, error: prodErr }, { data: capRows, error: capErr }] =
      await Promise.all([
        supabase
          .from("products")
          .select("id,nome,preco,ativo,image_url")
          .order("id", { ascending: true }),
        supabase
          .from("daily_capacity")
          .select("id,dia_semana,product_id,limite_total")
          .order("dia_semana", { ascending: true }),
      ]);

    if (prodErr) setMsg({ type: "error", text: prodErr.message });
    if (capErr) setMsg({ type: "error", text: capErr.message });

    setProducts((prods || []) as Product[]);
    setCaps((capRows || []) as CapacityRow[]);

    // pré-seleciona um produto
    const firstActive = (prods || []).find((p: any) => p.ativo);
    setProductId(firstActive?.id ? Number(firstActive.id) : 0);

    await loadSoldMaps(dia);

    setLoading(false);
  }

  async function loadSoldMaps(diaSemana: number) {
    // PAGO
    const paid = await computeSoldByProduct(diaSemana, ["PAGO"]);
    setSoldPaidByProduct(paid);

    // PENDENTE (útil antes do MP)
    const pending = await computeSoldByProduct(diaSemana, ["PENDENTE"]);
    setSoldPendingByProduct(pending);
  }

  async function computeSoldByProduct(diaSemana: number, statuses: string[]) {
    const { data: ords, error: ordErr } = await supabase
      .from("orders")
      .select("id")
      .eq("dia_semana", diaSemana)
      .in("status", statuses);

    if (ordErr || !ords || ords.length === 0) return {};

    const orderIds = ords.map((o: any) => o.id);

    const { data: items, error: itErr } = await supabase
      .from("order_items")
      .select("product_id,quantidade")
      .in("order_id", orderIds);

    if (itErr || !items) return {};

    const map: Record<number, number> = {};
    for (const it of items as any[]) {
      const pid = Number(it.product_id);
      const qtd = Number(it.quantidade);
      map[pid] = (map[pid] || 0) + (Number.isFinite(qtd) ? qtd : 0);
    }
    return map;
  }

  function getCapFor(diaSemana: number, pid: number): CapacityRow | undefined {
    return caps.find((c) => c.dia_semana === diaSemana && c.product_id === pid);
  }

  function remainingFor(diaSemana: number, pid: number) {
    const cap = getCapFor(diaSemana, pid);
    const limit = cap ? Number(cap.limite_total) : 0;
    const paid = soldPaidByProduct[pid] || 0;
    const pend = soldPendingByProduct[pid] || 0;

    // “restante real” considerando só pagos (garantia)
    const restPaidOnly = Math.max(0, limit - paid);

    // “restante operacional” considerando pendentes (pra não aceitar 100 pendentes)
    const restWithPending = Math.max(0, limit - (paid + pend));

    return { limit, paid, pend, restPaidOnly, restWithPending };
  }

  function resetForm() {
    setLimite("");
    setMsg(null);
  }

  async function upsertCapacity() {
    setMsg(null);

    const pid = Number(productId);
    if (!pid) return setMsg({ type: "error", text: "Selecione um produto." });
    const lim = clampInt(limite, -1);
    if (lim < 0) return setMsg({ type: "error", text: "Informe um limite válido." });

    setSaving(true);
    try {
      // Seu unique (dia_semana, product_id) já existe ✅
      const { error } = await supabase
        .from("daily_capacity")
        .upsert(
          { dia_semana: Number(dia), product_id: pid, limite_total: lim },
          { onConflict: "dia_semana,product_id" }
        );

      if (error) throw new Error(error.message);

      setMsg({ type: "ok", text: "Capacidade salva ✅" });
      resetForm();
      await loadAll();
    } catch (e: any) {
      setMsg({ type: "error", text: e?.message || "Erro ao salvar." });
    } finally {
      setSaving(false);
    }
  }

  async function quickSet(pid: number, value: number) {
    setMsg(null);
    setSaving(true);
    try {
      const { error } = await supabase
        .from("daily_capacity")
        .upsert(
          { dia_semana: Number(dia), product_id: Number(pid), limite_total: clampInt(value) },
          { onConflict: "dia_semana,product_id" }
        );

      if (error) throw new Error(error.message);
      await loadAll();
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
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10">📦</div>
            <div className="leading-tight">
              <p className="text-xs text-zinc-400">Painel</p>
              <p className="text-base font-semibold tracking-tight">Capacidade</p>
            </div>
          </div>

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
              ← Loja
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Capacidade por dia</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Defina o limite por <b>produto + dia da semana</b>. A tela mostra vendidos (PAGO) e pendentes.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="w-full sm:w-56">
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

            <div className="w-full sm:w-72">
              <label className="text-xs text-zinc-400">Buscar produto</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Digite para filtrar..."
                className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
              />
            </div>
          </div>
        </div>

        {msg && (
          <div
            className={`mb-6 rounded-2xl border p-4 text-sm ${
              msg.type === "ok"
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                : "border-rose-500/20 bg-rose-500/10 text-rose-200"
            }`}
          >
            {msg.text}
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[420px_1fr]">
          {/* Form */}
          <section className="h-fit rounded-3xl border border-white/10 bg-white/5 p-6 lg:sticky lg:top-24">
            <h2 className="text-xl font-semibold tracking-tight">Definir capacidade</h2>
            <p className="mt-1 text-sm text-zinc-400">Escolha um produto e o limite do dia.</p>

            <div className="mt-5 space-y-3">
              <div>
                <label className="text-xs text-zinc-400">Produto</label>
                <select
                  value={productId}
                  onChange={(e) => setProductId(Number(e.target.value))}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none focus:border-white/20"
                >
                  <option value={0}>Selecione...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome} ({formatBRL(Number(p.preco))}){p.ativo ? "" : " — INATIVO"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-zinc-400">Limite total</label>
                <input
                  value={limite}
                  onChange={(e) => setLimite(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="Ex: 30"
                  inputMode="numeric"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
                />
                <p className="mt-2 text-xs text-zinc-500">
                  Dica: o sistema valida antes de criar o pedido (e depois vai validar de novo no pagamento).
                </p>
              </div>

              {productId ? (
                <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4 text-sm">
                  {(() => {
                    const r = remainingFor(dia, productId);
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-300">Limite</span>
                          <span className="font-semibold">{r.limit}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-300">Vendidos (PAGO)</span>
                          <span className="font-semibold">{r.paid}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-300">Pendentes</span>
                          <span className="font-semibold">{r.pend}</span>
                        </div>

                        <div className="my-2 border-t border-white/10" />

                        <div className="flex items-center justify-between">
                          <span className="text-zinc-300">Restante (só pagos)</span>
                          <span className="font-semibold text-emerald-200">{r.restPaidOnly}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-300">Restante (pagos + pendentes)</span>
                          <span className="font-semibold text-amber-200">{r.restWithPending}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : null}

              <button
                onClick={upsertCapacity}
                disabled={saving}
                className={`mt-2 w-full rounded-2xl px-4 py-4 text-sm font-semibold transition ${
                  saving
                    ? "cursor-not-allowed bg-white/10 text-zinc-400"
                    : "bg-white text-zinc-900 hover:bg-zinc-200 active:scale-[0.99]"
                }`}
              >
                {saving ? "Salvando..." : "Salvar capacidade"}
              </button>
            </div>
          </section>

          {/* List */}
          <section className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Produtos (dia: {DIAS[dia]})</h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    Ajuste rápido: clique nos botões ou edite pelo formulário.
                  </p>
                </div>

                <div className="text-xs text-zinc-500">
                  <div>✅ PAGO = definitivo</div>
                  <div>🟡 PENDENTE = reserva (antes do MP)</div>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-40 animate-pulse rounded-3xl border border-white/10 bg-white/5" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-1">
                {filteredProducts.map((p) => {
                  const cap = getCapFor(dia, p.id);
                  const r = remainingFor(dia, p.id);

                  const statusColor =
                    r.limit === 0
                      ? "border-rose-500/20 bg-rose-500/10 text-rose-200"
                      : r.restWithPending === 0
                      ? "border-amber-500/20 bg-amber-500/10 text-amber-200"
                      : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";

                  const statusText =
                    r.limit === 0 ? "SEM LIMITE" : r.restWithPending === 0 ? "LOTADO" : "DISPONÍVEL";

                  return (
                    <div
                      key={p.id}
                      className="rounded-3xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10"
                    >
                      <div className="flex items-start gap-4">
                        <div className="h-16 w-24 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/40">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.image_url || "https://placehold.co/480x320?text=Produto"}
                            alt={p.nome}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-lg font-semibold tracking-tight">
                                {p.nome}
                                {!p.ativo ? <span className="ml-2 text-xs text-zinc-400">(inativo)</span> : null}
                              </p>
                              <p className="mt-1 text-sm text-zinc-400">{formatBRL(Number(p.preco))}</p>
                            </div>

                            <div className={`shrink-0 rounded-2xl border px-3 py-2 text-xs font-semibold ${statusColor}`}>
                              {statusText}
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                            <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-3">
                              <div className="text-zinc-400">Limite</div>
                              <div className="mt-1 text-sm font-semibold">{r.limit}</div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-3">
                              <div className="text-zinc-400">PAGO</div>
                              <div className="mt-1 text-sm font-semibold">{r.paid}</div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-3">
                              <div className="text-zinc-400">PEND</div>
                              <div className="mt-1 text-sm font-semibold">{r.pend}</div>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
                            <span>Restante (op):</span>
                            <span className="font-semibold text-zinc-200">{r.restWithPending}</span>
                          </div>

                          <div className="mt-4 grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => quickSet(p.id, 0)}
                              className="rounded-2xl border border-white/10 bg-white/0 px-3 py-2.5 text-xs font-semibold text-zinc-100 hover:bg-white/5 disabled:opacity-50"
                            >
                              0
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => quickSet(p.id, 20)}
                              className="rounded-2xl border border-white/10 bg-white/0 px-3 py-2.5 text-xs font-semibold text-zinc-100 hover:bg-white/5 disabled:opacity-50"
                            >
                              20
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => {
                                setProductId(p.id);
                                setLimite(String(cap?.limite_total ?? ""));
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                              className="rounded-2xl bg-white px-3 py-2.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-200 disabled:opacity-50"
                            >
                              Editar
                            </button>
                          </div>

                          <p className="mt-3 text-xs text-zinc-500">
                            ID: <span className="text-zinc-300">{p.id}</span>
                            {cap ? (
                              <>
                                {" "}
                                • CapRow: <span className="text-zinc-300">{cap.id}</span>
                              </>
                            ) : null}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
