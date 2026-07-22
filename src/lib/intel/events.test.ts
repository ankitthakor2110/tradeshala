import { describe, it, expect } from "vitest";
import {
  buildEventList,
  computeEventRisk,
  formatCountdown,
  type EventWindows,
  type ExpiryEventConfig,
} from "./events";
import type { MarketEvent } from "@/types/intel";

const W: EventWindows = {
  preWindowMin: 15,
  postWindowMin: 5,
  cautionLeadMin: 60,
  showNext: 4,
  horizonMin: 4320,
};

const NOW = Date.parse("2026-07-22T10:00:00+05:30");

/** ISO string for an event `minutes` from NOW (negative = in the past). */
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

const ev = (id: string, minutes: number, impact: MarketEvent["impact"]): MarketEvent => ({
  id,
  label: id,
  category: "Test",
  impact,
  at: at(minutes),
});

describe("computeEventRisk", () => {
  it("empty calendar → hasCalendar false, gate ok, no driver", () => {
    const r = computeEventRisk([], NOW, W);
    expect(r.hasCalendar).toBe(false);
    expect(r.gate).toBe("ok");
    expect(r.driver).toBeNull();
    expect(r.upcoming).toHaveLength(0);
  });

  it("high-impact event inside the pre window → avoid", () => {
    const r = computeEventRisk([ev("CPI", 10, "high")], NOW, W);
    expect(r.gate).toBe("avoid");
    expect(r.driver?.event.id).toBe("CPI");
    expect(r.driver?.window).toBe("pre");
    expect(r.reason).toMatch(/stand aside/i);
  });

  it("high-impact event in the wider caution lead → caution", () => {
    const r = computeEventRisk([ev("CPI", 45, "high")], NOW, W);
    expect(r.gate).toBe("caution");
    expect(r.driver?.window).toBe("watch");
  });

  it("high-impact event beyond the caution lead → ok but still listed", () => {
    const r = computeEventRisk([ev("CPI", 120, "high")], NOW, W);
    expect(r.gate).toBe("ok");
    expect(r.driver).toBeNull();
    expect(r.upcoming).toHaveLength(1);
    expect(r.upcoming[0].window).toBe("upcoming");
  });

  it("just-released high-impact event (inside post window) → avoid", () => {
    const r = computeEventRisk([ev("CPI", -3, "high")], NOW, W);
    expect(r.gate).toBe("avoid");
    expect(r.driver?.window).toBe("active");
  });

  it("event past the post window is dropped and does not gate", () => {
    const r = computeEventRisk([ev("CPI", -20, "high")], NOW, W);
    expect(r.gate).toBe("ok");
    expect(r.upcoming).toHaveLength(0);
  });

  it("medium impact inside the pre window → caution, not avoid", () => {
    const r = computeEventRisk([ev("PMI", 10, "medium")], NOW, W);
    expect(r.gate).toBe("caution");
  });

  it("low impact is informational only → ok", () => {
    const r = computeEventRisk([ev("minor", 5, "low")], NOW, W);
    expect(r.gate).toBe("ok");
    expect(r.driver).toBeNull();
  });

  it("worst gate wins and the driver is the soonest event carrying it", () => {
    const r = computeEventRisk([ev("mid", 10, "medium"), ev("big", 8, "high")], NOW, W);
    expect(r.gate).toBe("avoid");
    expect(r.driver?.event.id).toBe("big");
    // sorted soonest-first
    expect(r.upcoming.map((u) => u.event.id)).toEqual(["big", "mid"]);
  });

  it("respects the horizon and showNext caps", () => {
    const many = [ev("a", 5, "low"), ev("b", 20, "low"), ev("c", 30, "low"), ev("d", 40, "low"), ev("e", 50, "low")];
    const beyond = ev("far", W.horizonMin + 100, "high");
    const r = computeEventRisk([...many, beyond], NOW, W);
    expect(r.upcoming).toHaveLength(W.showNext);
    expect(r.upcoming.some((u) => u.event.id === "far")).toBe(false);
  });
});

describe("buildEventList", () => {
  const expiryCfg: ExpiryEventConfig = {
    label: "Weekly F&O Expiry",
    category: "Expiry",
    impact: "high",
    timeIst: "15:30",
  };

  it("derives an expiry event at 15:30 IST from a YYYY-MM-DD date", () => {
    const list = buildEventList([], "2026-07-24", expiryCfg);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("expiry-2026-07-24");
    expect(list[0].at).toBe("2026-07-24T15:30:00+05:30");
    expect(list[0].impact).toBe("high");
  });

  it("keeps curated entries and appends the expiry event", () => {
    const cal = [{ id: "CPI", label: "US CPI", category: "US Macro", impact: "high" as const, at: at(30) }];
    const list = buildEventList(cal, "2026-07-24", expiryCfg);
    expect(list.map((e) => e.id)).toEqual(["CPI", "expiry-2026-07-24"]);
  });

  it("ignores a malformed expiry date", () => {
    expect(buildEventList([], "not-a-date", expiryCfg)).toHaveLength(0);
    expect(buildEventList([], null, expiryCfg)).toHaveLength(0);
  });
});

describe("formatCountdown", () => {
  it("mm:ss inside the hour", () => {
    expect(formatCountdown(12 * 60_000 + 4_000)).toBe("12:04");
    expect(formatCountdown(90_000)).toBe("1:30");
  });
  it("h m beyond an hour, d h beyond a day", () => {
    expect(formatCountdown(3 * 3600_000 + 20 * 60_000)).toBe("3h 20m");
    expect(formatCountdown(2 * 86_400_000 + 4 * 3600_000)).toBe("2d 4h");
  });
  it("non-positive reads as now", () => {
    expect(formatCountdown(0)).toBe("now");
    expect(formatCountdown(-5000)).toBe("now");
  });
});
