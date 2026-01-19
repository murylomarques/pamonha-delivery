"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type OrderStatus = "PENDENTE" | "PAGO" | "CANCELADO";

type OrderRow = {
  id: string;
  user_id: string;
  cidade: string;
  dia_semana: number;
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  subtotal: number;
  frete: number;
  total: number;
  status: OrderStatus;
  created_at: string;

  order_items?: Array<{
    id: number;
    product_id: number;
    quantidade: number;
    preco_unit: number;
    subtotal: number;
    products?: { nome: string; image_url: string | null } | null;
  }>;
};

const DIAS = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

function formatBRL(v: number) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: string) {
  try {
    return new Date(d).toLocaleString("pt-BR");
  } catch {
    return d;
  }
}

function badgeClasses(status: OrderStatus) {
  if (status === "PAGO") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";
  if (status === "PENDENTE") return "border-amber-500/20 bg-amber-500/10 text-amber-200";
  return "border-zinc-500/20 bg-zinc-500/10 text-zinc-200";
}

export default function AdminPedidosPage() {
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [msg, setMsg] = useState<{ type: "error" | "ok"; text: string } | null>(null);

  // filtros
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<OrderStatus | "ALL">("ALL");
  const [dia, setDia] = useState<number>(0);

  // modal
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<OrderRow | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        window.location.href = "/login";
        return;
      }

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
      await loadOrders();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadOrders() {
    setLoading(true);
    setMsg(null);

    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        id,user_id,cidade,dia_semana,cep,rua,numero,complemento,
        subtotal,frete,total,status,created_at,
        order_items(
          id,product_id,quantidade,preco_unit,subtotal,
          products(nome,image_url)
        )
      `
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      setMsg({ type: "error", text: error.message });
      setOrders([]);
      setLoading(false);
      return;
    }

    setOrders((data || []) as OrderRow[]);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();

    return orders.filter((o) => {
      if (status !== "ALL" && o.status !== status) return false;
      if (dia && Number(o.dia_semana) !== Number(dia)) return false;

      if (term) {
        const inCidade = (o.cidade || "").toLowerCase().includes(term);
        const inId = (o.id || "").toLowerCase().includes(term);
        const inCep = (o.cep || "").toLowerCase().includes(term);
        if (!inCidade && !inId && !inCep) return false;
      }
      return true;
    });
  }, [orders, q, status, dia]);

  const stats = useMemo(() => {
    const all = orders.length;
    const pend = orders.filter((o) => o.status === "PENDENTE").length;
    const pago = orders.filter((o) => o.status === "PAGO").length;
    const canc = orders.filter((o) => o.status === "CANCELADO").length;
    return { all, pend, pago, canc };
  }, [orders]);

  function openDetails(o: OrderRow) {
    setSelected(o);
    setOpen(true);
  }

  function closeDetails() {
    setOpen(false);
    setSelected(null);
  }

  if (!ok) {
    return <div className="p-6 text-zinc-100">Carregando...</div>;
  }

  return (
    <div className="space-y-5">
      {/* topo da página (SEM MENU) */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Veja pedidos, abra detalhes e acompanhe o status.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-zinc-950/20 p-3">
                <div className="text-xs text-zinc-400">Total</div>
                <div className="text-lg font-semibold">{stats.all}</div>
              </div>
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3">
                <div className="text-xs text-amber-200/80">Pendentes</div>
                <div className="text-lg font-semibold text-amber-100">{stats.pend}</div>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                <div className="text-xs text-emerald-200/80">Pagos</div>
                <div className="text-lg font-semibold text-emerald-100">{stats.pago}</div>
              </div>
              <div className="rounded-2xl border border-zinc-500/20 bg-zinc-500/10 p-3">
                <div className="text-xs text-zinc-300/80">Cancelados</div>
                <div className="text-lg font-semibold">{stats.canc}</div>
              </div>
            </div>
          </div>

          {/* filtros */}
          <div className="grid w-full gap-2 sm:grid-cols-3 lg:w-[560px]">
            <div className="sm:col-span-3">
              <label className="text-xs text-zinc-400">Buscar (cidade, id, CEP)</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Digite para filtrar..."
                className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none focus:border-white/20"
              >
                <option value="ALL">Todos</option>
                <option value="PENDENTE">Pendente</option>
                <option value="PAGO">Pago</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-zinc-400">Dia (entrega)</label>
              <select
                value={dia}
                onChange={(e) => setDia(Number(e.target.value))}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none focus:border-white/20"
              >
                <option value={0}>Todos</option>
                {DIAS.slice(1).map((d, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end gap-2">
              <button
                onClick={loadOrders}
                className="w-full rounded-2xl border border-white/10 bg-zinc-950/20 px-4 py-3 text-sm font-semibold hover:bg-white/5"
              >
                Atualizar
              </button>
            </div>

            <div className="flex items-end gap-2 sm:col-span-2">
              <button
                onClick={() => {
                  setQ("");
                  setStatus("ALL");
                  setDia(0);
                }}
                className="w-full rounded-2xl border border-white/10 bg-zinc-950/20 px-4 py-3 text-sm font-semibold hover:bg-white/5"
              >
                Limpar filtros
              </button>
            </div>
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
      </div>

      {/* lista */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-3xl border border-white/10 bg-white/5" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
          Nenhum pedido encontrado com esses filtros.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((o) => (
            <button
              key={o.id}
              onClick={() => openDetails(o)}
              className="text-left rounded-3xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10 active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-zinc-400">Pedido</div>
                  <div className="mt-1 truncate text-sm font-semibold">{o.id}</div>
                </div>
                <div className={`shrink-0 rounded-2xl border px-3 py-2 text-xs font-semibold ${badgeClasses(o.status)}`}>
                  {o.status}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-zinc-400">Entrega</div>
                  <div className="mt-1 font-semibold">
                    {DIAS[o.dia_semana]} • {o.cidade}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-zinc-400">Total</div>
                  <div className="mt-1 font-semibold">{formatBRL(Number(o.total))}</div>
                </div>

                <div className="col-span-2">
                  <div className="text-xs text-zinc-400">Criado em</div>
                  <div className="mt-1 text-zinc-200">{fmtDate(o.created_at)}</div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-950/20 p-3 text-xs text-zinc-400">
                Clique para ver detalhes (itens + endereço)
              </div>
            </button>
          ))}
        </div>
      )}

      {/* modal */}
      {open && selected && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeDetails} />

          <div className="relative w-full max-w-3xl rounded-3xl border border-white/10 bg-zinc-950 text-zinc-100 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 p-6">
              <div className="min-w-0">
                <div className="text-xs text-zinc-400">Detalhes do pedido</div>
                <div className="mt-1 truncate text-sm font-semibold">{selected.id}</div>
                <div className="mt-2 text-sm text-zinc-300">
                  {DIAS[selected.dia_semana]} • {selected.cidade}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${badgeClasses(selected.status)}`}>
                  {selected.status}
                </div>
                <button
                  onClick={closeDetails}
                  className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold hover:bg-white/10"
                >
                  Fechar
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_320px]">
              {/* itens */}
              <div>
                <h3 className="text-lg font-semibold">Itens</h3>
                <p className="mt-1 text-sm text-zinc-400">Produtos e quantidades.</p>

                <div className="mt-4 space-y-3">
                  {(selected.order_items || []).length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
                      Nenhum item encontrado nesse pedido.
                    </div>
                  ) : (
                    selected.order_items?.map((it) => (
                      <div
                        key={it.id}
                        className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4"
                      >
                        <div className="h-12 w-16 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-zinc-950/40">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={it.products?.image_url || "https://placehold.co/480x320?text=Produto"}
                            alt={it.products?.nome || "Produto"}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">
                            {it.products?.nome || `Produto #${it.product_id}`}
                          </div>
                          <div className="mt-1 text-xs text-zinc-400">
                            {it.quantidade}x • {formatBRL(Number(it.preco_unit))}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xs text-zinc-400">Subtotal</div>
                          <div className="text-sm font-semibold">{formatBRL(Number(it.subtotal))}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* resumo/endereço */}
              <div className="h-fit rounded-3xl border border-white/10 bg-white/5 p-5">
                <h3 className="text-lg font-semibold">Resumo</h3>

                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-300">Subtotal</span>
                    <span className="font-semibold">{formatBRL(Number(selected.subtotal))}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-300">Frete</span>
                    <span className="font-semibold">{formatBRL(Number(selected.frete))}</span>
                  </div>

                  <div className="my-2 border-t border-white/10" />

                  <div className="flex items-center justify-between">
                    <span className="text-zinc-300">Total</span>
                    <span className="text-lg font-semibold">{formatBRL(Number(selected.total))}</span>
                  </div>
                </div>

                <div className="mt-5">
                  <h4 className="text-sm font-semibold">Endereço</h4>

                  <div className="mt-2 rounded-2xl border border-white/10 bg-zinc-950/20 p-4 text-sm text-zinc-300">
                    <div className="font-semibold text-zinc-100">
                      {selected.rua}, {selected.numero}
                    </div>

                    {selected.complemento ? (
                      <div className="mt-1 text-zinc-300">{selected.complemento}</div>
                    ) : null}

                    <div className="mt-2 text-xs text-zinc-400">
                      CEP: {selected.cep} • Cidade: {selected.cidade}
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-zinc-500">
                    Criado em: <span className="text-zinc-300">{fmtDate(selected.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 p-6">
              <div className="text-xs text-zinc-500">
                Depois, com Mercado Pago, o status muda automaticamente para <b>PAGO</b> via webhook.
              </div>
              <button
                onClick={closeDetails}
                className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
              >
                Ok
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
