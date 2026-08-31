import { describe, it, expect } from "vitest";
import { eventTreatment } from "./eventfilter";

describe("eventTreatment", () => {
  it("clears the list when there's no event window", () => {
    expect(eventTreatment("ok")).toEqual({
      level: "clear",
      dim: false,
      suppressBest: false,
      tone: "green",
    });
  });

  it("cautions (amber) without dimming for a nearby window", () => {
    const t = eventTreatment("caution");
    expect(t.level).toBe("caution");
    expect(t.dim).toBe(false);
    expect(t.suppressBest).toBe(false);
    expect(t.tone).toBe("amber");
  });

  it("dims and suppresses go-signals inside a high-impact window", () => {
    const t = eventTreatment("avoid");
    expect(t.level).toBe("avoid");
    expect(t.dim).toBe(true);
    expect(t.suppressBest).toBe(true);
    expect(t.tone).toBe("red");
  });
});
