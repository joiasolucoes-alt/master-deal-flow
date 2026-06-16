import type { User } from "./types";

export const appUser: User = {
  id: "user-joao",
  name: "João Silva",
  role: "Comercial",
  email: "joao.silva@masterflow.com.br",
  unit: "Matriz Cataguases",
  initials: "JS",
  avatarHue: "from-info to-primary",
};

export const users: User[] = [
  appUser,
  {
    id: "user-carla",
    name: "Carla Mendes",
    role: "Comercial",
    email: "carla.mendes@masterflow.com.br",
    unit: "Filial Rio de Janeiro",
    initials: "CM",
    avatarHue: "from-warning to-primary",
  },
  {
    id: "user-pedro",
    name: "Pedro Costa",
    role: "Negociações",
    email: "pedro.costa@masterflow.com.br",
    unit: "Filial Espírito Santo",
    initials: "PC",
    avatarHue: "from-info to-chart-2",
  },
  {
    id: "user-ana",
    name: "Ana Paula",
    role: "Aprovação",
    email: "ana.paula@masterflow.com.br",
    unit: "Matriz Cataguases",
    initials: "AP",
    avatarHue: "from-chart-3 to-chart-4",
  },
];

export const businessUnits = [
  "Matriz Cataguases",
  "Filial Espírito Santo",
  "Filial Rio de Janeiro",
];
