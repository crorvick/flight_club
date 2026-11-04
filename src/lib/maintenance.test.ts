import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  describeDue,
  dueDate,
  hundredHourFrom,
  maintenanceStatus,
  moveReading,
  type MaintenanceInput,
} from "./maintenance";

const none: MaintenanceInput = {
  intervalMonths: null,
  intervalDays: null,
  dueEndOfMonth: true,
  intervalHours: null,
  lastCompletedOn: null,
  lastCompletedReading: null,
  currentReading: null,
};

describe("dueDate", () => {
  it("counts calendar months to the end of the month", () => {
    expect(dueDate("2026-03-14", 12)).toBe("2027-03-31");
    expect(dueDate("2026-03-01", 12)).toBe("2027-03-31");
  });

  it("handles short months and leap years", () => {
    expect(dueDate("2027-02-10", 12)).toBe("2028-02-29");
    expect(dueDate("2026-11-30", 3)).toBe("2027-02-28");
  });

  it("rolls over the year", () => {
    expect(dueDate("2026-11-05", 24)).toBe("2028-11-30");
    expect(dueDate("2026-12-05", 1)).toBe("2027-01-31");
  });
});

describe("maintenanceStatus by date", () => {
  const annual = { ...none, intervalMonths: 12, lastCompletedOn: "2025-12-03" };

  it("is ok well before the due date", () => {
    expect(maintenanceStatus(annual, "2026-10-01")).toEqual({
      state: "ok",
      dueOn: "2026-12-31",
      daysLeft: 91,
    });
  });

  it("is due soon within 30 days", () => {
    expect(maintenanceStatus(annual, "2026-12-01").state).toBe("due-soon");
  });

  it("is still due, not overdue, on the due date", () => {
    expect(maintenanceStatus(annual, "2026-12-31")).toMatchObject({
      state: "due-soon",
      daysLeft: 0,
    });
  });

  it("is overdue the day after", () => {
    expect(maintenanceStatus(annual, "2027-01-01")).toMatchObject({
      state: "overdue",
      daysLeft: -1,
    });
  });
});

describe("maintenanceStatus by hours", () => {
  const hundredHour = {
    ...none,
    intervalHours: "100.00",
    lastCompletedReading: "4200.00",
  };

  it("counts hours left on the meter", () => {
    expect(
      maintenanceStatus(
        { ...hundredHour, currentReading: "4250.50" },
        "2026-11-01",
      ),
    ).toEqual({ state: "ok", dueAt: 430000, hoursLeft: 4950 });
  });

  it("is due soon within 10 hours", () => {
    expect(
      maintenanceStatus(
        { ...hundredHour, currentReading: "4290.00" },
        "2026-11-01",
      ).state,
    ).toBe("due-soon");
  });

  it("is due, not overdue, at exactly the reading", () => {
    expect(
      maintenanceStatus(
        { ...hundredHour, currentReading: "4300.00" },
        "2026-11-01",
      ).state,
    ).toBe("due-soon");
  });

  it("is overdue once flown past it", () => {
    expect(
      maintenanceStatus(
        { ...hundredHour, currentReading: "4300.10" },
        "2026-11-01",
      ),
    ).toMatchObject({ state: "overdue", hoursLeft: -10 });
  });
});

describe("maintenanceStatus with both intervals", () => {
  const oilChange = {
    ...none,
    intervalMonths: 4,
    intervalHours: "50.00",
    lastCompletedOn: "2026-09-10",
    lastCompletedReading: "4200.00",
  };

  it("is overdue when either limit has passed", () => {
    expect(
      maintenanceStatus(
        { ...oilChange, currentReading: "4251.00" },
        "2026-10-01",
      ).state,
    ).toBe("overdue");
    expect(
      maintenanceStatus(
        { ...oilChange, currentReading: "4210.00" },
        "2027-02-01",
      ).state,
    ).toBe("overdue");
  });

  it("reports both limits", () => {
    expect(
      maintenanceStatus(
        { ...oilChange, currentReading: "4210.00" },
        "2026-10-01",
      ),
    ).toMatchObject({ state: "ok", dueOn: "2027-01-31", dueAt: 425000 });
  });
});

