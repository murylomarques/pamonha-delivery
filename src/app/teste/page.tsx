"use client";
import { supabase } from "@/lib/supabaseClient";

export default function Teste() {
  async function testar() {
    const { data, error } = await supabase.from("products").select("*");
    alert(error ? error.message : "Supabase conectado!");
  }

  return (
    <main style={{ padding: 20 }}>
      <button onClick={testar}>Testar Supabase</button>
    </main>
  );
}
