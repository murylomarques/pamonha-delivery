// src/app/pagamento/falha/page.tsx
import { Suspense } from "react";
import FalhaClient from "./FalhaClient";

export default function PagamentoFalhaPage() {
  return (
    <Suspense fallback={<FalhaFallback />}>
      <FalhaClient />
    </Suspense>
  );
}

function FalhaFallback() {
  return (
    <div className="mx-auto max-w-2xl p-6 text-zinc-100">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="animate-pulse text-sm text-zinc-300">Carregando…</div>
      </div>
    </div>
  );
}
