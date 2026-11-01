"use client";

import { cn } from "cn";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { FormError } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  CATEGORY_LABELS,
  MAX_PHOTOS,
  SQUAWK_CATEGORIES,
} from "@/lib/squawk-rules";

import type { ReportResult } from "./actions";
import { shrinkPhoto } from "./shrink-photo";

type Photo = { id: string; file: File; url: string };

// A radio styled as a big tappable card.  The input stays in the DOM (and
// the accessibility tree) but is visually hidden; the label is the target.
function Choice({
  name,
  value,
  label,
  defaultChecked,
  tone = "default",
  className,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked?: boolean;
  tone?: "default" | "warning" | "danger";
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center justify-center rounded-lg border px-3 text-center font-medium select-none has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
        {
          danger:
            "has-checked:border-destructive has-checked:bg-destructive has-checked:text-white",
          warning:
            "has-checked:border-amber-600 has-checked:bg-amber-600 has-checked:text-white",
          default:
            "has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground",
        }[tone],
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="sr-only"
      />
      {label}
    </label>
  );
}

export function SquawkForm({
  action,
  tailNumber,
}: {
  action: (formData: FormData) => Promise<ReportResult>;
  tailNumber: string;
}) {
  const router = useRouter();
  const [result, setResult] = useState<ReportResult>({});
  const [pending, startTransition] = useTransition();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [processing, setProcessing] = useState(false);
  const pickerRef = useRef<HTMLInputElement>(null);

  // Free the thumbnails' memory when leaving the page.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(
    () => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)),
    [],
  );

  async function addPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setProcessing(true);
    const room = MAX_PHOTOS - photos.length;
    const shrunk = await Promise.all(
      Array.from(files).slice(0, room).map(shrinkPhoto),
    );
    setPhotos((prev) => [
      ...prev,
      ...shrunk.map((file) => ({
        id: crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
      })),
    ]);
    setProcessing(false);
    // Lets the same photo be chosen again after removing it.
    if (pickerRef.current) pickerRef.current.value = "";
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  // Submitted by hand rather than through <form action>: React resets a
  // form after its action runs, which would clear the photos, and a
  // dropped connection would otherwise end in an error page.  Here
  // everything typed and attached stays put for a retry.
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    for (const photo of photos) formData.append("photos", photo.file);
    startTransition(async () => {
      try {
        const outcome = await action(formData);
        if (outcome.squawkId) {
          router.push(`/squawks/${outcome.squawkId}?reported=1`);
        } else {
          setResult(outcome);
        }
      } catch {
        setResult({
          error:
            "Couldn't reach the server. Check your connection and try again; nothing you entered was lost.",
        });
      }
    });
  }

  const errors = result.fieldErrors ?? {};

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <FormError message={result.error} />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-lg font-semibold">
          Does this ground the airplane?
        </legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <Choice
            name="grounding"
            value="all"
            label="Yes, grounded"
            tone="danger"
            className="h-14 text-lg"
          />
          <Choice
            name="grounding"
            value="ifr"
            label="No IFR, VFR only"
            tone="warning"
            className="h-14 text-lg"
          />
          <Choice
            name="grounding"
            value="none"
            label="No, still flyable"
            className="h-14 text-lg"
          />
        </div>
        {errors.grounding && (
          <p className="text-sm text-destructive">{errors.grounding[0]}</p>
        )}
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description" className="text-base">
          What&apos;s wrong?
        </Label>
        <textarea
          id="description"
          name="description"
          rows={3}
          aria-invalid={errors.description ? true : undefined}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30"
        />
        {errors.description && (
          <p className="text-sm text-destructive">{errors.description[0]}</p>
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">
          Category (optional)
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SQUAWK_CATEGORIES.map((category) => (
            <Choice
              key={category}
              name="category"
              value={category}
              label={CATEGORY_LABELS[category]}
              defaultChecked={category === "other"}
              className="h-11"
            />
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium">Photos (optional)</span>
        {photos.length > 0 && (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {photos.map((photo, i) => (
              <li key={photo.id} className="relative">
                {/* A local object URL; next/image has nothing to optimize. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={`Photo ${i + 1}`}
                  className="aspect-square w-full rounded-lg object-cover"
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="absolute top-1 right-1 size-11 text-lg"
                  aria-label={`Remove photo ${i + 1}`}
                  onClick={() => removePhoto(photo.id)}
                >
                  ×
                </Button>
              </li>
            ))}
          </ul>
        )}
        {photos.length < MAX_PHOTOS && (
          <label
            className={cn(
              "flex h-11 cursor-pointer items-center justify-center rounded-lg border border-dashed text-base font-medium has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
              processing && "opacity-50",
            )}
          >
            {/* Not capture="environment": that forces the camera, and a
                photo taken earlier on the walk-around is just as useful. */}
            <input
              ref={pickerRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={processing}
              onChange={(e) => addPhotos(e.target.files)}
            />
            {processing
              ? "Preparing photos…"
              : photos.length === 0
                ? "Add photos"
                : "Add more photos"}
          </label>
        )}
        {errors.photos && (
          <p className="text-sm text-destructive">{errors.photos[0]}</p>
        )}
      </div>

      <Button
        type="submit"
        className="h-12 text-base"
        disabled={pending || processing}
      >
        {pending ? "Reporting…" : `Report squawk on ${tailNumber}`}
      </Button>
    </form>
  );
}
