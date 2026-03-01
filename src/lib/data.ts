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

export type Task = {
  id: string;
  title: string;
  pillar: string;
  project?: string;
  priority: "frog" | "important" | "nice";
  day: string;
  points: number;
  done: boolean;
  delegatedTo?: string;
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

export const weeklyTasks: Task[] = [
  {
    id: "1",
    title: "Przedstawić pierwszą koncepcję celów dla firmy",
    pillar: "praca",
    project: "owoc",
    priority: "frog",
    day: "poniedziałek",
    points: 15,
    done: false,
  },
  {
    id: "2",
    title: "Przygotować prezentację: dlaczego takie cele",
    pillar: "praca",
    project: "owoc",
    priority: "frog",
    day: "poniedziałek",
    points: 12,
    done: false,
  },
  {
    id: "3",
    title: "Dokończyć procedurę gospodarki magazynowej",
    pillar: "praca",
    project: "owoc",
    priority: "frog",
    day: "wtorek",
    points: 15,
    done: false,
  },
  {
    id: "4",
    title: "Przeprowadzić dyskusję z zespołem o celach",
    pillar: "praca",
    project: "owoc",
    priority: "important",
    day: "poniedziałek",
    points: 8,
    done: false,
  },
  {
    id: "5",
    title: "Rozliczyć ludzi z celów na farmie",
    pillar: "praca",
    project: "gr",
    priority: "important",
    day: "środa",
    points: 10,
    done: false,
  },
];

export const days = [
  "poniedziałek",
  "wtorek",
  "środa",
  "czwartek",
  "piątek",
  "sobota",
  "niedziela",
];

export const priorityConfig = {
  frog: { label: "🐸 Żaba", color: "#ef4444", bg: "#fef2f2" },
  important: { label: "⚡ Ważne", color: "#f59e0b", bg: "#fffbeb" },
  nice: { label: "✨ Miłe", color: "#8b5cf6", bg: "#f5f3ff" },
};
