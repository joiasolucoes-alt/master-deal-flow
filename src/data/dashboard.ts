export const dashboardKpis = [
  { label: "Negociações em andamento", value: 128, delta: 18.2, tone: "success" },
  { label: "Aguardando aprovação", value: 18, delta: 12.5, tone: "warning" },
  { label: "Viáveis", value: 74, delta: 23.7, tone: "success" },
  { label: "Inviáveis", value: 12, delta: -7.6, tone: "danger" },
  { label: "Volume simulado", value: 4820000, delta: 31.4, tone: "success", format: "currencyCompact" },
  { label: "Lucro previsto", value: 812700, delta: 28.9, tone: "success", format: "currencyCompact" },
  { label: "Margem média", value: 16.9, delta: 2.1, tone: "success", format: "percent" },
];

export const simulationEvolution = [
  { day: "Seg", value: 320000 },
  { day: "Ter", value: 430000 },
  { day: "Qua", value: 620000 },
  { day: "Qui", value: 840000 },
  { day: "Sex", value: 960000 },
  { day: "Sáb", value: 1050000 },
  { day: "Dom", value: 960000 },
];

export const negotiationStatus = [
  { name: "Rascunho", value: 28 },
  { name: "Em análise", value: 47 },
  { name: "Aprovadas", value: 41 },
  { name: "Reprovadas", value: 12 },
];

export const topClients = [
  { name: "Mercado Bom Lar", value: 1240000 },
  { name: "Siderúrgica Nacional", value: 980000 },
  { name: "Usina Boa Vista", value: 760000 },
  { name: "Construtora Horizonte", value: 560000 },
  { name: "Transportes União", value: 430000 },
];

export const mapNodes = [
  { name: "Belo Horizonte", x: 52, y: 54, size: 8 },
  { name: "Uberlândia", x: 18, y: 40, size: 5 },
  { name: "Montes Claros", x: 66, y: 14, size: 4 },
  { name: "Governador Valadares", x: 83, y: 42, size: 5 },
  { name: "Juiz de Fora", x: 72, y: 78, size: 4 },
  { name: "Muriaé", x: 64, y: 67, size: 3 },
  { name: "Cataguases", x: 61, y: 72, size: 3 },
  { name: "Ipatinga", x: 79, y: 53, size: 4 },
];

export const mapLinks = [
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [4, 6],
  [6, 7],
  [7, 3],
];
