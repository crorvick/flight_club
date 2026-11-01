import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { aircraft } from "@/db/schema";
import { getCheckouts, getQualifications } from "@/lib/pilots";
import { flightReviewExpires } from "@/lib/qualifications";

import { addCheckout, removeCheckout, updateQualifications } from "./actions";
import {
  CheckoutForm,
  QualificationsForm,
  RemoveCheckout,
} from "./qualifications-forms";

// A member's medical, flight review and checkouts, shown on their own
// qualifications page and, for officers, on the member's page.
// Only officers can record or remove checkouts.
export async function QualificationsPanel({
  memberId,
  canManageCheckouts,
}: {
  memberId: string;
  canManageCheckouts: boolean;
}) {
  const [qualifications, checkouts, fleet] = await Promise.all([
    getQualifications(memberId),
    getCheckouts(memberId),
    canManageCheckouts
      ? db()
          .select({ id: aircraft.id, tailNumber: aircraft.tailNumber })
          .from(aircraft)
          .where(eq(aircraft.active, true))
          .orderBy(asc(aircraft.tailNumber))
      : Promise.resolve([]),
  ]);

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Medical and flight review</h2>
        {qualifications.flightReviewOn && (
          <p className="text-sm text-muted-foreground">
            Flight review good through{" "}
            {flightReviewExpires(qualifications.flightReviewOn)}.
          </p>
        )}
        <QualificationsForm
          key={`${qualifications.medicalClass}-${qualifications.medicalExpiresOn}-${qualifications.flightReviewOn}`}
          action={updateQualifications.bind(null, memberId)}
          initial={qualifications}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Aircraft checkouts</h2>
        {checkouts.length === 0 ? (
          <p className="text-muted-foreground">None recorded.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {checkouts.map((c) => (
              <li
                key={c.aircraftId}
                className="flex min-h-12 items-center justify-between gap-3 px-3 py-1"
              >
                <span>
                  <span className="font-medium">{c.tailNumber}</span>{" "}
                  <span className="text-sm text-muted-foreground">
                    since {c.checkedOutOn}
                  </span>
                </span>
                {canManageCheckouts && (
                  <RemoveCheckout
                    action={removeCheckout.bind(null, memberId, c.aircraftId)}
                    tailNumber={c.tailNumber}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {canManageCheckouts && (
          <CheckoutForm
            key={checkouts.length}
            action={addCheckout.bind(null, memberId)}
            fleet={fleet}
          />
        )}
      </section>
    </>
  );
}
