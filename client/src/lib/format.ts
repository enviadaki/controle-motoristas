const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function moeda(v: string | number | null | undefined) {
  if (v === null || v === undefined || v === "") return "—";
  return brl.format(Number(v));
}

export function cpfFmt(v: string | null) {
  if (!v) return "—";
  return v.length === 11 ? v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : v;
}

export function cnpjFmt(v: string | null) {
  if (!v) return "—";
  return v.length === 14 ? v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : v;
}

export function telefoneFmt(v: string | null) {
  if (!v) return "—";
  if (v.length === 11) return v.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (v.length === 10) return v.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return v;
}

export function dataFmt(iso: string | null) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function dataHoraFmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia" });
}

// Para preencher input de valor: "185.00" -> "185,00"
export function valorParaCampo(v: string | null) {
  return v ? v.replace(".", ",") : "";
}
