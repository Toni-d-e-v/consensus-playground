// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Ex1Time } from "../src/exhibits/ex1-time/Ex1Time";

describe("exhibit 1 shell (SPEC §6)", () => {
  beforeEach(() => {
    localStorage.setItem("cp-intro-ex1-time", "seen"); // skip the guided intro
  });

  it("renders chaos controls, transport bar, story feed, metrics, and hero controls", () => {
    render(
      <MemoryRouter>
        <Ex1Time />
      </MemoryRouter>,
    );

    // Chaos sidebar (SPEC §6 control list; behavior select hidden — single behavior)
    expect(screen.getByLabelText("Chaos controls")).toBeTruthy();
    expect(screen.getByLabelText("Latency")).toBeTruthy();
    expect(screen.getByLabelText("Jitter")).toBeTruthy();
    expect(screen.getByLabelText("Message loss")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Toggle network partition" })).toBeTruthy();
    expect(screen.getByLabelText("Adversary")).toBeTruthy();
    expect(screen.getByLabelText("Seed")).toBeTruthy();
    expect(screen.getByRole("button", { name: /reroll/i })).toBeTruthy();
    expect(screen.getByLabelText("Simulation speed")).toBeTruthy();
    // exhibit-specific extras (default preset is Mode A)
    expect(screen.getByLabelText("Clock drift")).toBeTruthy();
    expect(screen.getByLabelText("Snapshot length")).toBeTruthy();

    // Transport bar
    expect(screen.getByRole("button", { name: /^(Play|Pause)$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Step one tick" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset" })).toBeTruthy();
    expect(screen.getByLabelText("Scrub timeline")).toBeTruthy();
    expect(screen.getByLabelText("Current tick").textContent).toContain("TICK");

    // Hero controls (PHASE-2 §3.1)
    expect(screen.getByRole("button", { name: "Trust clocks" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Trust quorums" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /forge the past/i })).toBeTruthy();

    // Presets (PHASE-2 §3.3)
    for (const label of ["Perfect clocks", "Real world", "The heist", "Safety on"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }

    // Shell regions
    expect(screen.getByLabelText("Story feed")).toBeTruthy();
    expect(screen.getByLabelText("Stage")).toBeTruthy();
    expect(screen.getByText("Snapshots closed")).toBeTruthy();
    expect(screen.getByText("What we simplified")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share this run" })).toBeTruthy();
  });
});
