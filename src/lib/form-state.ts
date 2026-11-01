// What a form shows after a failed submit.  `values` echoes back what was
// typed (never a password) so a member on a bad connection doesn't have
// to type it all again.
export type FormState = {
  error?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
  values?: Record<string, string>;
};

export function formValues(formData: FormData, keys: string[]) {
  return Object.fromEntries(
    keys.map((k) => [k, String(formData.get(k) ?? "")]),
  );
}
