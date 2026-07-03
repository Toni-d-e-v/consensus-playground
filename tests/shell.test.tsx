// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Ex1Time } from "../src/exhibits/ex1-time/Ex1Time";

describe("exhibit shell (SPEC §6, Phase 0: non-functional render)", () => {
  it("renders chaos controls, transport bar, story feed, and metrics", () => {
    render(
      <MemoryRouter>
        <Ex1Time />
      </MemoryRouter>,
    );

    // Chaos sidebar (SPEC §6 control list)
    expect(screen.getByLabelText("Chaos controls")).toBeTruthy();
    expect(screen.getByLabelText(/latency/i)).toBeTruthy();
    expect(screen.getByLabelText(/jitter/i)).toBeTruthy();
    expect(screen.getByLabelText(/message loss/i)).toBeTruthy();
    expect(screen.getByRole("switch")).toBeTruthy(); // partition toggle
    expect(screen.getByLabelText("Adversary")).toBeTruthy();
    expect(screen.getByLabelText("Adversary behavior")).toBeTruthy();
    expect(screen.getByLabelText("Seed")).toBeTruthy();
    expect(screen.getByRole("button", { name: /reroll/i })).toBeTruthy();
    expect(screen.getByLabelText("Simulation speed")).toBeTruthy();

    // Transport bar
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Step one tick" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset" })).toBeTruthy();
    expect(screen.getByLabelText("Current tick").textContent).toContain("TICK");

    // Shell regions
    expect(screen.getByLabelText("Story feed")).toBeTruthy();
    expect(screen.getByLabelText("Stage")).toBeTruthy();
    expect(screen.getByText("Snapshots closed")).toBeTruthy();
  });
});
