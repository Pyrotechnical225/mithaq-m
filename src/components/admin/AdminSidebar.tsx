import { Link, useLocation } from "@tanstack/react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { BrandName } from "@/components/BrandName";

/**
 * The admin nav was 8 top-level links plus a button in a flex row, which
 * wrapped badly and gave no sense of grouping. Grouped here into
 * Members / Imams / Operations with the current page clearly marked.
 */
const GROUPS = [
  {
    label: "Members",
    items: [
      { to: "/admin/profiles", label: "Profiles" },
      { to: "/admin/new-profile", label: "New profile" },
      { to: "/admin/memberships", label: "Memberships" },
    ],
  },
  {
    label: "Imams",
    items: [
      { to: "/admin/imams", label: "Directory" },
      { to: "/admin/imam-applications", label: "Applications & pairings" },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/admin/compatibility", label: "Scoring audit", exact: true },
      { to: "/admin/compatibility/matrix", label: "Compatibility matrix" },
      { to: "/admin/seed", label: "Seed data" },
    ],
  },
] as const;

export function AdminSidebar() {
  const { pathname } = useLocation();

  // Computed rather than passed via Link activeProps: SidebarMenuButton sets
  // data-active itself, and relying on Slot prop-merge order to override it is
  // fragile. /admin/profiles stays active on /admin/profiles/$userId.
  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/admin" className="flex items-center gap-2 px-2 py-1.5">
          <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground">
            Admin
          </span>
          <BrandName className="text-base" />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/admin", true)}>
                  <Link to="/admin">Overview</Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.to, "exact" in item ? item.exact : false)}
                    >
                      <Link to={item.to}>{item.label}</Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link to="/dashboard">← Member view</Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
