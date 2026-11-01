// Fill an empty database with sample members, aircraft, flights and
// squawks, for local development and staging:
//
//   node scripts/seed.mts
//
// Refuses to run if any aircraft exist, so it can't be pointed at a
// database with real records by mistake.  Like the other scripts it needs
// only postgres, so it also runs inside the image, from the staging
// service's shell in Render.
//
// Seeded members have no passwords; they exist to fly the sample flights.
// To sign in, create your own account and approve it with
// approve-member.mts.
import postgres from "postgres";

type MeterKind = "tach" | "hobbs" | "air_time";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

// Deterministic, so every seeded database looks the same (mulberry32).
let state = 0x5eed;
function random() {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (min: number, max: number) =>
  min + Math.floor(random() * (max - min + 1));
const pick = <T,>(items: readonly T[]) => items[between(0, items.length - 1)];

// Meter values are kept in integer hundredths of an hour and only turned
// into decimal strings for the database, so no float error creeps in.
const toHours = (hundredths: number) => (hundredths / 100).toFixed(2);

const members = [
  {
    name: "Dana Whitfield",
    email: "dana@example.com",
    roles: ["pilot", "officer"],
  },
  { name: "Marcus Oyelaran", email: "marcus@example.com", roles: ["pilot"] },
  { name: "Priya Raman", email: "priya@example.com", roles: ["pilot"] },
  { name: "Tom Brekke", email: "tom@example.com", roles: ["pilot", "officer"] },
  { name: "Lena Kovacs", email: "lena@example.com", roles: ["pilot"] },
];

// Starting readings in hundredths.  Most aircraft have tach and Hobbs, one
// has an air-time meter as well, and the Cub has only a tach.
const fleet: {
  tailNumber: string;
  makeModel: string;
  billing: MeterKind;
  meters: Partial<Record<MeterKind, number>>;
}[] = [
  {
    tailNumber: "N172FC",
    makeModel: "Cessna 172S Skyhawk",
    billing: "hobbs",
    meters: { tach: 421030, hobbs: 503280 },
  },
  {
    tailNumber: "N281FC",
    makeModel: "Piper PA-28-181 Archer",
    billing: "tach",
    meters: { tach: 689010, hobbs: 771240 },
  },
  {
    tailNumber: "N182FC",
    makeModel: "Cessna 182T Skylane",
    billing: "hobbs",
    meters: { tach: 210460, hobbs: 247700, air_time: 201190 },
  },
  {
    tailNumber: "N3JFC",
    makeModel: "Piper J-3 Cub",
    billing: "tach",
    meters: { tach: 331520 },
  },
];

const meterLabels: Record<MeterKind, string> = {
  tach: "Tach",
  hobbs: "Hobbs",
  air_time: "Air time",
};

const notes = [null, null, null, "Pattern work", "Cross-country", "Checkout"];

function daysAgo(days: number, hour: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(hour, between(0, 59), 0, 0);
  return date;
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const [{ count }] = await sql`select count(*)::int as count from aircraft`;
  if (count > 0) {
    console.error("Aircraft already exist; seed only empty databases");
    process.exitCode = 1;
  } else {
    await sql.begin(async (tx) => {
      const memberIds: string[] = [];
      for (const m of members) {
        const [row] = await tx`
          insert into member (name, email, roles, active)
          values (${m.name}, ${m.email}, ${m.roles}::text[], true)
          returning id
        `;
        memberIds.push(row.id);
      }
      const officerId = memberIds[0];

      const aircraftIds: Record<string, string> = {};
      for (const plane of fleet) {
        const [{ id: aircraftId }] = await tx`
          insert into aircraft (tail_number, make_model, has_fuel_totalizer)
          values (
            ${plane.tailNumber}, ${plane.makeModel},
            ${plane.tailNumber === "N182FC"}
          )
          returning id
        `;
        aircraftIds[plane.tailNumber] = aircraftId;

        const meterIds = {} as Record<MeterKind, string>;
        for (const [kind, start] of Object.entries(plane.meters)) {
          const [{ id }] = await tx`
            insert into meter (aircraft_id, kind, label, current_reading)
            values (${aircraftId}, ${kind}, ${meterLabels[kind as MeterKind]},
                    ${toHours(start)})
            returning id
          `;
          meterIds[kind as MeterKind] = id;
        }
        await tx`
          update aircraft
          set billing_meter_id = ${meterIds[plane.billing]},
            logbook_meter_id = ${meterIds.tach}
          where id = ${aircraftId}
        `;

        // A couple of months of flights, oldest first, each starting where
        // the last one ended.
        const readings = { ...plane.meters };
        let day = between(55, 62);
        let previous: { id: string; createdAt: Date } | undefined;
        while (day > 0) {
          // Hobbs runs whenever the engine does; tach runs a bit slower
          // below cruise RPM; air time excludes taxi and run-up.
          const hobbs = between(8, 26) * 10;
          const delta: Record<MeterKind, number> = {
            hobbs,
            tach: Math.max(10, Math.round((hobbs * 0.85) / 10) * 10),
            air_time: Math.max(10, hobbs - between(2, 4) * 10),
          };
          const night = random() < 0.15;
          const createdAt = daysAgo(day, night ? 3 : between(15, 23));

          const [flight] = await tx`
            insert into flight (
              aircraft_id, pilot_id, date, notes, billing_meter_kind,
              billed_hours, fuel_added, oil_added, totalizer_fuel,
              created_at, updated_at
            )
            values (
              ${aircraftId}, ${pick(memberIds)},
              ${createdAt.toISOString().slice(0, 10)},
              ${pick(notes)}, ${plane.billing},
              ${toHours(delta[plane.billing])},
              ${random() < 0.4 ? `${between(8, 30)}.0` : "0.0"},
              ${random() < 0.1 ? "1.0" : "0.0"},
              ${plane.tailNumber === "N182FC" ? `${between(25, 70)}.${between(0, 9)}` : null},
              ${createdAt}, ${createdAt}
            )
            returning id
          `;
          for (const kind of Object.keys(readings) as MeterKind[]) {
            const out = readings[kind]!;
            readings[kind] = out + delta[kind];
            await tx`
              insert into flight_meter_reading (flight_id, meter_id, out, "in")
              values (${flight.id}, ${meterIds[kind]}, ${toHours(out)},
                      ${toHours(readings[kind]!)})
            `;
          }

          // Checking in a flight locks the one before it.
          if (previous) {
            await tx`
              update flight set locked_at = ${createdAt}
              where id = ${previous.id}
            `;
          }
          previous = { id: flight.id, createdAt };
          day -= between(2, 9);
        }

        for (const [kind, value] of Object.entries(readings)) {
          await tx`
            update meter set current_reading = ${toHours(value)}
            where id = ${meterIds[kind as MeterKind]}
          `;
        }

        // Every aircraft has the calendar items; the club's trainer also
        // needs a 100-hour, and the 182 an oil change that's run over but
        // only warns.  None ground anything, so the fleet stays flyable.
        const isoDaysAgo = (days: number) =>
          daysAgo(days, 12).toISOString().slice(0, 10);
        const tach = readings.tach!;
        const items: {
          name: string;
          months?: number;
          days?: number;
          hours?: number;
          lastDaysAgo: number;
          lastReading?: number;
          // What it rules out once overdue; all flying unless given.
          grounding?: "all" | "ifr" | "none";
        }[] = [
          // Due within the month for the first aircraft.
          {
            name: "Annual inspection",
            months: 12,
            lastDaysAgo: plane.tailNumber === "N172FC" ? 340 : 120,
          },
          { name: "ELT inspection", months: 12, lastDaysAgo: 200 },
          {
            name: "Transponder and pitot-static",
            months: 24,
            lastDaysAgo: 400,
            grounding: "ifr",
          },
          // 30 days to the day; due within the week.
          { name: "VOR check", days: 30, lastDaysAgo: 25, grounding: "ifr" },
        ];
        if (plane.tailNumber === "N172FC") {
          // 6 hours left on the tach.
          items.push({
            name: "100-hour inspection",
            hours: 10000,
            lastDaysAgo: 60,
            lastReading: tach - 9400,
          });
        }
        if (plane.tailNumber === "N182FC") {
          items.push({
            name: "Oil change",
            months: 4,
            hours: 5000,
            lastDaysAgo: 50,
            lastReading: tach - 5300,
            grounding: "none",
          });
        }
        for (const item of items) {
          await tx`
            insert into maintenance_item (
              aircraft_id, name, kind, interval_months, interval_days,
              interval_hours, last_completed_on,
              last_completed_reading, grounding
            )
            values (
              ${aircraftId}, ${item.name},
              ${{ "VOR check": "vor_check", "Oil change": "oil_change" }[item.name] ?? "general"},
              ${item.months ?? null},
              ${item.days ?? null},
              ${item.hours === undefined ? null : toHours(item.hours)},
              ${isoDaysAgo(item.lastDaysAgo)},
              ${item.lastReading === undefined ? null : toHours(item.lastReading)},
              ${item.grounding ?? "all"}
            )
          `;
        }
      }

      // Everyone current but Lena, whose medical lapsed last month, and
      // checked out in everything but Tom in the Cub.
      const isoFromToday = (days: number) => {
        const date = new Date();
        date.setUTCDate(date.getUTCDate() + days);
        return date.toISOString().slice(0, 10);
      };
      for (const [i, memberId] of memberIds.entries()) {
        await tx`
          insert into pilot_qualification (
            member_id, medical_class, medical_expires_on, flight_review_on
          )
          values (
            ${memberId}, ${i === 0 ? "second" : "third"},
            ${isoFromToday(i === 4 ? -20 : 200 + i * 60)},
            ${isoFromToday(-100 - i * 90)}
          )
        `;
        for (const plane of fleet) {
          if (i === 3 && plane.tailNumber === "N3JFC") continue;
          await tx`
            insert into aircraft_checkout (
              member_id, aircraft_id, checked_out_on, recorded_by_id
            )
            values (
              ${memberId}, ${aircraftIds[plane.tailNumber]},
              ${isoFromToday(-400 - i * 30)}, ${officerId}
            )
          `;
        }
      }

      // One grounded aircraft, a deferred and an open nuisance squawk, and
      // a resolved one with its audit trail.
      const squawks = [
        {
          tail: "N281FC",
          description: "Left mag drop of 250 RPM on run-up, rough running.",
          category: "engine",
          grounding: "all",
          status: "open",
          daysAgo: 2,
        },
        {
          tail: "N172FC",
          description: "Left nav light intermittent.",
          category: "other",
          grounding: "none",
          status: "deferred",
          daysAgo: 20,
        },
        {
          tail: "N172FC",
          description: "Passenger door seal torn at the bottom corner.",
          category: "airframe",
          grounding: "none",
          status: "open",
          daysAgo: 6,
        },
        // Limits the 182 to VFR until it's fixed.
        {
          tail: "N182FC",
          description: "Attitude indicator precesses in turns.",
          category: "avionics",
          grounding: "ifr",
          status: "open",
          daysAgo: 3,
        },
      ];
      for (const s of squawks) {
        const at = daysAgo(s.daysAgo, 18);
        await tx`
          insert into squawk (
            aircraft_id, reported_by_id, reported_at, description, category,
            grounding, status, created_at, updated_at
          )
          values (
            ${aircraftIds[s.tail]}, ${pick(memberIds)}, ${at}, ${s.description},
            ${s.category}, ${s.grounding},
            ${s.status}, ${at}, ${at}
          )
        `;
      }

      const reportedAt = daysAgo(14, 17);
      const resolvedAt = daysAgo(12, 10);
      const [resolved] = await tx`
        insert into squawk (
          aircraft_id, reported_by_id, reported_at, description, category,
          grounding, status, resolved_by_id, resolved_at,
          resolution_note, created_at, updated_at
        )
        values (
          ${aircraftIds["N182FC"]}, ${memberIds[2]}, ${reportedAt},
          'Right main tire worn through to the cord.', 'airframe', 'all',
          'resolved', ${officerId}, ${resolvedAt},
          'Tire and tube replaced by the shop; returned to service.',
          ${reportedAt}, ${resolvedAt}
        )
        returning *
      `;
      await tx`
        insert into audit_log (
          actor_id, action, entity_type, entity_id, before, after, created_at
        )
        values (
          ${officerId}, 'squawk.resolve', 'squawk', ${resolved.id},
          ${sql.json({ status: "open" })},
          ${sql.json({
            status: "resolved",
            resolutionNote: resolved.resolution_note,
          })},
          ${resolvedAt}
        )
      `;
    });

    const [totals] = await sql`
      select
        (select count(*) from member)::int as members,
        (select count(*) from aircraft)::int as aircraft,
        (select count(*) from flight)::int as flights,
        (select count(*) from squawk)::int as squawks,
        (select count(*) from maintenance_item)::int as maintenance
    `;
    console.log(
      `Seeded ${totals.members} members, ${totals.aircraft} aircraft, ` +
        `${totals.flights} flights, ${totals.squawks} squawks and ` +
        `${totals.maintenance} maintenance items`,
    );
  }
} finally {
  await sql.end();
}
