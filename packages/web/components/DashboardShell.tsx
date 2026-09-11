"use client";
import { useState, type ReactNode } from "react";
import { Menu, ShieldCheck, ShieldOff, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";

export interface DashboardShellProps {
  /** Slot rendered in the left sidebar (the agent list). */
  sidebar: ReactNode;
  /** Whether the current session is World-verified (drives the header badge). */
  verified: boolean;
  children: ReactNode;
}

/**
 * The dashboard layout shell: a fixed 260px left sidebar + main content area.
 * Below the md breakpoint (768px) the sidebar collapses to an off-canvas drawer
 * toggled by the header hamburger. Dark-first, design tokens only (no inline
 * styles).
 */
export function DashboardShell({ sidebar, verified, children }: DashboardShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-surface/80 px-4 backdrop-blur md:px-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Toggle navigation menu"
            className="h-9 w-9 px-0 md:hidden"
            onClick={() => setDrawerOpen((o) => !o)}
          >
            {drawerOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </Button>
          <span className="text-xl font-bold tracking-tight text-fg-strong">WARDEN</span>
        </div>
        <div className="flex items-center gap-2">
          {verified ? (
            <Badge tone="success">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Verified
            </Badge>
          ) : (
            <Badge tone="warning">
              <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
              Not verified
            </Badge>
          )}
        </div>
      </header>

      <div className="flex flex-1">
        {/* Mobile overlay when the drawer is open. */}
        {drawerOpen ? (
          <div
            className="fixed inset-0 z-20 bg-black/50 md:hidden"
            aria-hidden="true"
            onClick={() => setDrawerOpen(false)}
          />
        ) : null}

        <aside
          role="complementary"
          aria-label="Agent list"
          className={cn(
            "fixed inset-y-0 left-0 top-16 z-20 w-[260px] shrink-0 overflow-y-auto",
            "border-r border-border bg-surface p-4 transition-transform",
            "md:static md:top-0 md:translate-x-0",
            drawerOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {sidebar}
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
