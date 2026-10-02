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

// ---------------------------------------------------------------- tipo (natureza) do gasto

import type { Nature } from "./types";

/** Palavras que decidem o tipo antes de olhar a categoria (primeira que casar vence). */
const NATURE_RULES: [Nature, RegExp][] = [
  ["outro", /^gasolina|churras|cuia|regata|copia chave|inscricao/],
  [
    "melhoria",
    /geladeira|ventilador|placa solar|painel solar|controlador|gps|sonar|garmin|navman|biruta|farol de milha|voltimetro|divisoria|prateleira|marceneiro|\bnov[oa]s?\b.*(genoa|lona|ancora)|genoa|lazzy|zipe|organizador|bolsa ferramentas/,
  ],
  ["manutencao", /conserto|reparo|vedac|troca|retirada|bolina|pintura|tinta|epoxi|fibra|oleo|filtro|rabeta|bateria|mangueira|pera|bulbo|tanque|cupilha|cabo|retinida|escota|esticador|manilha/],
];

const CATEGORY_NATURE: Record<string, Nature> = {
  Marina: "marina",
  Marinheiro: "marina",
  "Clube, títulos e regatas": "marina",
  "Mão de obra e serviços": "manutencao",
  "Velas, lonas e capas": "manutencao",
  "Cabos, ferragens e fundeio": "manutencao",
  "Motor e combustível": "manutencao",
  "Casco e reforma": "manutencao",
  "Materiais e ferramentas": "manutencao",
  "Elétrica e eletrônica": "melhoria",
  "Equipamentos de bordo": "melhoria",
};

/**
 * Sugere o tipo do gasto. É só uma sugestão (o usuário sempre pode mudar). Custos fixos de marina
 * seguem a categoria; no resto, palavras da descrição têm prioridade sobre o padrão da categoria.
 */
export function suggestNature(description: string, categoryName?: string | null): Nature {
  const cat = categoryName ? CATEGORY_NATURE[categoryName] : undefined;
  if (cat === "marina") return "marina";
  const text = norm(description);
  for (const [nature, pattern] of NATURE_RULES) if (pattern.test(text)) return nature;
  return cat ?? "outro";
}
