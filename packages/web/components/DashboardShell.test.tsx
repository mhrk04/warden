import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DashboardShell } from "./DashboardShell";

describe("DashboardShell", () => {
  it("renders the WARDEN title in the header", () => {
    render(
      <DashboardShell sidebar={<div>agent list</div>} verified={false}>
        <div>main content</div>
      </DashboardShell>,
    );
    expect(screen.getByText("WARDEN")).toBeInTheDocument();
  });

  it("renders the sidebar slot and main content", () => {
    render(
      <DashboardShell sidebar={<div>agent list</div>} verified={false}>
        <div>main content</div>
      </DashboardShell>,
    );
    expect(screen.getByText("agent list")).toBeInTheDocument();
    expect(screen.getByText("main content")).toBeInTheDocument();
  });

  it("shows a verification-status indicator reflecting the verified prop", () => {
    const { rerender } = render(
      <DashboardShell sidebar={<div />} verified={false}>
        <div />
      </DashboardShell>,
    );
    expect(screen.getByText(/not verified/i)).toBeInTheDocument();
    rerender(
      <DashboardShell sidebar={<div />} verified>
        <div />
      </DashboardShell>,
    );
    expect(screen.getByText(/verified/i)).toBeInTheDocument();
  });

  it("has a fixed-width sidebar (260px) that collapses to a drawer below 768px", () => {
    render(
      <DashboardShell sidebar={<div>agent list</div>} verified={false}>
        <div />
      </DashboardShell>,
    );
    const aside = screen.getByRole("complementary");
    // 260px sidebar on desktop; responsive breakpoint at md (768px).
    expect(aside.className).toContain("w-[260px]");
    expect(aside.className).toMatch(/md:/);
  });

  it("toggles the mobile drawer with the hamburger button", () => {
    render(
      <DashboardShell sidebar={<div>agent list</div>} verified={false}>
        <div />
      </DashboardShell>,
    );
    const toggle = screen.getByRole("button", { name: /menu|navigation/i });
    const aside = screen.getByRole("complementary");
    // Closed by default on mobile => translated off-canvas.
    expect(aside.className).toMatch(/-translate-x-full/);
    fireEvent.click(toggle);
    expect(aside.className).toMatch(/translate-x-0/);
  });

  it("uses no inline styles", () => {
    const { container } = render(
      <DashboardShell sidebar={<div>agent list</div>} verified={false}>
        <div>main content</div>
      </DashboardShell>,
    );
    const withStyle = container.querySelectorAll("[style]");
    expect(withStyle.length).toBe(0);
  });
});
