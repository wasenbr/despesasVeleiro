/**
 * Sugere a categoria a partir da descrição. As regras foram derivadas das despesas reais da planilha
 * original; a primeira que casar vence, então a ordem importa. Usado na importação e na tela de lançamento.
 */
export const norm = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export const CATEGORY_RULES: [category: string, pattern: RegExp][] = [
  ["Outros", /copia chave|churras|cuia/],
  ["Marina", /\bmarina\b|mensalidade box|^vaga\b/],
  ["Mão de obra e serviços", /mao de obra|^servico|marceneiro|guincho|truck|muck|\bduka\b|augusto|torneiro|bugrao|lambari/],
  ["Marinheiro", /marinheiro/],
  ["Cabos, ferragens e fundeio", /ancora|amarra/],
  ["Clube, títulos e regatas", /titulo|clube|regata|\bcnt\b/],
  ["Motor e combustível", /gasolina|oleo|combustivel|rabeta|motor|tanque|\bcomb\b|bulbo|\bpera\b/],
  ["Velas, lonas e capas", /\bvelas?\b|lona|genoa|lazzy|lazy|\bcapa\b|balao/],
  [
    "Elétrica e eletrônica",
    /solar|painel|controlador|bateria|eletric|voltimetro|tomada|disjuntor|chave geral|multimetro|farol|\bled\b|navman|\bgps\b|sonar|garmin|\bfio\b|borne|interruptor|cabo 1mm/,
  ],
  [
    "Cabos, ferragens e fundeio",
    /cabo|retinida|escota|adrica|esticador|manilha|cupilha|inox|ferragem|paixao|mosquet|cunho|mancebo|spectra|estai|porca/,
  ],
  ["Casco e reforma", /bolina|pintura|tinta|epoxi|fibra|chumbo|verniz|madeira|cedrinho|solvente|thiner|tecido|divisoria|pilastra|prateleira/],
  [
    "Materiais e ferramentas",
    /sika|silicone|durepoxi|massa|\bfita\b|silver|heller|cinta|elastico|parafuso|broca|lixa|secar|organizador|serrinha|chave|ferramenta|serra|adesivo|\bpu\b|isolante|auto fusao|pinc|bracadeira|\bcola\b|limpeza|tubolit|acido|material|esferas|batente/,
  ],
  ["Equipamentos de bordo", /geladeira|ventilador|garrafa|fogao|\bgas\b|cozinha|banheiro|biruta|bomba/],
];

export const SALES_CATEGORY = "Vendas e entradas";

export function categorize(description: string, kind: "despesa" | "venda" = "despesa"): string {
  if (kind === "venda") return SALES_CATEGORY;
  const text = norm(description);
  for (const [name, pattern] of CATEGORY_RULES) if (pattern.test(text)) return name;
  return "Outros";
}
