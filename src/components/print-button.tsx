"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

// The browser's print dialog, where "Save as PDF" is one of the
// destinations; the print styles in globals.css lay the page out for it.
export function PrintButton() {
  return (
    <Button
      variant="outline"
      className="h-10 gap-1.5 px-4"
      onClick={() => window.print()}
    >
      <Printer aria-hidden />
      Save as PDF
    </Button>
  );
}
