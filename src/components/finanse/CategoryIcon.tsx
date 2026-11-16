import {
  House,
  Users,
  ShoppingCart,
  ShoppingBag,
  Heart,
  Repeat,
  Car,
  Plane,
  Ticket,
  Gift,
  PawPrint,
  Landmark,
  Ellipsis,
  Leaf,
  Briefcase,
  KeyRound,
  PiggyBank,
  type LucideIcon,
} from "lucide-react";

// Icon names are stored in finance_categories.icon (migration 025).
const ICONS: Record<string, LucideIcon> = {
  home: House,
  users: Users,
  cart: ShoppingCart,
  bag: ShoppingBag,
  heart: Heart,
  repeat: Repeat,
  car: Car,
  plane: Plane,
  ticket: Ticket,
  gift: Gift,
  paw: PawPrint,
  landmark: Landmark,
  dots: Ellipsis,
  leaf: Leaf,
  briefcase: Briefcase,
  key: KeyRound,
  piggy: PiggyBank,
};

/** Soft tinted square with the category's icon; colour from finance_categories.color. */
export function CategoryIcon({ icon, color, size = 40 }: { icon: string | null; color: string | null; size?: number }) {
  const Icon = (icon && ICONS[icon]) || Ellipsis;
  const c = color || "#8A847E";
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-xl"
      style={{ width: size, height: size, backgroundColor: `${c}22`, color: c }}
    >
      <Icon size={Math.round(size * 0.55)} strokeWidth={1.8} />
    </span>
  );
}
