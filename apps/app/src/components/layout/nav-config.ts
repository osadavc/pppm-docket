import {
  BadgeCheck,
  BriefcaseBusiness,
  ChartNoAxesColumn,
  ClipboardList,
  LayoutDashboard,
  Mail,
  Users,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Permission } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/auth/roles";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Undefined means every signed-in role sees it. */
  permission?: Permission;
  /** Keep role-specific workspaces out of unrelated sidebars. */
  roles?: readonly UserRole[];
};

export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Hiring",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      {
        title: "My applications",
        href: "/my-applications",
        icon: ClipboardList,
        roles: ["interviewer"],
      },
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
      },
    ],
  },
];
