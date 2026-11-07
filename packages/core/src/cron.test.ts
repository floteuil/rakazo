import { describe, expect, it } from "vitest";
import {
  type CronPreset,
  cronFromPreset,
  DEFAULT_ROUTINE_TIMEZONE,
  describeCronPreset,
  describeCronPresetFr,
  formatClock24Fr,
  formatCron,
  formatCronFr,
  nextCronDate,
  presetFromCron,
} from "./cron.js";

function preset(partial: Partial<CronPreset> & Pick<CronPreset, "freq">): CronPreset {
  return {
    n: 3,
    unit: "minutes",
    time: "9:00 AM",
    cron: "",
    ...partial,
  };
}

describe("cronFromPreset", () => {
  it("maps everyday language onto cron", () => {
    expect(cronFromPreset(preset({ freq: "Every day", time: "9:00 AM" }))).toBe("0 9 * * *");
    expect(cronFromPreset(preset({ freq: "Weekdays", time: "8:00 AM" }))).toBe("0 8 * * 1-5");
    expect(cronFromPreset(preset({ freq: "Every week", time: "9:00 AM" }))).toBe("0 9 * * 1");
    expect(cronFromPreset(preset({ freq: "Every month", time: "12:00 PM" }))).toBe("0 12 1 * *");
    expect(cronFromPreset(preset({ freq: "Every hour" }))).toBe("0 * * * *");
    expect(cronFromPreset(preset({ freq: "Every day", time: "12:00 AM" }))).toBe("0 0 * * *");
    expect(cronFromPreset(preset({ freq: "Every day", time: "3:00 PM" }))).toBe("0 15 * * *");
  });

  it("maps intervals including days", () => {
    expect(cronFromPreset(preset({ freq: "Interval", n: 15, unit: "minutes" }))).toBe(
      "*/15 * * * *",
    );
    expect(cronFromPreset(preset({ freq: "Interval", n: 2, unit: "hours" }))).toBe("0 */2 * * *");
    expect(cronFromPreset(preset({ freq: "Interval", n: 3, unit: "days" }))).toBe("0 0 */3 * *");
  });

  it("keeps advanced expressions", () => {
    expect(cronFromPreset(preset({ freq: "Advanced", cron: "0 10 15 * *" }))).toBe("0 10 15 * *");
    expect(cronFromPreset(preset({ freq: "Advanced", cron: "" }))).toBe("*/3 * * * *");
  });
});

describe("presetFromCron", () => {
  it("reads the previous Monday-morning default as weekly", () => {
    expect(presetFromCron("0 9 * * 1")).toMatchObject({
      freq: "Every week",
      time: "9:00 AM",
    });
  });

  it("round-trips the named presets", () => {
    const cases: CronPreset[] = [
      preset({ freq: "Every hour" }),
      preset({ freq: "Every day", time: "6:00 PM" }),
      preset({ freq: "Weekdays", time: "7:00 AM" }),
      preset({ freq: "Every week", time: "9:00 AM" }),
      preset({ freq: "Every month", time: "12:00 PM" }),
      preset({ freq: "Interval", n: 10, unit: "minutes" }),
      preset({ freq: "Interval", n: 5, unit: "hours" }),
      preset({ freq: "Interval", n: 2, unit: "days" }),
      preset({ freq: "Advanced", cron: "0 10 15 * *" }),
    ];
    for (const input of cases) {
      const cron = cronFromPreset(input);
      const parsed = presetFromCron(cron);
      expect(parsed.freq).toBe(input.freq);
      if (input.freq === "Interval") {
        expect(parsed.n).toBe(input.n);
        expect(parsed.unit).toBe(input.unit);
      }
      if (["Every day", "Weekdays", "Every week", "Every month"].includes(input.freq)) {
        expect(parsed.time).toBe(input.time);
      }
      if (input.freq === "Advanced") {
        expect(parsed.cron).toBe(input.cron);
      }
    }
  });

  it("falls back to advanced for expressions the picker cannot represent", () => {
    expect(presetFromCron("0 9 * * 0")).toMatchObject({ freq: "Advanced", cron: "0 9 * * 0" });
    expect(presetFromCron("30 14 15 * *")).toMatchObject({
      freq: "Advanced",
      cron: "30 14 15 * *",
    });
  });
});

