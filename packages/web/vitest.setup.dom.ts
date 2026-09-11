// DOM testing setup: registers @testing-library/jest-dom matchers on Vitest's
// expect and auto-cleans the React tree between tests. Safe to load in the node
// environment too (it only augments `expect` and registers an afterEach hook);
// the jsdom-only assertions are simply never exercised by the node route tests.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
