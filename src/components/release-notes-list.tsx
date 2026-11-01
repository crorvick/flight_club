import { formatDate } from "@/lib/dates";
import type { ReleaseNote } from "@/lib/release-notes";

// Releases, newest first, each a dated list of short bullets.
export function ReleaseNotesList({ notes }: { notes: ReleaseNote[] }) {
  return (
    <div className="flex flex-col gap-5">
      {notes.map((note) => (
        <section key={note.id} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {formatDate(note.date)}
          </h3>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm marker:text-primary">
            {note.highlights.map((h) => (
              <li key={h.text}>{h.text}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
