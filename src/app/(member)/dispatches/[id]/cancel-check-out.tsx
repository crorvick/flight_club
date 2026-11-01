"use client";

import { useActionState } from "react";

import { FormError } from "@/components/field";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/form-state";

// Cancelling throws the check-out away, so it's a quiet link well clear
// of "Check in", and asks before it does anything.
export function CancelCheckOut({
  action,
  tailNumber,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  tailNumber: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  return (
    <div className="flex justify-center">
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              variant="ghost"
              className="h-11 text-base text-muted-foreground"
            />
          }
        >
          Didn&apos;t fly? Cancel check-out
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this check-out?</AlertDialogTitle>
            <AlertDialogDescription>
              No flight will be recorded, and {tailNumber} will be free for
              someone else to check out.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form action={formAction} className="flex flex-col gap-4">
            <FormError message={state.error} />
            <AlertDialogFooter>
              <AlertDialogCancel className="h-11">Keep it</AlertDialogCancel>
              <Button
                type="submit"
                variant="destructive"
                className="h-11"
                disabled={pending}
              >
                {pending ? "Cancelling…" : "Cancel check-out"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
