import { createHash } from "node:crypto";

const MAX_LOCAL_PART_LENGTH = 64;

export function organizationAuthEmail(email: string, organizationId: string): string {
  const normalizedEmail = email.trim().toLowerCase();
  const at = normalizedEmail.lastIndexOf("@");
  if (at <= 0 || at === normalizedEmail.length - 1) return normalizedEmail;

  const local = normalizedEmail.slice(0, at);
  const domain = normalizedEmail.slice(at + 1);
  const organizationKey = organizationId.replace(/-/g, "").slice(0, 12);
  const suffix = `+org-${organizationKey}`;
  const directLocal = `${local}${suffix}`;

  if (directLocal.length <= MAX_LOCAL_PART_LENGTH) {
    return `${directLocal}@${domain}`;
  }

  const hash = createHash("sha256").update(normalizedEmail).digest("hex").slice(0, 18);
  return `tenant-${hash}+${organizationKey}@${domain}`;
}
