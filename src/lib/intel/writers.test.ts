import { describe, it, expect } from "vitest";
import { calculateWriterConfidence, type WriterContext } from "./writers";

const base: WriterContext = { pcr: 1.0, oiSkewScore: 0, atmPeLtpDelta: 0, atmCeLtpDelta: 0 };

describe("calculateWriterConfidence", () => {
  it("no chain (pcr 0) → insufficient", () => {
    const r = calculateWriterConfidence({ ...base, pcr: 0 });
    expect(r.insufficient).toBe(true);
    expect(r.putConfidence).toBeNull();
  });

  it("bullish signals → put writers win, confidences sum to 100", () => {
    const r = calculateWriterConfidence({ pcr: 1.6, oiSkewScore: 0.8, atmPeLtpDelta: -5, atmCeLtpDelta: 3 });
    expect(r.winner).toBe("put");
    expect(r.putConfidence! + r.callConfidence!).toBe(100);
    expect(r.putConfidence!).toBeGreaterThan(r.callConfidence!);
    expect(r.reason).toBe("Put Premium Decaying");
  });

  it("bearish signals → call writers win", () => {
    const r = calculateWriterConfidence({ pcr: 0.6, oiSkewScore: -0.8, atmPeLtpDelta: 4, atmCeLtpDelta: -6 });
    expect(r.winner).toBe("call");
    expect(r.callConfidence!).toBeGreaterThan(r.putConfidence!);
    expect(r.reason).toBe("Call Premium Decaying");
  });

  it("balanced inputs → balanced winner near 50/50", () => {
    const r = calculateWriterConfidence(base);
    expect(r.winner).toBe("balanced");
    expect(Math.abs(r.putConfidence! - 50)).toBeLessThanOrEqual(4);
  });
});
