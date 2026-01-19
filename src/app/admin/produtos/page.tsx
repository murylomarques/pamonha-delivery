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

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function slugFileName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function AdminProdutos() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState("");

  // form
  const [editingId, setEditingId] = useState<number | null>(null);
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState<string>("");
  const [ativo, setAtivo] = useState(true);
  const [imageUrl, setImageUrl] = useState<string>("");

  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<{ type: "error" | "ok"; text: string } | null>(null);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return products;
    return products.filter((p) => p.nome.toLowerCase().includes(t));
  }, [products, q]);

  useEffect(() => {
    (async () => {
      // segurança: precisa estar logado + ser admin
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

      await loadProducts();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProducts() {
    setLoading(true);
    setMsg(null);

    const { data, error } = await supabase
      .from("products")
      .select("id,nome,preco,ativo,image_url")
      .order("id", { ascending: true });

    if (error) setMsg({ type: "error", text: error.message });
    setProducts((data || []) as Product[]);
    setLoading(false);
  }

  function resetForm() {
    setEditingId(null);
    setNome("");
    setPreco("");
    setAtivo(true);
    setImageUrl("");
    setFile(null);
    setMsg(null);
  }

  function startEdit(p: Product) {
    setEditingId(p.id);
    setNome(p.nome);
    setPreco(String(p.preco ?? ""));
    setAtivo(!!p.ativo);
    setImageUrl(p.image_url || "");
    setFile(null);
    setMsg(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function uploadImageIfAny(productId: number) {
    if (!file) return imageUrl || null;

    const ext = file.name.split(".").pop() || "jpg";
    const safe = slugFileName(nome || `produto-${productId}`);
    const path = `products/${productId}/${safe}-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("product-images")
      .upload(path, file, { upsert: true });

    if (upErr) throw new Error(upErr.message);

    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    return data.publicUrl;
  }

  async function saveProduct() {
    setMsg(null);

    const nomeOk = nome.trim().length >= 2;
    const precoNum = Number(String(preco).replace(",", "."));
    const precoOk = Number.isFinite(precoNum) && precoNum > 0;

    if (!nomeOk) return setMsg({ type: "error", text: "Informe um nome válido." });
    if (!precoOk) return setMsg({ type: "error", text: "Informe um preço válido (ex: 10.00)." });

    setSaving(true);
    try {
      let productId = editingId;

      // cria/atualiza produto
      if (!productId) {
        const { data: created, error } = await supabase
          .from("products")
          .insert({ nome: nome.trim(), preco: precoNum, ativo })
          .select("id")
          .single();

        if (error || !created) throw new Error(error?.message || "Erro ao criar produto.");
        productId = created.id as number;
      } else {
        const { error } = await supabase
          .from("products")
          .update({ nome: nome.trim(), preco: precoNum, ativo })
          .eq("id", productId);

        if (error) throw new Error(error.message);
      }

      // upload imagem se houver
      const finalUrl = await uploadImageIfAny(productId);

      // salva image_url
      const imageToSave = finalUrl || (imageUrl.trim() ? imageUrl.trim() : null);
      const { error: imgErr } = await supabase
        .from("products")
        .update({ image_url: imageToSave })
        .eq("id", productId);

      if (imgErr) throw new Error(imgErr.message);

      setMsg({ type: "ok", text: editingId ? "Produto atualizado ✅" : "Produto criado ✅" });
      resetForm();
      await loadProducts();
    } catch (e: any) {
      setMsg({ type: "error", text: e?.message || "Erro ao salvar." });
    } finally {
      setSaving(false);
    }
  }

  async function toggleAtivo(p: Product) {
    setMsg(null);
    const { error } = await supabase.from("products").update({ ativo: !p.ativo }).eq("id", p.id);
    if (error) return setMsg({ type: "error", text: error.message });
    await loadProducts();
  }

  async function removeProduct(p: Product) {
    const sure = confirm(`Remover o produto "${p.nome}"?`);
    if (!sure) return;

    setMsg(null);
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) return setMsg({ type: "error", text: error.message });
    await loadProducts();
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho da página (sem duplicar o header do layout) */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Produtos</h1>
            <p className="mt-1 text-sm text-zinc-400">Crie, edite e organize o catálogo da loja.</p>
          </div>

          <div className="w-full lg:w-[420px]">
            <label className="text-xs text-zinc-400">Buscar</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Digite para filtrar..."
              className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
            />
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

      {/* ✅ IMPORTANTE: só vira 2 colunas em 2xl. No resto fica 1 coluna (resolve sua tela apertada) */}
      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[420px_1fr]">
        {/* Form */}
        <section className="h-fit rounded-3xl border border-white/10 bg-white/5 p-6 2xl:sticky 2xl:top-24">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                {editingId ? "Editar produto" : "Novo produto"}
              </h2>
              <p className="mt-1 text-sm text-zinc-400">Preencha e salve. Imagem opcional.</p>
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

          <div className="mt-5 space-y-3">
            <div>
              <label className="text-xs text-zinc-400">Nome</label>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Pamonha"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-zinc-400">Preço</label>
                <input
                  value={preco}
                  onChange={(e) => setPreco(e.target.value)}
                  placeholder="10.00"
                  inputMode="decimal"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
                />
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

            <div>
              <label className="text-xs text-zinc-400">Foto (upload)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-zinc-900"
              />
              <p className="mt-2 text-xs text-zinc-500">
                Upload vai para o bucket <b>product-images</b>.
              </p>
            </div>

            <div>
              <label className="text-xs text-zinc-400">Ou URL da imagem (opcional)</label>
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
              />
            </div>

            <button
              onClick={saveProduct}
              disabled={saving}
              className={`mt-2 w-full rounded-2xl px-4 py-4 text-sm font-semibold transition ${
                saving
                  ? "cursor-not-allowed bg-white/10 text-zinc-400"
                  : "bg-white text-zinc-900 hover:bg-zinc-200 active:scale-[0.99]"
              }`}
            >
              {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Criar produto"}
            </button>
          </div>
        </section>

        {/* List */}
        <section className="space-y-4">
          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-1">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="h-44 animate-pulse rounded-3xl border border-white/10 bg-white/5" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
              Nenhum produto encontrado.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-1">
              {filtered.map((p) => (
                <div key={p.id} className="rounded-3xl border border-white/10 bg-white/5 p-5 hover:bg-white/10">
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
                          <p className="truncate text-base font-semibold tracking-tight">{p.nome}</p>
                          <p className="mt-1 text-sm text-zinc-400">{formatBRL(Number(p.preco))}</p>
                        </div>

                        <span
                          className={`shrink-0 rounded-2xl border px-3 py-2 text-[11px] font-semibold ${
                            p.ativo
                              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                              : "border-zinc-500/20 bg-zinc-500/10 text-zinc-200"
                          }`}
                        >
                          {p.ativo ? "ATIVO" : "INATIVO"}
                        </span>
                      </div>

                      {/* ✅ AÇÕES: nunca quebra feio */}
                      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <button
                          onClick={() => startEdit(p)}
                          className="rounded-2xl bg-white px-3 py-2.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-200"
                        >
                          Editar
                        </button>

                        <button
                          onClick={() => toggleAtivo(p)}
                          className="rounded-2xl border border-white/10 px-3 py-2.5 text-xs font-semibold text-zinc-100 hover:bg-white/5"
                        >
                          {p.ativo ? "Desativar" : "Ativar"}
                        </button>

                        <button
                          onClick={() => removeProduct(p)}
                          className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/15"
                        >
                          Remover
                        </button>
                      </div>

                      <p className="mt-3 text-xs text-zinc-500">
                        ID: <span className="text-zinc-300">{p.id}</span>
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