describe("describeDue", () => {
  it("describes a date limit", () => {
    expect(
      describeDue({ state: "ok", dueOn: "2026-12-31", daysLeft: 30 }),
    ).toBe("due Dec 31, 2026 (30 days)");
    expect(
      describeDue({ state: "due-soon", dueOn: "2026-11-01", daysLeft: 0 }),
    ).toBe("due Nov 1, 2026 (today)");
    expect(
      describeDue({ state: "overdue", dueOn: "2026-10-31", daysLeft: -1 }),
    ).toBe("1 day overdue (due Oct 31, 2026)");
  });

  it("describes an hours limit on its meter", () => {
    expect(
      describeDue({ state: "due-soon", dueAt: 430000, hoursLeft: 950 }, "Tach"),
    ).toBe("due at 4300.0 on the tach (9.5 hours left)");
    expect(
      describeDue({ state: "overdue", dueAt: 430000, hoursLeft: -520 }, "Tach"),
    ).toBe("5.2 hours overdue on the tach");
  });

  it("joins both limits", () => {
    expect(
      describeDue(
        {
          state: "due-soon",
          dueOn: "2027-01-31",
          daysLeft: 91,
          dueAt: 425000,
          hoursLeft: 400,
        },
        "Tach",
      ),
    ).toBe(
      "due Jan 31, 2027 (91 days), or due at 4250.0 on the tach (4.0 hours left)",
    );
  });
});

describe("addMonths", () => {
  it("keeps the day of the month", () => {
    expect(addMonths("2026-01-15", 6)).toBe("2026-07-15");
  });

  it("falls back to the last day of a shorter month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2027-01-31", 13)).toBe("2028-02-29");
  });
});

describe("addDays", () => {
  it("crosses months and years", () => {
    expect(addDays("2026-10-01", 30)).toBe("2026-10-31");
    expect(addDays("2026-12-20", 30)).toBe("2027-01-19");
  });
});

describe("maintenanceStatus with exact calendar intervals", () => {
  // 14 CFR 91.171: a VOR check within the preceding 30 days.
  const vorCheck = { ...none, intervalDays: 30, lastCompletedOn: "2026-10-01" };

  it("is due exactly that many days later", () => {
    expect(maintenanceStatus(vorCheck, "2026-10-20")).toMatchObject({
      state: "ok",
      dueOn: "2026-10-31",
      daysLeft: 11,
    });
    expect(maintenanceStatus(vorCheck, "2026-11-01").state).toBe("overdue");
  });

  it("warns within a quarter of a short interval, not 30 days", () => {
    expect(maintenanceStatus(vorCheck, "2026-10-23").state).toBe("ok");
    expect(maintenanceStatus(vorCheck, "2026-10-24").state).toBe("due-soon");
  });

  it("can count months to the day instead of the month's end", () => {
    const exact = {
      ...none,
      intervalMonths: 6,
      dueEndOfMonth: false,
      lastCompletedOn: "2026-01-15",
    };
    expect(maintenanceStatus(exact, "2026-07-15")).toMatchObject({
      dueOn: "2026-07-15",
      state: "due-soon",
    });
    expect(maintenanceStatus(exact, "2026-07-16").state).toBe("overdue");
  });
});

describe("due-soon window for short hours intervals", () => {
  it("is a quarter of the interval when that's under 10 hours", () => {
    const short = {
      ...none,
      intervalHours: "20.00",
      lastCompletedReading: "100.00",
    };
    expect(
      maintenanceStatus({ ...short, currentReading: "114.90" }, "2026-11-01")
        .state,
    ).toBe("ok");
    expect(
      maintenanceStatus({ ...short, currentReading: "115.00" }, "2026-11-01")
        .state,
    ).toBe("due-soon");
  });
});