describe("formatCron", () => {
  it("shows a human schedule instead of the expression", () => {
    expect(formatCron("0 9 * * 1")).toBe("Every Monday at 9:00 AM");
    expect(formatCron("0 8 * * 1-5")).toBe("Weekdays at 8:00 AM");
    expect(formatCron("*/15 * * * *")).toBe("Every 15 minutes");
    expect(describeCronPreset(preset({ freq: "Every hour" }))).toEqual({
      lead: "Every hour",
      detail: "",
    });
  });
});

describe("French Time Standard (Europe/Paris, 24h format & DST)", () => {
  it("uses Europe/Paris as DEFAULT_ROUTINE_TIMEZONE", () => {
    expect(DEFAULT_ROUTINE_TIMEZONE).toBe("Europe/Paris");
  });

  it("parses both 24-hour French times and 12-hour times into cron and 24h display", () => {
    expect(cronFromPreset(preset({ freq: "Every day", time: "09:00" }))).toBe("0 9 * * *");
    expect(cronFromPreset(preset({ freq: "Every day", time: "14:30" }))).toBe("30 14 * * *");
    expect(cronFromPreset(preset({ freq: "Weekdays", time: "08h30" }))).toBe("30 8 * * 1-5");

    expect(formatClock24Fr("9:00 AM")).toBe("09:00");
    expect(formatClock24Fr("3:00 PM")).toBe("15:00");
    expect(formatClock24Fr("12:00 PM")).toBe("12:00");
    expect(formatClock24Fr("12:00 AM")).toBe("00:00");
    expect(formatClock24Fr("18:30")).toBe("18:30");
  });

  it("formats schedules in French with 24-hour clock", () => {
    expect(formatCronFr("0 9 * * *")).toBe("Tous les jours à 09:00");
    expect(formatCronFr("0 8 * * 1-5")).toBe("Du lundi au vendredi à 08:00");
    expect(formatCronFr("0 14 * * 1")).toBe("Chaque lundi à 14:00");
    expect(formatCronFr("0 9 1 * *")).toBe("Le 1er du mois à 09:00");
    expect(formatCronFr("*/15 * * * *")).toBe("Toutes les 15 minutes");
    expect(formatCronFr("0 */2 * * *")).toBe("Toutes les 2 heures");
    expect(formatCronFr("0 0 */3 * *")).toBe("Tous les 3 jours");
    expect(describeCronPresetFr(preset({ freq: "Every hour" }))).toEqual({
      lead: "Toutes les heures",
      detail: "",
    });
  });

  it("computes nextCronDate at 09:00 Europe/Paris across winter (CET UTC+1) and summer (CEST UTC+2)", () => {
    // Winter (January 15, 2026 — CET is UTC+1): 09:00 Paris = 08:00 UTC
    const winterFrom = new Date("2026-01-15T06:30:00.000Z");
    const nextWinter = nextCronDate("0 9 * * *", winterFrom, "Europe/Paris");
    expect(nextWinter.toISOString()).toBe("2026-01-15T08:00:00.000Z");

    // Summer (July 15, 2026 — CEST is UTC+2): 09:00 Paris = 07:00 UTC
    const summerFrom = new Date("2026-07-15T06:30:00.000Z");
    const nextSummer = nextCronDate("0 9 * * *", summerFrom, "Europe/Paris");
    expect(nextSummer.toISOString()).toBe("2026-07-15T07:00:00.000Z");

    // Weekday filtering (Saturday Jan 17, 2026 -> jumps to Monday Jan 19, 2026 at 09:00 Paris = 08:00 UTC)
    const saturdayWinter = new Date("2026-01-17T07:00:00.000Z");
    const nextWeekday = nextCronDate("0 9 * * 1-5", saturdayWinter, "Europe/Paris");
    expect(nextWeekday.toISOString()).toBe("2026-01-19T08:00:00.000Z");
  });
});
