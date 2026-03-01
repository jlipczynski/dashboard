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
    score: 62,
    trend: "rising",
    href: "/zdrowie",
  },
  {
    id: "rozwoj",
    name: "Rozwój Osobisty",
    icon: "📚",
    color: "#8b5cf6",
    colorFrom: "#8b5cf6",
    colorTo: "#a78bfa",
    score: 45,
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
    score: 70,
    trend: "rising",
    href: "/relacje",
  },
  {
    id: "praca",
    name: "Praca",
    icon: "💼",
    color: "#f97316",
    colorFrom: "#f97316",
    colorTo: "#fb923c",
    score: 55,
    trend: "needs-focus",
    href: "/praca",
  },
];

export const monthlyGoals = {
  activeCalories: { target: 15000, current: 4200, unit: "kcal" },
  cycling: { target: 800, current: 120, unit: "km" },
  cyclingHours: { target: 80, current: 12, unit: "h" },
  running: { target: 80, current: 18, unit: "km" },
  competition: { name: "Półmaraton Poznań", date: "2026-05-10" },
};

export const sportAreas: SportArea[] = [
  {
    name: "Siłownia",
    icon: "🏋️",
    weeklyGoal: 3,
    monthlyGoal: 12,
    unit: "treningi",
    current: 2,
    weekDays: [true, false, true, false, false, false, false],
  },
  {
    name: "Bieganie",
    icon: "🏃",
    weeklyGoal: 20,
    monthlyGoal: 80,
    unit: "km",
    current: 18,
    weekDays: [false, true, false, false, true, false, false],
  },
  {
    name: "Rower",
    icon: "🚴",
    weeklyGoal: 200,
    monthlyGoal: 800,
    unit: "km",
    current: 120,
    weekDays: [false, false, true, false, false, true, true],
  },
];

export const workProjects: WorkProject[] = [
  {
    id: "owoc",
    name: "Owoc Malinowi",
    icon: "🍓",
    score: 50,
    wig: "Zwiększyć dystrybucję OVOC o 30% do końca Q2",
  },
  {
    id: "gr",
    name: "GR Lipczyński",
    icon: "🌾",
    score: 60,
    wig: "Zoptymalizować operacje na farmie — koszty -15%",
  },
  {
    id: "inne",
    name: "Inne",
    icon: "📋",
    score: 45,
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
