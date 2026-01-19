"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "ok"; text: string } | null>(null);

  const canSubmit = useMemo(() => {
    const eOk = email.trim().includes("@") && email.trim().includes(".");
    const pOk = pass.trim().length >= 6;
    return eOk && pOk && !loading;
  }, [email, pass, loading]);

  async function handleSubmit() {
    setMsg(null);
    setLoading(true);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password: pass });
        if (error) {
          setMsg({ type: "error", text: error.message });
          return;
        }
        setMsg({ type: "ok", text: "Conta criada! Agora faça login para continuar." });
        setMode("login");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) {
        setMsg({ type: "error", text: error.message });
        return;
      }

      window.location.href = "/checkout";
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-white/10 bg-zinc-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <a href="/" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10">🌽</div>
            <div className="leading-tight">
              <p className="text-xs text-zinc-400">Pamonhas do Pai</p>
              <p className="text-base font-semibold tracking-tight">Acesso</p>
            </div>
          </a>

          <a
            href="/carrinho"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
          >
            🛒 Carrinho
          </a>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-10 lg:grid-cols-2">
        {/* Lado esquerdo (texto) */}
        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-6 sm:p-10">
          <p className="text-sm text-zinc-300">Entre para finalizar seu pedido e agendar a entrega.</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-4xl">
            {mode === "login" ? "Bem-vindo de volta 👋" : "Criar sua conta ✨"}
          </h1>

          <ul className="mt-6 space-y-3 text-sm text-zinc-300">
            <li className="flex gap-3">
              <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10">1</span>
              Digite seu CEP e veja os dias disponíveis na sua cidade
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10">2</span>
              Escolha a quantidade de pamonha e curau
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10">3</span>
              Finalize e acompanhe seus pedidos
            </li>
          </ul>

          <div className="mt-8 flex flex-col gap-2 sm:flex-row">
            <a
              href="/"
              className="inline-flex justify-center rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-100 hover:bg-white/5"
            >
              Voltar para loja
            </a>
            <a
              href="/checkout"
              className="inline-flex justify-center rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
            >
              Ir para checkout
            </a>
          </div>
        </section>

        {/* Card de login */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-10">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                {mode === "login" ? "Entrar" : "Criar conta"}
              </h2>
              <p className="text-sm text-zinc-400">
                {mode === "login" ? "Use seu e-mail e senha." : "Leva menos de 1 minuto."}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-1">
              <button
                type="button"
                onClick={() => {
                  setMsg(null);
                  setMode("login");
                }}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  mode === "login" ? "bg-white text-zinc-900" : "text-zinc-200 hover:bg-white/5"
                }`}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => {
                  setMsg(null);
                  setMode("signup");
                }}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  mode === "signup" ? "bg-white text-zinc-900" : "text-zinc-200 hover:bg-white/5"
                }`}
              >
                Criar
              </button>
            </div>
          </div>

          {msg && (
            <div
              className={`mt-5 rounded-2xl border p-4 text-sm ${
                msg.type === "ok"
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                  : "border-rose-500/20 bg-rose-500/10 text-rose-200"
              }`}
            >
              {msg.text}
            </div>
          )}

          <div className="mt-6 space-y-3">
            <div>
              <label className="text-xs text-zinc-400">E-mail</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seuemail@exemplo.com"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none ring-0 placeholder:text-zinc-500 focus:border-white/20"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400">Senha</label>
              <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3">
                <input
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder="mínimo 6 caracteres"
                  type={showPass ? "text" : "password"}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-white/5"
                >
                  {showPass ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Dica: use uma senha fácil de lembrar, mas segura.
              </p>
            </div>

            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className={`mt-2 w-full rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                canSubmit
                  ? "bg-white text-zinc-900 hover:bg-zinc-200 active:scale-[0.99]"
                  : "cursor-not-allowed bg-white/10 text-zinc-400"
              }`}
            >
              {loading
                ? "Aguarde..."
                : mode === "login"
                ? "Entrar e continuar"
                : "Criar conta"}
            </button>

            <p className="pt-2 text-xs text-zinc-500">
              Ao continuar, você concorda em usar o sistema apenas para pedidos reais.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
