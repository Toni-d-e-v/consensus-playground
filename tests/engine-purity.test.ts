import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";

/*
 * SPEC §10.4 — engine purity. Lints fixture snippets as if they lived in
 * src/engine/** and asserts every banned pattern errors, so a config
 * regression fails CI as a test, not just as a lint run.
 */

const eslint = new ESLint({ cwd: process.cwd() });

const ENGINE_PATH = "src/engine/core/__purity_fixture__.ts";
const UI_PATH = "src/components/__purity_fixture__.ts";

async function restrictedRuleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .map((m) => m.ruleId ?? "")
    .filter((id) => id.startsWith("no-restricted"));
}

describe("engine purity lint rules (SPEC §4 / §10.4)", () => {
  it("bans Math.random in the engine", async () => {
    const ids = await restrictedRuleIds("export const x = Math.random();", ENGINE_PATH);
    expect(ids).toContain("no-restricted-properties");
  });

  it("bans Date.now in the engine", async () => {
    const ids = await restrictedRuleIds("export const t = Date.now();", ENGINE_PATH);
    expect(ids).toContain("no-restricted-properties");
  });

  it("bans performance.now in the engine", async () => {
    const ids = await restrictedRuleIds("export const p = performance.now();", ENGINE_PATH);
    expect(ids.length).toBeGreaterThan(0);
  });

  it("bans DOM globals in the engine", async () => {
    const ids = await restrictedRuleIds("export const d = document.title;", ENGINE_PATH);
    expect(ids).toContain("no-restricted-globals");
  });

  it("bans React imports in the engine", async () => {
    const ids = await restrictedRuleIds(
      'import React from "react";\nexport const r = React;',
      ENGINE_PATH,
    );
    expect(ids).toContain("no-restricted-imports");
  });

  it("bans engine → exhibits imports", async () => {
    const ids = await restrictedRuleIds(
      'import { Ex1Time } from "../../exhibits/ex1-time/Ex1Time";\nexport const e = Ex1Time;',
      ENGINE_PATH,
    );
    expect(ids).toContain("no-restricted-imports");
  });

  it("accepts clean engine code", async () => {
    const ids = await restrictedRuleIds(
      "export function add(a: number, b: number): number { return a + b; }",
      ENGINE_PATH,
    );
    expect(ids).toEqual([]);
  });

  it("does not apply engine rules outside src/engine/**", async () => {
    const ids = await restrictedRuleIds("export const x = Math.random();", UI_PATH);
    expect(ids).toEqual([]);
  });
});
