"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type PayStatus = "PENDENTE" | "PAGO" | "CANCELADO";
type DeliveryStatus = string; // (NOVO | EM_ROTA | ENTREGUE | CANCELADO...) conforme seu enum

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
  status: PayStatus;
  mp_preference_id: string | null;
  mp_payment_id: string | null;
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
    products?: { nome: string; image_url: string | null } | null;
  }>;
};

const DIAS = ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

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

function payBadge(s: PayStatus) {
  if (s === "PAGO") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";
  if (s === "PENDENTE") return "border-amber-500/20 bg-amber-500/10 text-amber-200";
  return "border-rose-500/20 bg-rose-500/10 text-rose-200";
}

function delBadge(s: string) {
  const v = String(s || "").toUpperCase();
  if (v.includes("ENTREG")) return "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";
  if (v.includes("ROTA")) return "border-sky-500/20 bg-sky-500/10 text-sky-200";
  if (v.includes("CANCEL")) return "border-rose-500/20 bg-rose-500/10 text-rose-200";
  return "border-zinc-500/20 bg-zinc-500/10 text-zinc-200";
}

export default function AdminPedidosPage() {
  const router = useRouter();

  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [msg, setMsg] = useState<{ type: "error" | "ok"; text: string } | null>(null);

  // filtros
  const [q, setQ] = useState("");
  const [pay, setPay] = useState<PayStatus | "ALL">("ALL");
  const [del, setDel] = useState<string>("ALL");
  const [cidade, setCidade] = useState<string>("");

  // modal
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<OrderRow | null>(null);
  const [saving, setSaving] = useState(false);

  // edição entrega
  const [editDelStatus, setEditDelStatus] = useState<string>("NOVO");
  const [editNotes, setEditNotes] = useState<string>("");

  useEffect(() => {
    (async () => {
      // 1) precisa estar logado
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login?next=/admin/pedidos");
        return;
      }

      // 2) checa role admin via RLS (ou via supabaseAdmin no server, mas aqui é client)
      const { data: prof } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
      if (prof?.role !== "admin") {
        alert("Sem permissão de admin.");
        router.replace("/");
        return;
      }

      setOk(true);
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token || "";
    return token;
  }

  async function load() {
    setLoading(true);
    setMsg(null);

    const token = await getAccessToken();
    if (!token) {
      setMsg({ type: "error", text: "Sem sessão. Faça login novamente." });
      setLoading(false);
      return;
    }

    const qs = new URLSearchParams();
    if (q.trim()) qs.set("q", q.trim());
    qs.set("pay", pay);
    qs.set("del", del);
    if (cidade.trim()) qs.set("cidade", cidade.trim());
    qs.set("limit", "200");

    const r = await fetch(`/api/admin/orders?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setOrders([]);
      setMsg({ type: "error", text: data?.error || "Erro ao carregar pedidos." });
      setLoading(false);
      return;
    }

    setOrders((data?.orders || []) as OrderRow[]);
    setLoading(false);
  }

  const stats = useMemo(() => {
    const all = orders.length;
    const pend = orders.filter((o) => o.status === "PENDENTE").length;
    const pago = orders.filter((o) => o.status === "PAGO").length;
    const canc = orders.filter((o) => o.status === "CANCELADO").length;
    return { all, pend, pago, canc };
  }, [orders]);

  const cidades = useMemo(() => {
    const s = new Set<string>();
    for (const o of orders) if (o.cidade) s.add(o.cidade);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [orders]);

  function openDetails(o: OrderRow) {
    setSelected(o);
    setEditDelStatus(String(o.delivery_status || "NOVO").toUpperCase());
    setEditNotes(o.delivery_notes || "");
    setOpen(true);
  }
  function closeDetails() {
    setOpen(false);
    setSelected(null);
    setSaving(false);
  }

  async function saveDelivery(markDelivered: boolean) {
    if (!selected) return;

    setSaving(true);
    setMsg(null);

    const token = await getAccessToken();
    if (!token) {
      setSaving(false);
      setMsg({ type: "error", text: "Sem sessão. Faça login novamente." });
      return;
    }

    const r = await fetch(`/api/admin/orders/${selected.id}/delivery`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        delivery_status: editDelStatus,
        delivery_notes: editNotes,
        markDelivered,
      }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setSaving(false);
      setMsg({ type: "error", text: data?.error || "Falha ao salvar entrega." });
      return;
    }

    setMsg({ type: "ok", text: "Entrega atualizada com sucesso." });

    // atualiza localmente
    setOrders((prev) =>
      prev.map((o) =>
        o.id === selected.id
          ? {
              ...o,
              delivery_status: editDelStatus,
              delivery_notes: editNotes,
              delivered_at: markDelivered ? new Date().toISOString() : o.delivered_at,
            }
          : o
      )
    );

    setSaving(false);
  }

  if (!ok) return <div className="p-6 text-zinc-100">Carregando...</div>;

  return (
    <div className="space-y-5 p-6 text-zinc-100">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Admin • Pedidos</h1>
            <p className="mt-1 text-sm text-zinc-400">Gestão operacional com controle de entrega e auditoria.</p>

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
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3">
                <div className="text-xs text-rose-200/80">Cancelados</div>
                <div className="text-lg font-semibold text-rose-100">{stats.canc}</div>
              </div>
            </div>
          </div>

          <div className="grid w-full gap-2 sm:grid-cols-4 lg:w-[720px]">
            <div className="sm:col-span-4">
              <label className="text-xs text-zinc-400">Buscar (id / cidade / cep / user_id)</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Digite para filtrar..."
                className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400">Pagamento</label>
              <select
                value={pay}
                onChange={(e) => setPay(e.target.value as any)}
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
                value={del}
                onChange={(e) => setDel(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none focus:border-white/20"
              >
                <option value="ALL">Todas</option>
                <option value="NOVO">NOVO</option>
                <option value="EM_ROTA">EM_ROTA</option>
                <option value="ENTREGUE">ENTREGUE</option>
                <option value="CANCELADO">CANCELADO</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-zinc-400">Cidade</label>
              <select
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none focus:border-white/20"
              >
                <option value="">Todas</option>
                {cidades.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end gap-2 sm:col-span-2">
              <button
                onClick={load}
                className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
              >
                Atualizar
              </button>

              <button
                onClick={() => {
                  setQ("");
                  setPay("ALL");
                  setDel("ALL");
                  setCidade("");
                  setTimeout(load, 50);
                }}
                className="w-full rounded-2xl border border-white/10 bg-zinc-950/20 px-4 py-3 text-sm font-semibold hover:bg-white/5"
              >
                Limpar
              </button>
            </div>

            <div className="flex items-end sm:col-span-2">
              <div className="w-full rounded-2xl border border-white/10 bg-zinc-950/20 px-4 py-3 text-xs text-zinc-400">
                Pagamento só muda por webhook. Aqui você gerencia <b>entrega</b>.
              </div>
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

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-3xl border border-white/10 bg-white/5" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
          Nenhum pedido encontrado.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((o) => (
            <button
              key={o.id}
              onClick={() => openDetails(o)}
              className="text-left rounded-3xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10 active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-zinc-400">Pedido</div>
                  <div className="mt-1 truncate text-sm font-semibold">{o.id}</div>
                  <div className="mt-2 text-xs text-zinc-400">Cidade</div>
                  <div className="mt-1 font-semibold">{o.cidade}</div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${payBadge(o.status)}`}>
                    {o.status}
                  </div>
                  <div className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${delBadge(o.delivery_status)}`}>
                    {String(o.delivery_status || "NOVO").toUpperCase()}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-zinc-400">Entrega</div>
                  <div className="mt-1 font-semibold">{DIAS[o.dia_semana]} </div>
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
                Clique para ver detalhes e atualizar entrega
              </div>
            </button>
          ))}
        </div>
      )}

      {/* MODAL */}
      {open && selected && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeDetails} />
          <div className="relative w-full max-w-4xl rounded-3xl border border-white/10 bg-zinc-950 text-zinc-100 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 p-6">
              <div className="min-w-0">
                <div className="text-xs text-zinc-400">Pedido</div>
                <div className="mt-1 truncate text-sm font-semibold">{selected.id}</div>
                <div className="mt-2 text-sm text-zinc-300">
                  {selected.cidade} • {DIAS[selected.dia_semana]}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${payBadge(selected.status)}`}>
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

            <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_360px]">
              {/* Itens */}
              <div>
                <h3 className="text-lg font-semibold">Itens</h3>
                <p className="mt-1 text-sm text-zinc-400">Produtos do pedido.</p>

                <div className="mt-4 space-y-3">
                  {(selected.order_items || []).length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
                      Nenhum item encontrado.
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

                <div className="mt-6 rounded-2xl border border-white/10 bg-zinc-950/20 p-4 text-sm">
                  <div className="font-semibold">Endereço</div>
                  <div className="mt-2 text-zinc-300">
                    {selected.rua}, {selected.numero} {selected.complemento ? `- ${selected.complemento}` : ""}
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">
                    CEP: {selected.cep} • Criado: {fmtDate(selected.created_at)}
                  </div>
                </div>
              </div>

              {/* Gestão */}
              <div className="h-fit rounded-3xl border border-white/10 bg-white/5 p-5">
                <h3 className="text-lg font-semibold">Gestão</h3>

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

                  <div className="mt-4">
                    <div className="text-xs text-zinc-400">Delivery Status</div>
                    <select
                      value={editDelStatus}
                      onChange={(e) => setEditDelStatus(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none focus:border-white/20"
                    >
                      <option value="NOVO">NOVO</option>
                      <option value="EM_ROTA">EM_ROTA</option>
                      <option value="ENTREGUE">ENTREGUE</option>
                      <option value="CANCELADO">CANCELADO</option>
                    </select>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs text-zinc-400">Notas</div>
                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      rows={4}
                      placeholder="Ex.: saiu para entrega 18:20 / cliente pediu para deixar na portaria..."
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
                    />
                  </div>

                  <div className="mt-4 text-xs text-zinc-500">
                    MP Payment ID: <span className="text-zinc-300">{selected.mp_payment_id || "-"}</span>
                  </div>
                  <div className="text-xs text-zinc-500">
                    Delivered at: <span className="text-zinc-300">{fmtDate(selected.delivered_at)}</span>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-2">
                    <button
                      disabled={saving}
                      onClick={() => saveDelivery(false)}
                      className="rounded-2xl border border-white/10 bg-zinc-950/20 px-4 py-3 text-sm font-semibold hover:bg-white/5 disabled:opacity-60"
                    >
                      {saving ? "Salvando..." : "Salvar atualização"}
                    </button>

                    <button
                      disabled={saving}
                      onClick={() => saveDelivery(true)}
                      className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-200 disabled:opacity-60"
                    >
                      {saving ? "Salvando..." : "Marcar como entregue agora"}
                    </button>
                  </div>

                  <div className="mt-3 text-xs text-zinc-500">
                    Regra: essa tela não aprova pagamento. Apenas entrega.
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 p-6 text-xs text-zinc-500">
              Dica: para precisão total, deixe “Entrega” como processo: NOVO → EM_ROTA → ENTREGUE, com notas.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
