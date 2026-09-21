import {
  BadgeCheck,
  BriefcaseBusiness,
  ChartNoAxesColumn,
  ClipboardCheck,
  ClipboardList,
  LayoutDashboard,
  Mail,
  Users,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Permission } from "@/lib/auth/permissions";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Undefined means every signed-in role sees it. */
  permission?: Permission;
  /** Unreleased destinations stay documented here but never render as dead links. */
  released?: boolean;
};

export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Hiring",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "My queue", href: "/queue", icon: ClipboardCheck },
      {
        title: "Positions",
        href: "/positions",
        icon: BriefcaseBusiness,
        permission: "position:view",
      },
      {
        title: "Approvals",
        href: "/positions/approvals",
        icon: BadgeCheck,
        permission: "position:approve",
      },
      {
        title: "Candidates",
        href: "/candidates",
        icon: Users,
        permission: "candidate:view",
      },
      {
        title: "Interviews",
        href: "/interviews",
        icon: ClipboardList,
        permission: "interview:view",
        released: false,
      },
    ],
  },
  {
    label: "Insight",
    items: [
      {
        title: "Reports",
        href: "/reports",
        icon: ChartNoAxesColumn,
        permission: "report:view",
        released: false,
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        title: "Stage templates",
        href: "/settings/templates",
        icon: ClipboardList,
        permission: "template:manage",
        released: false,
      },
      {
        title: "Users",
        href: "/admin/users",
        icon: UsersRound,
        permission: "user:manage",
      },
      {
        title: "Notifications",
        href: "/admin/notifications",
        icon: Mail,
        permission: "notification:view",
        released: false,
      },
    ],
  },
];
