"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type CartItem = { product_id: number; nome: string; preco: number; qtd: number };

const DIAS = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

function formatBRL(v: number) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function onlyDigits(s: string) {
  return String(s || "").replace(/\D/g, "");
}

function normalizeCity(s: string) {
  return String(s || "").trim().replace(/\s+/g, " ");
}

/** parse seguro pra evitar crashes em alguns browsers */
async function safeJson(res: Response) {
  const txt = await res.text();
  if (!txt) return {};
  try {
    return JSON.parse(txt);
  } catch {
    return { raw: txt };
  }
}

export default function CheckoutPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // form
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cep, setCep] = useState("");
  const [rua, setRua] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");

  const [cidade, setCidade] = useState("");
  const [diaSemana, setDiaSemana] = useState<number>(1);

  // roteiro
  const [cidadesDisponiveis, setCidadesDisponiveis] = useState<string[]>([]);
  const [diasDisponiveis, setDiasDisponiveis] = useState<number[]>([]);

  const [msg, setMsg] = useState<{ type: "error" | "ok"; text: string } | null>(null);

  // frete (mantive o seu fixo)
  const FRETE_FIXO = 1;

  useEffect(() => {
    try {
      const raw = localStorage.getItem("cart");
      setItems(raw ? JSON.parse(raw) : []);
    } catch {
      setItems([]);
    }
  }, []);

  const subtotal = useMemo(
    () => items.reduce((acc, i) => acc + Number(i.preco) * Number(i.qtd || 0), 0),
    [items]
  );

  const frete = useMemo(() => (items.length ? FRETE_FIXO : 0), [items.length]);
  const total = useMemo(() => subtotal + frete, [subtotal, frete]);

  // carrega cidades/dias e perfil
  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg(null);

      // precisa estar logado
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        window.location.href = "/login";
        return;
      }

      // puxa perfil pra pré-preencher nome/telefone
      const { data: profile } = await supabase
        .from("profiles")
        .select("nome,telefone")
        .eq("id", u.user.id)
        .maybeSingle();

      if (profile?.nome) setNome(profile.nome);
      if (profile?.telefone) setTelefone(profile.telefone);

      const { data: routes, error } = await supabase
        .from("route_days")
        .select("cidade,dia_semana,ativo")
        .eq("ativo", true);

      if (error) {
        setMsg({ type: "error", text: error.message });
        setLoading(false);
        return;
      }

      const setCities = new Set<string>();
      routes?.forEach((r: any) => {
        const c = normalizeCity(r.cidade);
        if (c) setCities.add(c);
      });

      const cities = Array.from(setCities).sort((a, b) => a.localeCompare(b, "pt-BR"));
      setCidadesDisponiveis(cities);

      const firstCity = cities[0] || "";
      setCidade((cur) => cur || firstCity);

      setLoading(false);
    })();
  }, []);

  // quando muda cidade, atualiza dias disponíveis
  useEffect(() => {
    (async () => {
      if (!cidade) return;

      const { data, error } = await supabase
        .from("route_days")
        .select("dia_semana")
        .eq("ativo", true)
        .eq("cidade", cidade);

      if (error) {
        setDiasDisponiveis([]);
        return;
      }

      const days = Array.from(new Set((data || []).map((x: any) => Number(x.dia_semana))))
        .filter((n) => n >= 1 && n <= 7)
        .sort((a, b) => a - b);

      setDiasDisponiveis(days);

      if (days.length && !days.includes(diaSemana)) setDiaSemana(days[0]);
    })();
  }, [cidade, diaSemana]);

  async function lookupCep() {
    setMsg(null);
    const c = onlyDigits(cep);

    if (c.length !== 8) {
      setMsg({ type: "error", text: "CEP inválido. Precisa ter 8 dígitos." });
      return;
    }

    try {
      const r = await fetch(`https://viacep.com.br/ws/${c}/json/`);
      const j = await r.json();

      if (j?.erro) {
        setMsg({ type: "error", text: "CEP não encontrado." });
        return;
      }

      setRua(j.logradouro || "");
      setMsg({ type: "ok", text: `CEP ok: ${j.localidade} - ${j.uf}` });
    } catch {
      setMsg({ type: "error", text: "Falha ao consultar CEP (ViaCEP)." });
    }
  }

  function validate() {
    if (!items.length) return "Seu carrinho está vazio.";
    if (!cidade) return "Selecione uma cidade.";
    if (!diaSemana) return "Selecione um dia.";
    if (onlyDigits(cep).length !== 8) return "Informe um CEP válido.";
    if (!rua.trim()) return "Informe a rua.";
    if (!numero.trim()) return "Informe o número.";
    if (!nome.trim()) return "Informe seu nome.";
    if (onlyDigits(telefone).length < 10) return "Informe um telefone válido (com DDD).";
    if (!diasDisponiveis.includes(diaSemana)) return "Esse dia não está disponível para essa cidade.";
    return null;
  }

  async function submit() {
    setMsg(null);
    const err = validate();
    if (err) return setMsg({ type: "error", text: err });

    if (submitting) return;
    setSubmitting(true);

    let createdOrderId: string | null = null;

    try {
      // pega sessão/token
      const { data: s } = await supabase.auth.getSession();
      const accessToken = s.session?.access_token;

      if (!accessToken) {
        window.location.href = "/login";
        return;
      }

      // 1) cria pedido via API server-side (com validação)
      const createRes = await fetch("/api/orders/validate-and-create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          cep: onlyDigits(cep),
          rua: rua.trim(),
          numero: numero.trim(),
          complemento: complemento.trim() || "",
          cidade: normalizeCity(cidade),
          dia_semana: diaSemana,
          items: items.map((it) => ({
            product_id: it.product_id,
            quantidade: Number(it.qtd || 1),
          })),
        }),
      });

      const createJson = await safeJson(createRes);

      if (!createRes.ok) {
        const detail = createJson?.error || "Erro ao criar pedido.";
        throw new Error(String(detail));
      }

      const orderId = String(createJson?.order_id || "");
      if (!orderId) throw new Error("API não retornou order_id.");

      createdOrderId = orderId;

      // 2) cria preference do MP
      const prefRes = await fetch("/api/mp/preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          frete,
          items: items.map((it) => ({
            id: it.product_id,
            nome: it.nome,
            preco: Number(it.preco || 0),
            qtd: Number(it.qtd || 1),
          })),
        }),
      });

      const prefJson = await safeJson(prefRes);

      if (!prefRes.ok) {
        const detail =
          prefJson?.mp?.message ||
          prefJson?.mp?.error ||
          prefJson?.error ||
          "Erro ao criar pagamento no Mercado Pago.";
        throw new Error(String(detail));
      }

      const url = prefJson?.init_point || prefJson?.sandbox_init_point;
      if (!url) throw new Error("Mercado Pago não retornou a URL de pagamento (init_point).");

      // 3) limpa carrinho e redireciona
      localStorage.removeItem("cart");
      window.location.href = String(url);
    } catch (e: any) {
      const text = e?.message || "Erro ao finalizar.";
      setMsg({
        type: "error",
        text: createdOrderId ? `${text} (orderId: ${createdOrderId})` : text,
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">Carregando checkout...</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <a href="/" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10">🧾</div>
            <div className="leading-tight">
              <p className="text-xs text-zinc-400">Checkout</p>
              <p className="text-base font-semibold tracking-tight">Finalizar compra</p>
            </div>
          </a>

          <a
            href="/carrinho"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
          >
            ← Voltar pro carrinho
          </a>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-8 lg:grid-cols-[1fr_360px]">
        {/* FORM */}
        <section className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h1 className="text-xl font-semibold tracking-tight">Dados de entrega</h1>
            <p className="mt-1 text-sm text-zinc-400">Escolha cidade/dia e informe endereço.</p>

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

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-zinc-400">Cidade</label>
                <select
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none focus:border-white/20"
                >
                  {cidadesDisponiveis.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-zinc-400">Dia da entrega</label>
                <select
                  value={diaSemana}
                  onChange={(e) => setDiaSemana(Number(e.target.value))}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none focus:border-white/20"
                >
                  {diasDisponiveis.length ? (
                    diasDisponiveis.map((d) => (
                      <option key={d} value={d}>
                        {DIAS[d]}
                      </option>
                    ))
                  ) : (
                    <option value={1}>Sem dias disponíveis</option>
                  )}
                </select>
                <p className="mt-2 text-xs text-zinc-500">Os dias vêm do roteiro do admin.</p>
              </div>

              <div className="sm:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                <div>
                  <label className="text-xs text-zinc-400">CEP</label>
                  <input
                    value={cep}
                    onChange={(e) => setCep(e.target.value)}
                    placeholder="00000-000"
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
                  />
                </div>
                <button
                  type="button"
                  onClick={lookupCep}
                  className="sm:mt-6 rounded-2xl border border-white/10 bg-zinc-950/20 px-4 py-3 text-sm font-semibold hover:bg-white/5"
                >
                  Buscar CEP
                </button>
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs text-zinc-400">Rua</label>
                <input
                  value={rua}
                  onChange={(e) => setRua(e.target.value)}
                  placeholder="Ex: Rua X"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400">Número</label>
                <input
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  placeholder="Ex: 123"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400">Complemento</label>
                <input
                  value={complemento}
                  onChange={(e) => setComplemento(e.target.value)}
                  placeholder="Ex: Casa / ap 12"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400">Seu nome</label>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Murylo"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400">Telefone (WhatsApp)</label>
                <input
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="(19) 99999-9999"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
                />
              </div>
            </div>
          </div>
        </section>

        {/* RESUMO */}
        <aside className="h-fit rounded-3xl border border-white/10 bg-white/5 p-6 lg:sticky lg:top-24">
          <h2 className="text-lg font-semibold tracking-tight">Resumo</h2>
          <p className="mt-1 text-sm text-zinc-400">Pagamento via Mercado Pago.</p>

          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-300">Subtotal</span>
              <span className="font-semibold">{formatBRL(subtotal)}</span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-300">Frete</span>
              <span className="font-semibold">{formatBRL(frete)}</span>
            </div>

            <div className="my-3 border-t border-white/10" />

            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-300">Total</span>
              <span className="text-lg font-semibold">{formatBRL(total)}</span>
            </div>

            <button
              onClick={submit}
              disabled={submitting || !items.length}
              className={`mt-3 inline-flex w-full justify-center rounded-2xl px-4 py-4 text-sm font-semibold transition ${
                submitting || !items.length
                  ? "cursor-not-allowed bg-white/10 text-zinc-400"
                  : "bg-white text-zinc-900 hover:bg-zinc-200 active:scale-[0.99]"
              }`}
            >
              {submitting ? "Criando pagamento..." : "Pagar com Mercado Pago"}
            </button>

            <p className="pt-2 text-xs text-zinc-500">
              Depois do pagamento, o status do pedido muda para <b>PAGO</b> automaticamente via webhook.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
