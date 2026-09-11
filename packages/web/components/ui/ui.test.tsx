import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "./Button";
import { Card } from "./Card";
import { Badge } from "./Badge";
import { Progress } from "./Progress";
import { Dialog } from "./Dialog";
import { Skeleton } from "./Skeleton";
import { Toast } from "./Toast";

describe("Button", () => {
  it("renders its children", () => {
    render(<Button>Run</Button>);
    expect(screen.getByRole("button", { name: "Run" })).toBeInTheDocument();
  });

  it("fires onClick when enabled", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick and is disabled when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Nope
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Nope" });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("uses design tokens, never inline styles", () => {
    render(<Button variant="danger">Revoke</Button>);
    const btn = screen.getByRole("button", { name: "Revoke" });
    expect(btn.getAttribute("style")).toBeNull();
    expect(btn.className).toContain("bg-danger");
  });

  it("supports interactive state classes (hover/active/focus/disabled)", () => {
    render(<Button>State</Button>);
    const cls = screen.getByRole("button", { name: "State" }).className;
    expect(cls).toMatch(/hover:/);
    expect(cls).toMatch(/active:/);
    expect(cls).toMatch(/focus/);
    expect(cls).toMatch(/disabled:/);
  });
});

describe("Card", () => {
  it("renders children and applies surface tokens (no inline styles)", () => {
    render(<Card>panel</Card>);
    const el = screen.getByText("panel");
    expect(el).toBeInTheDocument();
    expect(el.getAttribute("style")).toBeNull();
  });
});

describe("Badge", () => {
  it("renders success/error/warning/neutral tone classes", () => {
    const { rerender } = render(<Badge tone="success">Executed</Badge>);
    expect(screen.getByText("Executed").className).toContain("text-success");
    rerender(<Badge tone="error">Rejected</Badge>);
    expect(screen.getByText("Rejected").className).toContain("text-danger");
    rerender(<Badge tone="warning">Revoked</Badge>);
    expect(screen.getByText("Revoked").className).toContain("text-warn");
    rerender(<Badge tone="neutral">Configured</Badge>);
    expect(screen.getByText("Configured")).toBeInTheDocument();
  });
});

describe("Progress", () => {
  it("reflects value as a percentage width and exposes aria attributes", () => {
    render(<Progress value={30} max={120} label="spend" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "30");
    expect(bar).toHaveAttribute("aria-valuemax", "120");
    // 30/120 = 25%
    const fill = bar.querySelector("[data-progress-fill]") as HTMLElement;
    expect(fill.className).toContain("w-[25%]");
  });

  it("clamps over-cap values to 100% and flags over-limit", () => {
    render(<Progress value={200} max={100} label="spend" />);
    const fill = screen.getByRole("progressbar").querySelector("[data-progress-fill]") as HTMLElement;
    expect(fill.className).toContain("w-[100%]");
    expect(fill.className).toContain("bg-danger");
  });
});

describe("Dialog", () => {
  it("does not render content when closed", () => {
    render(
      <Dialog open={false} onClose={() => {}} title="Create">
        <p>body</p>
      </Dialog>,
    );
    expect(screen.queryByText("body")).not.toBeInTheDocument();
  });

  it("renders content when open with a dialog role and title", () => {
    render(
      <Dialog open onClose={() => {}} title="Create Agent">
        <p>body</p>
      </Dialog>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Create Agent")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="X">
        <p>body</p>
      </Dialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Skeleton", () => {
  it("renders an animated placeholder with an accessible label", () => {
    render(<Skeleton label="loading agents" />);
    expect(screen.getByLabelText("loading agents")).toBeInTheDocument();
    expect(screen.getByLabelText("loading agents").className).toContain("animate-pulse");
  });
});

describe("Toast", () => {
  it("renders a message with a status role", () => {
    render(<Toast message="Agent created" tone="success" />);
    expect(screen.getByRole("status")).toHaveTextContent("Agent created");
  });
});
