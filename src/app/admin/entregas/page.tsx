"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type PaymentStatus = "PENDENTE" | "PAGO" | "CANCELADO";
type DeliveryStatus = "NOVO" | "EM_ROTA" | "ENTREGUE" | "FALHOU";

type ProductMini = { nome: string; image_url: string | null };

// ✅ aqui é o ponto: pode vir objeto OU array (dependendo do relacionamento no Supabase)
type ProductMaybeArray = ProductMini | ProductMini[] | null;

type OrderRow = {
  id: string;
  cidade: string;
  dia_semana: number;
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  subtotal: number;
  frete: number;
  total: number;
  status: PaymentStatus;
  created_at: string;

  delivery_status: DeliveryStatus;
  delivery_notes: string;
  delivered_at: string | null;

  order_items?: Array<{
    id: number;
    product_id: number;
    quantidade: number;
    preco_unit: number;
    subtotal: number;
    products?: ProductMaybeArray;
  }>;
};

const DIAS = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

function formatBRL(v: number) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleString("pt-BR");
  } catch {
    return String(d);
  }
}

function todayDiaSemanaBR(): number {
  // JS: 0 domingo..6 sábado -> queremos 1..7 (seg..dom)
  const js = new Date().getDay(); // 0..6
  if (js === 0) return 7;
  return js; // 1..6 ok
}

function badgeDelivery(ds: DeliveryStatus) {
  if (ds === "ENTREGUE") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";
  if (ds === "EM_ROTA") return "border-sky-500/20 bg-sky-500/10 text-sky-200";
  if (ds === "FALHOU") return "border-rose-500/20 bg-rose-500/10 text-rose-200";
  return "border-amber-500/20 bg-amber-500/10 text-amber-200"; // NOVO
}

function badgePay(ps: PaymentStatus) {
  if (ps === "PAGO") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";
  if (ps === "PENDENTE") return "border-amber-500/20 bg-amber-500/10 text-amber-200";
  return "border-zinc-500/20 bg-zinc-500/10 text-zinc-200";
}

// ✅ normaliza product (se vier array, pega o primeiro)
function firstProduct(p: ProductMaybeArray): ProductMini | null {
  if (!p) return null;
  if (Array.isArray(p)) return p[0] ?? null;
  return p;
}

