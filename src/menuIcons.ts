import type { LucideIcon } from 'lucide-react'
import {
  Bean,
  Beef,
  CakeSlice,
  CookingPot,
  Croissant,
  EggFried,
  Hamburger,
  Milk,
  Wheat,
  Coffee,
  Cookie,
  CupSoda,
  Drumstick,
  Fish,
  Flame,
  GlassWater,
  Heart,
  Pizza,
  Salad,
  Sandwich,
  Soup,
  Sparkles,
  Star,
} from 'lucide-react'
import type { MenuIcon } from './data'

export const MENU_ICON_OPTIONS: { id: MenuIcon; label: string; Icon: LucideIcon }[] = [
  { id: 'sandwich', label: 'Sandwich', Icon: Sandwich },
  { id: 'shawarma', label: 'Shawarma', Icon: Drumstick },
  { id: 'shawarmaSpecial', label: 'Special', Icon: Flame },
  { id: 'steak', label: 'Grill', Icon: Beef },
  { id: 'rice', label: 'Rice', Icon: Soup },
  { id: 'riceChicken', label: 'Plate', Icon: Sparkles },
  { id: 'salad', label: 'Salad', Icon: Salad },
  { id: 'chips', label: 'Sides', Icon: Cookie },
  { id: 'pizza', label: 'Pizza', Icon: Pizza },
  { id: 'fish', label: 'Fish', Icon: Fish },
  { id: 'mango', label: 'Mango', Icon: CupSoda },
  { id: 'strawberry', label: 'Berry', Icon: CupSoda },
  { id: 'banana', label: 'Banana', Icon: CupSoda },
  { id: 'mushakal', label: 'Blend', Icon: CupSoda },
  { id: 'drink', label: 'Drink', Icon: GlassWater },
  { id: 'coffee', label: 'Coffee', Icon: Coffee },
  { id: 'dessert', label: 'Sweet', Icon: CakeSlice },
  { id: 'burger', label: 'Burger', Icon: Hamburger },
  { id: 'star', label: 'Favorite', Icon: Star },
  { id: 'maize', label: 'Galay', Icon: Wheat },
  { id: 'tea', label: 'Shaah', Icon: Coffee },
  { id: 'milk', label: 'Caano', Icon: Milk },
  { id: 'bread', label: 'Canjeero', Icon: Croissant },
  { id: 'egg', label: 'Ukun', Icon: EggFried },
  { id: 'pot', label: 'Maraq', Icon: CookingPot },
  { id: 'beans', label: 'Digir', Icon: Bean },
]

export const MENU_ICONS: Record<MenuIcon, LucideIcon> = Object.fromEntries(
  MENU_ICON_OPTIONS.map(({ id, Icon }) => [id, Icon]),
) as Record<MenuIcon, LucideIcon>

/** Fallback for unknown / legacy icons */
export function getMenuIcon(icon: MenuIcon | string): LucideIcon {
  return MENU_ICONS[icon as MenuIcon] ?? Heart
}