describe("moveReading", () => {
  it("keeps the hours left when moving to another meter", () => {
    // Done at 1200.0 on the Hobbs, which now reads 1250.0: 50 hours ago.
    // The tach reads 980.0, so on the tach it was done at 930.0.
    expect(moveReading("1200.00", "1250.00", "980.00")).toBe("930.00");
    expect(moveReading("930.00", "980.00", "1250.00")).toBe("1200.00");
  });

  it("never goes below zero", () => {
    expect(moveReading("10.00", "500.00", "20.00")).toBe("0.00");
  });
});

describe("maintenanceStatus for an item done once", () => {
  const once: MaintenanceInput = {
    ...none,
    schedule: "once",
    dueOn: "2026-12-01",
    dueReading: "1300.00",
    currentReading: "1250.00",
  };

  it("is due by whichever comes first", () => {
    expect(maintenanceStatus(once, "2026-10-01")).toMatchObject({
      state: "ok",
      dueOn: "2026-12-01",
      daysLeft: 61,
      dueAt: 130000,
      hoursLeft: 5000,
    });
    expect(
      maintenanceStatus({ ...once, currentReading: "1301.00" }, "2026-10-01")
        .state,
    ).toBe("overdue");
  });

  it("warns 30 days or 10 hours ahead, having no interval", () => {
    expect(maintenanceStatus(once, "2026-11-01").state).toBe("due-soon");
    expect(
      maintenanceStatus({ ...once, currentReading: "1290.00" }, "2026-10-01")
        .state,
    ).toBe("due-soon");
  });

  it("ignores intervals and the last completion", () => {
    expect(
      maintenanceStatus(
        { ...once, intervalDays: 1, lastCompletedOn: "2020-01-01" },
        "2026-10-01",
      ).state,
    ).toBe("ok");
  });

  it("is closed once done, and never due", () => {
    expect(
      maintenanceStatus({ ...once, closedOn: "2026-10-05" }, "2027-06-01"),
    ).toEqual({ state: "closed", closedOn: "2026-10-05" });
  });

  it("is closed when it doesn't apply", () => {
    const status = maintenanceStatus(
      { ...once, notApplicable: "Serial number not affected" },
      "2027-06-01",
    );
    expect(status).toEqual({
      state: "closed",
      notApplicable: "Serial number not affected",
    });
    expect(describeDue(status)).toBe(
      "Not applicable: Serial number not affected",
    );
  });
});

describe("maintenanceStatus for an item that expires", () => {
  const expires: MaintenanceInput = {
    ...none,
    schedule: "expires",
    dueOn: "2027-03-31",
  };

  it("is due on its expiration date", () => {
    expect(maintenanceStatus(expires, "2027-03-31").state).toBe("due-soon");
    expect(maintenanceStatus(expires, "2027-04-01").state).toBe("overdue");
    expect(maintenanceStatus(expires, "2027-02-01").state).toBe("ok");
  });

  it("warns only a week ahead for a navigation database", () => {
    const database = { ...expires, kind: "nav_database" as const };
    expect(maintenanceStatus(database, "2027-03-20").state).toBe("ok");
    expect(maintenanceStatus(database, "2027-03-24").state).toBe("due-soon");
  });
});

describe("hundredHourFrom", () => {
  it("counts from when it was done, if done early", () => {
    expect(hundredHourFrom("1095.00", "1000.00", "100.00")).toBe("1095.00");
  });

  it("counts from when it was due, if flown over", () => {
    expect(hundredHourFrom("1106.50", "1000.00", "100.00")).toBe("1100.00");
  });
});

describe("describeDue for a closed item", () => {
  it("says when it was done", () => {
    expect(describeDue({ state: "closed", closedOn: "2026-10-05" })).toBe(
      "Done Oct 5, 2026",
    );
  });
});
