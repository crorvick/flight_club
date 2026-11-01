import { ToastMessage } from "./toast";

// Shows a toast for each server render that asks for one.  Saving the
// same form twice redirects to the same URL, and React would otherwise
// keep the first toast's (dismissed) state; a fresh key makes each save
// its own toast.
export function Flash({
  message,
  param = "saved",
}: {
  message: string | false | undefined;
  // The query parameter that asked for it.
  param?: string;
}) {
  if (!message) return null;
  return (
    <ToastMessage key={crypto.randomUUID()} message={message} param={param} />
  );
}
