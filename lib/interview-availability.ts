export type InterviewAvailability = { round: number; timezone: string; slots: { date: string; period: "AM" | "PM" | "time"; time?: string }[] };

export function availabilityLabel(slot: InterviewAvailability["slots"][number]) {
  const date = new Date(`${slot.date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  if (slot.period !== "time") return `${date} · ${slot.period}`;
  const [hour, minute] = (slot.time || "00:00").split(":").map(Number);
  return `${date} · ${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}
