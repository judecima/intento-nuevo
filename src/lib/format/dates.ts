const ARGENTINA_OFFSET_MINUTES = -180;

export function formatDateOnlyEsAr(value: string | null | undefined): string {
  if (!value) return "";

  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return `${Number(day)}/${Number(month)}/${year.slice(2)}`;
  }

  const parts = argentinaParts(value);
  return parts ? `${parts.day}/${parts.month}/${parts.year}` : "";
}

export function formatDateTimeEsAr(value: string | null | undefined): string {
  const parts = argentinaParts(value);
  if (!parts) return "Pendiente";

  return `${parts.day}/${parts.month}/${parts.year}, ${parts.hour12}:${parts.minute} ${parts.period}`;
}

function argentinaParts(value: string | null | undefined) {
  if (!value) return null;

  const source = new Date(value);
  if (Number.isNaN(source.getTime())) return null;

  const shifted = new Date(source.getTime() + ARGENTINA_OFFSET_MINUTES * 60_000);
  const fullYear = shifted.getUTCFullYear();
  const hour24 = shifted.getUTCHours();
  const hour12 = hour24 % 12 || 12;

  return {
    day: shifted.getUTCDate(),
    month: shifted.getUTCMonth() + 1,
    year: String(fullYear).slice(2),
    hour12,
    minute: String(shifted.getUTCMinutes()).padStart(2, "0"),
    period: hour24 < 12 ? "a. m." : "p. m."
  };
}
