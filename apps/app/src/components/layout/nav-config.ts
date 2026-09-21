import {
  BadgeCheck,
  BriefcaseBusiness,
  ClipboardCheck,
  LayoutDashboard,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { can, type Permission } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/auth/roles";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Undefined means every signed-in role sees it. */
  permission?: Permission;
};

export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Hiring",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      {
        title: "Queue",
        href: "/queue",
        icon: ClipboardCheck,
        permission: "queue:view",
      },
      {
        title: "Positions",
        href: "/positions",
        icon: BriefcaseBusiness,
        permission: "position:view",
      },
      {
        title: "Candidates",
        href: "/candidates",
        icon: Users,
        permission: "candidate:view",
      },
      {
        title: "Approvals",
        href: "/positions/approvals",
        icon: BadgeCheck,
        permission: "position:approve",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        title: "Users",
        href: "/admin/users",
        icon: UsersRound,
        permission: "user:manage",
      },
    ],
  },
];

export const QUICK_ADD_ITEMS: NavItem[] = [
  {
    title: "New position",
    href: "/positions/new",
    icon: BriefcaseBusiness,
    permission: "position:manage",
  },
  {
    title: "Add candidate",
    href: "/candidates/new",
    icon: UserPlus,
    permission: "candidate:manage",
  },
];

export function navGroupsForRole(role: UserRole): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.permission || can(role, item.permission),
    ),
  })).filter((group) => group.items.length > 0);
}

export function quickAddItemsForRole(role: UserRole): NavItem[] {
  return QUICK_ADD_ITEMS.filter(
    (item) => !item.permission || can(role, item.permission),
  );
}

export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
