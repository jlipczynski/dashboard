export type Pillar = {
  id: string;
  name: string;
  icon: string;
  color: string;
  colorFrom: string;
  colorTo: string;
  score: number;
  trend: "rising" | "steady" | "needs-focus";
  href: string;
};

export type SportArea = {
  name: string;
  icon: string;
  weeklyGoal: number;
  monthlyGoal: number;
  unit: string;
  current: number;
  weekDays: boolean[];
};

export type WorkProject = {
  id: string;
  name: string;
  icon: string;
  score: number;
  wig: string;
};

export const pillars: Pillar[] = [
  {
    id: "zdrowie",
    name: "Zdrowie i Fitness",
    icon: "❤️",
    color: "#22c55e",
    colorFrom: "#22c55e",
    colorTo: "#4ade80",
    score: 0,
    trend: "steady",
    href: "/zdrowie",
  },
  {
    id: "rozwoj",
    name: "Rozwój Osobisty",
    icon: "📚",
    color: "#8b5cf6",
    colorFrom: "#8b5cf6",
    colorTo: "#a78bfa",
    score: 0,
    trend: "steady",
    href: "/rozwoj",
  },
  {
    id: "relacje",
    name: "Partnerstwo i Relacje",
    icon: "💛",
    color: "#f59e0b",
    colorFrom: "#f59e0b",
    colorTo: "#fbbf24",
    score: 0,
    trend: "steady",
    href: "/relacje",
  },
  {
    id: "praca",
    name: "Praca",
    icon: "💼",
    color: "#f97316",
    colorFrom: "#f97316",
    colorTo: "#fb923c",
    score: 0,
    trend: "steady",
    href: "/praca",
  },
];

export const monthlyGoals = {
  activeCalories: { target: 0, current: 0, unit: "kcal" },
  cycling: { target: 0, current: 0, unit: "km" },
  cyclingHours: { target: 0, current: 0, unit: "h" },
  running: { target: 0, current: 0, unit: "km" },
  competition: { name: "", date: "", type: "running" as "running" | "cycling", distance: 0 },
};

export const sportAreas: SportArea[] = [
  {
    name: "Siłownia",
    icon: "🏋️",
    weeklyGoal: 0,
    monthlyGoal: 0,
    unit: "treningi",
    current: 0,
    weekDays: [false, false, false, false, false, false, false],
  },
  {
    name: "Bieganie",
    icon: "🏃",
    weeklyGoal: 0,
    monthlyGoal: 0,
    unit: "km",
    current: 0,
    weekDays: [false, false, false, false, false, false, false],
  },
  {
    name: "Rower",
    icon: "🚴",
    weeklyGoal: 0,
    monthlyGoal: 0,
    unit: "km",
    current: 0,
    weekDays: [false, false, false, false, false, false, false],
  },
];

export const workProjects: WorkProject[] = [
  {
    id: "owoc",
    name: "Owoc Malinowi",
    icon: "🍓",
    score: 0,
    wig: "Zwiększyć dystrybucję OVOC o 30% do końca Q2",
  },
  {
    id: "gr",
    name: "GR Lipczyński",
    icon: "🌾",
    score: 0,
    wig: "Zoptymalizować operacje na farmie — koszty -15%",
  },
  {
    id: "inne",
    name: "Inne",
    icon: "📋",
    score: 0,
    wig: "Rozwój kompetencji biznesowych",
  },
];