export default function AdminEntregasPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [msg, setMsg] = useState<{ type: "error" | "ok"; text: string } | null>(null);

  // filtros
  const [dia, setDia] = useState<number>(todayDiaSemanaBR());
  const [payStatus, setPayStatus] = useState<PaymentStatus | "ALL">("PENDENTE");
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus | "ALL">("ALL");
  const [cidade, setCidade] = useState<string>("ALL");
  const [q, setQ] = useState("");

  // modal detalhes
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<OrderRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadOrders() {
    setLoading(true);
    setMsg(null);

    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        id,cidade,dia_semana,cep,rua,numero,complemento,
        subtotal,frete,total,status,created_at,
        delivery_status,delivery_notes,delivered_at,
        order_items(
          id,product_id,quantidade,preco_unit,subtotal,
          products(nome,image_url)
        )
      `
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      setMsg({ type: "error", text: error.message });
      setOrders([]);
      setLoading(false);
      return;
    }

    // ✅ aqui resolve o erro do build: converte via unknown
    setOrders((data || []) as unknown as OrderRow[]);
    setLoading(false);
  }

  const cidadesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      const c = String(o.cidade || "").trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [orders]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();

    return orders.filter((o) => {
      if (dia && Number(o.dia_semana) !== Number(dia)) return false;
      if (payStatus !== "ALL" && o.status !== payStatus) return false;
      if (deliveryStatus !== "ALL" && o.delivery_status !== deliveryStatus) return false;
      if (cidade !== "ALL" && (o.cidade || "") !== cidade) return false;

      if (term) {
        const inId = (o.id || "").toLowerCase().includes(term);
        const inRua = (o.rua || "").toLowerCase().includes(term);
        const inCep = (o.cep || "").toLowerCase().includes(term);
        const inNumero = (o.numero || "").toLowerCase().includes(term);
        if (!inId && !inRua && !inCep && !inNumero) return false;
      }
      return true;
    });
  }, [orders, dia, payStatus, deliveryStatus, cidade, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, OrderRow[]>();
    filtered.forEach((o) => {
      const key = (o.cidade || "Sem cidade").trim();
      const arr = map.get(key) || [];
      arr.push(o);
      map.set(key, arr);
    });

    const keys = Array.from(map.keys()).sort((a, b) => a.localeCompare(b, "pt-BR"));

    return keys.map((k) => {
      const list = map.get(k) || [];
      list.sort((a, b) => {
        const ra = `${a.rua || ""} ${a.numero || ""}`.toLowerCase();
        const rb = `${b.rua || ""} ${b.numero || ""}`.toLowerCase();
        return ra.localeCompare(rb, "pt-BR");
      });
      return { cidade: k, orders: list };
    });
  }, [filtered]);

  const totals = useMemo(() => {
    const count = filtered.length;
    const total = filtered.reduce((acc, o) => acc + Number(o.total || 0), 0);
    const entregues = filtered.filter((o) => o.delivery_status === "ENTREGUE").length;
    const emRota = filtered.filter((o) => o.delivery_status === "EM_ROTA").length;
    const falhou = filtered.filter((o) => o.delivery_status === "FALHOU").length;
    const novo = filtered.filter((o) => o.delivery_status === "NOVO").length;
    return { count, total, novo, emRota, entregues, falhou };
  }, [filtered]);

  function openDetails(o: OrderRow) {
    setSelected(o);
    setNotes(o.delivery_notes || "");
    setOpen(true);
  }

  function closeDetails() {
    setOpen(false);
    setSelected(null);
    setNotes("");
  }

  async function updateDelivery(orderId: string, next: DeliveryStatus) {
    setMsg(null);
    setSaving(true);
    try {
      const payload: any = {
        delivery_status: next,
        delivery_notes: notes ?? "",
      };

      if (next === "ENTREGUE") payload.delivered_at = new Date().toISOString();
      if (next !== "ENTREGUE") payload.delivered_at = null;

      const { error } = await supabase.from("orders").update(payload).eq("id", orderId);
      if (error) throw new Error(error.message);

      setMsg({ type: "ok", text: `Entrega atualizada para ${next} ✅` });

      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                delivery_status: next,
                delivery_notes: payload.delivery_notes,
                delivered_at: payload.delivered_at,
              }
            : o
        )
      );

      setSelected((cur) =>
        cur && cur.id === orderId
          ? {
              ...cur,
              delivery_status: next,
              delivery_notes: payload.delivery_notes,
              delivered_at: payload.delivered_at,
            }
          : cur
      );
    } catch (e: any) {
      setMsg({ type: "error", text: e?.message || "Erro ao atualizar entrega." });
    } finally {
      setSaving(false);
    }
  }

  function printRoteiro() {
    window.print();
  }

  return (
    <div className="space-y-5">
      {/* topo */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 print:hidden">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Entregas</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Operação do dia: filtra, organiza por cidade e marca status da entrega.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-6">
              <div className="rounded-2xl border border-white/10 bg-zinc-950/20 p-3">
                <div className="text-xs text-zinc-400">Dia</div>
                <div className="text-lg font-semibold">{DIAS[dia] || "-"}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-zinc-950/20 p-3">
                <div className="text-xs text-zinc-400">Pedidos</div>
                <div className="text-lg font-semibold">{totals.count}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-zinc-950/20 p-3">
                <div className="text-xs text-zinc-400">Total (R$)</div>
                <div className="text-lg font-semibold">{formatBRL(totals.total)}</div>
              </div>

              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3">
                <div className="text-xs text-amber-200/80">NOVO</div>
                <div className="text-lg font-semibold text-amber-100">{totals.novo}</div>
              </div>
              <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-3">
                <div className="text-xs text-sky-200/80">EM ROTA</div>
                <div className="text-lg font-semibold text-sky-100">{totals.emRota}</div>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                <div className="text-xs text-emerald-200/80">ENTREGUE</div>
                <div className="text-lg font-semibold text-emerald-100">{totals.entregues}</div>
              </div>

              <button
                onClick={printRoteiro}
                className="sm:col-span-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
              >
                🖨️ Imprimir
              </button>
              <button
                onClick={loadOrders}
                className="sm:col-span-2 rounded-2xl border border-white/10 bg-zinc-950/20 px-4 py-3 text-sm font-semibold hover:bg-white/5"
              >
                Atualizar
              </button>
            </div>
          </div>

          {/* filtros */}
          <div className="grid w-full gap-2 sm:grid-cols-4 lg:w-[760px]">
            <div>
              <label className="text-xs text-zinc-400">Dia (entrega)</label>
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

            <div>
              <label className="text-xs text-zinc-400">Pagamento</label>
              <select
                value={payStatus}
                onChange={(e) => setPayStatus(e.target.value as any)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none focus:border-white/20"
              >
                <option value="ALL">Todos</option>
                <option value="PENDENTE">Pendente</option>
                <option value="PAGO">Pago</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-zinc-400">Entrega</label>
              <select
                value={deliveryStatus}
                onChange={(e) => setDeliveryStatus(e.target.value as any)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none focus:border-white/20"
              >
                <option value="ALL">Todos</option>
                <option value="NOVO">NOVO</option>
                <option value="EM_ROTA">EM ROTA</option>
                <option value="ENTREGUE">ENTREGUE</option>
                <option value="FALHOU">FALHOU</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-zinc-400">Cidade</label>
              <select
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none focus:border-white/20"
              >
                <option value="ALL">Todas</option>
                {cidadesDisponiveis.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-4">
              <label className="text-xs text-zinc-400">Buscar (rua/cep/id/número)</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ex: Rua / CEP / parte do ID / número"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
              />
            </div>

            <div className="sm:col-span-4 flex flex-wrap gap-2 pt-1">
              <button
                onClick={() => {
                  setCidade("ALL");
                  setPayStatus("PENDENTE");
                  setDeliveryStatus("ALL");
                  setQ("");
                }}
                className="rounded-2xl border border-white/10 bg-zinc-950/20 px-4 py-3 text-sm font-semibold hover:bg-white/5"
              >
                Limpar
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

      {/* print header */}
      <div className="hidden print:block">
        <div className="mb-3 text-lg font-semibold">Entregas — {DIAS[dia]}</div>
        <div className="mb-4 text-sm">
          Pedidos: <b>{totals.count}</b> • Total: <b>{formatBRL(totals.total)}</b> • Gerado em:{" "}
          <b>{new Date().toLocaleString("pt-BR")}</b>
        </div>
      </div>

      {/* list */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-3xl border border-white/10 bg-white/5" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
          Nenhum pedido encontrado para esses filtros.
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map((g) => (
            <div key={g.cidade} className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-xs text-zinc-400">Cidade</div>
                  <div className="mt-1 text-xl font-semibold">{g.cidade}</div>
                  <div className="mt-1 text-sm text-zinc-400">{g.orders.length} pedido(s)</div>
                </div>

                <div className="text-sm text-zinc-300">
                  Total cidade:{" "}
                  <b>{formatBRL(g.orders.reduce((acc, o) => acc + Number(o.total || 0), 0))}</b>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {g.orders.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => openDetails(o)}
                    className="text-left rounded-3xl border border-white/10 bg-zinc-950/20 p-5 transition hover:bg-white/5 active:scale-[0.99]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-zinc-400">Pedido</div>
                        <div className="mt-1 truncate text-sm font-semibold">{o.id}</div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <div className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${badgePay(o.status)}`}>
                          {o.status}
                        </div>
                        <div className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${badgeDelivery(o.delivery_status)}`}>
                          {o.delivery_status}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="text-xs text-zinc-400">Endereço</div>
                      <div className="mt-1 text-sm font-semibold text-zinc-100">
                        {o.rua}, {o.numero}
                      </div>
                      {o.complemento ? (
                        <div className="mt-1 text-sm text-zinc-300">{o.complemento}</div>
                      ) : null}
                      <div className="mt-2 text-xs text-zinc-400">CEP: {o.cep}</div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs text-zinc-400">Total</div>
                        <div className="mt-1 font-semibold">{formatBRL(Number(o.total))}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs text-zinc-400">Criado</div>
                        <div className="mt-1 text-xs text-zinc-200">{fmtDate(o.created_at)}</div>
                      </div>
                    </div>

                    <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-zinc-400">
                      Clique para abrir e marcar entrega
                    </div>

                    <div className="mt-4 hidden print:block">
                      <div className="h-10 rounded border border-zinc-300" />
                      <div className="mt-1 text-xs text-zinc-600">Assinatura / confirmação</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* modal */}
      {open && selected && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeDetails} aria-label="Fechar" />

          <div className="relative w-full max-w-3xl rounded-3xl border border-white/10 bg-zinc-950 text-zinc-100 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 p-6">
              <div className="min-w-0">
                <div className="text-xs text-zinc-400">Entrega • Pedido</div>
                <div className="mt-1 truncate text-sm font-semibold">{selected.id}</div>
                <div className="mt-2 text-sm text-zinc-300">
                  {DIAS[selected.dia_semana]} • {selected.cidade}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${badgePay(selected.status)}`}>
                  {selected.status}
                </div>
                <div className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${badgeDelivery(selected.delivery_status)}`}>
                  {selected.delivery_status}
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
                    selected.order_items?.map((it) => {
                      const p = firstProduct(it.products ?? null);
                      const img = p?.image_url || "https://placehold.co/480x320?text=Produto";
                      const name = p?.nome || `Produto #${it.product_id}`;

                      return (
                        <div key={it.id} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="h-12 w-16 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-zinc-950/40">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={img}
                              alt={name}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">{name}</div>
                            <div className="mt-1 text-xs text-zinc-400">
                              {it.quantidade}x • {formatBRL(Number(it.preco_unit))}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-xs text-zinc-400">Subtotal</div>
                            <div className="text-sm font-semibold">{formatBRL(Number(it.subtotal))}</div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="mt-5">
                  <label className="text-xs text-zinc-400">Observação da entrega</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ex: cliente pediu para chamar no portão / sem troco / etc..."
                    className="mt-2 h-28 w-full resize-none rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
                  />
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
                    {selected.complemento ? <div className="mt-1">{selected.complemento}</div> : null}
                    <div className="mt-2 text-xs text-zinc-400">
                      CEP: {selected.cep} • Cidade: {selected.cidade}
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-zinc-500">
                    Criado: <span className="text-zinc-300">{fmtDate(selected.created_at)}</span>
                    <br />
                    Entregue: <span className="text-zinc-300">{fmtDate(selected.delivered_at)}</span>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    disabled={saving}
                    onClick={() => updateDelivery(selected.id, "EM_ROTA")}
                    className="rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm font-semibold text-sky-200 hover:bg-sky-500/15 disabled:opacity-50"
                  >
                    🚚 EM ROTA
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => updateDelivery(selected.id, "ENTREGUE")}
                    className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-50"
                  >
                    ✅ ENTREGUE
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => updateDelivery(selected.id, "FALHOU")}
                    className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 hover:bg-rose-500/15 disabled:opacity-50"
                  >
                    ❌ FALHOU
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => updateDelivery(selected.id, "NOVO")}
                    className="rounded-2xl border border-white/10 bg-zinc-950/20 px-4 py-3 text-sm font-semibold hover:bg-white/5 disabled:opacity-50"
                  >
                    ↩️ VOLTAR
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 p-6">
              <div className="text-xs text-zinc-500">
                Pagamento e entrega são separados. Mercado Pago entra depois.
              </div>
              <button
                onClick={closeDetails}
                className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            color: #111 !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:block {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
}
