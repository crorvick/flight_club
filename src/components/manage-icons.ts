import { FileText, type LucideIcon, Plane, Users } from "lucide-react";

import type { ManageLink } from "@/lib/manage";

// Icons for the Manage menu's links, which come from the server by name.
export const MANAGE_ICONS: Record<ManageLink["icon"], LucideIcon> = {
  aircraft: Plane,
  members: Users,
  reports: FileText,
};
