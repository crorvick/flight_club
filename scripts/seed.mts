// Fill an empty database with sample members, aircraft, flights and
// squawks, for local development and staging:
//
//   node scripts/seed.mts
//
// Refuses to run if any aircraft exist, so it can't be pointed at a
// database with real records by mistake.  Like the other scripts it needs
// only postgres, so it also runs inside the image, e.g. from
// `doctl apps console <app-id> web` on staging.
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
          insert into aircraft (tail_number, make_model)
          values (${plane.tailNumber}, ${plane.makeModel})
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
          update aircraft set billing_meter_id = ${meterIds[plane.billing]}
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
              aircraft_id, pilot_id, date, day_landings, night_landings,
              notes, billing_meter_kind, billed_hours, created_at, updated_at
            )
            values (
              ${aircraftId}, ${pick(memberIds)},
              ${createdAt.toISOString().slice(0, 10)},
              ${night ? between(0, 1) : between(1, 4)},
              ${night ? between(1, 3) : 0},
              ${pick(notes)}, ${plane.billing},
              ${toHours(delta[plane.billing])}, ${createdAt}, ${createdAt}
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

          // Logging a flight locks the one before it.
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
      }

      // One grounded aircraft, a deferred and an open nuisance squawk, and
      // a resolved one with its audit trail.
      const squawks = [
        {
          tail: "N281FC",
          description: "Left mag drop of 250 RPM on run-up, rough running.",
          category: "engine",
          grounds: true,
          status: "open",
          daysAgo: 2,
        },
        {
          tail: "N172FC",
          description: "Left nav light intermittent.",
          category: "other",
          grounds: false,
          status: "deferred",
          daysAgo: 20,
        },
        {
          tail: "N172FC",
          description: "Passenger door seal torn at the bottom corner.",
          category: "airframe",
          grounds: false,
          status: "open",
          daysAgo: 6,
        },
      ];
      for (const s of squawks) {
        const at = daysAgo(s.daysAgo, 18);
        await tx`
          insert into squawk (
            aircraft_id, reported_by_id, reported_at, description, category,
            grounds, status, created_at, updated_at
          )
          values (
            ${aircraftIds[s.tail]}, ${pick(memberIds)}, ${at}, ${s.description},
            ${s.category}, ${s.grounds}, ${s.status}, ${at}, ${at}
          )
        `;
      }

      const reportedAt = daysAgo(14, 17);
      const resolvedAt = daysAgo(12, 10);
      const [resolved] = await tx`
        insert into squawk (
          aircraft_id, reported_by_id, reported_at, description, category,
          grounds, status, resolved_by_id, resolved_at, resolution_note,
          created_at, updated_at
        )
        values (
          ${aircraftIds["N182FC"]}, ${memberIds[2]}, ${reportedAt},
          'Right main tire worn through to the cord.', 'airframe', true,
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
        (select count(*) from squawk)::int as squawks
    `;
    console.log(
      `Seeded ${totals.members} members, ${totals.aircraft} aircraft, ` +
        `${totals.flights} flights and ${totals.squawks} squawks`,
    );
  }
} finally {
  await sql.end();
}
