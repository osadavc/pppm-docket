import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, test } from "node:test";
import { ROLES, type UserRole } from "@/lib/auth/roles";
import {
  isNavItemActive,
  navGroupsForRole,
  quickAddItemsForRole,
} from "./nav-config";

const APP_DIRECTORY = join(process.cwd(), "src", "app");

function appPageRoutes(directory = APP_DIRECTORY): Set<string> {
  const routes = new Set<string>();

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      for (const route of appPageRoutes(path)) routes.add(route);
      continue;
    }

    if (entry.name !== "page.tsx") continue;

    const segments = relative(APP_DIRECTORY, directory)
      .split(sep)
      .filter(Boolean)
      .filter((segment) => !segment.startsWith("("));
    routes.add(segments.length === 0 ? "/" : `/${segments.join("/")}`);
  }

  return routes;
}

function navHrefs(role: UserRole): string[] {
  return navGroupsForRole(role).flatMap((group) =>
    group.items.map((item) => item.href),
  );
}

describe("role-aware navigation", () => {
  const expected: Record<UserRole, string[]> = {
    interviewer: ["/dashboard", "/queue"],
    hr: ["/dashboard", "/queue", "/positions", "/candidates", "/reports"],
    management: [
      "/dashboard",
      "/queue",
      "/positions",
      "/candidates",
      "/positions/approvals",
      "/reports",
      "/admin/users",
    ],
  };

  for (const role of ROLES) {
    test(`${role} sees only its released destinations`, () => {
      assert.deepEqual(navHrefs(role), expected[role]);
    });

    test(`${role} navigation and quick actions resolve to app pages`, () => {
      const routes = appPageRoutes();
      const destinations = [
        ...navHrefs(role),
        ...quickAddItemsForRole(role).map((item) => item.href),
      ];

      assert.equal(new Set(destinations).size, destinations.length);
      for (const destination of destinations) {
        assert.equal(
          routes.has(destination),
          true,
          `${destination} would return 404`,
        );
      }
    });
  }

  test("unreleased destinations are absent from every role", () => {
    const allDestinations = ROLES.flatMap(navHrefs);

    assert.equal(allDestinations.includes("/interviews"), false);
    assert.equal(allDestinations.includes("/settings/templates"), false);
    assert.equal(allDestinations.includes("/admin/notifications"), false);
  });

  test("quick-add follows create permissions", () => {
    assert.deepEqual(
      quickAddItemsForRole("hr").map((item) => item.href),
      ["/positions/new", "/candidates/new"],
    );
    assert.deepEqual(quickAddItemsForRole("interviewer"), []);
    assert.deepEqual(quickAddItemsForRole("management"), []);
  });

  test("nested routes keep their parent navigation item active", () => {
    assert.equal(
      isNavItemActive("/positions/position-1/edit", "/positions"),
      true,
    );
    assert.equal(isNavItemActive("/queue", "/queue"), true);
    assert.equal(isNavItemActive("/queueing", "/queue"), false);
  });
});
