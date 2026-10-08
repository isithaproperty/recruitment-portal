export type InterviewCalendarEvent = {
  id: string;
  round: number;
  candidate: string;
  role: string;
  startsAt: string;
  location?: string | null;
  meetingLink?: string | null;
};

function text(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}
function stamp(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
function fold(line: string) {
  let result = "", length = 0;
  for (const char of line) {
    const bytes = new TextEncoder().encode(char).length;
    if (length + bytes > 75) { result += "\r\n "; length = 1; }
    result += char; length += bytes;
  }
  return result;
}
export function interviewCalendar(event: InterviewCalendarEvent) {
  const start = new Date(event.startsAt);
  if (!Number.isFinite(start.getTime())) throw new Error("Invalid interview date");
  if (!/^[a-zA-Z0-9-]+$/.test(event.id) || !Number.isInteger(event.round) || event.round < 1) throw new Error("Invalid interview identity");
  const description = ["Isitha Global Recruitment", `Round ${event.round} interview`, event.meetingLink ? `Join interview: ${event.meetingLink}` : "", "Calendar entry reserves 60 minutes. Adjust the duration if agreed with the recruiter.", "Reminder: 30 minutes before the interview."].filter(Boolean).join("\n");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Isitha Global//Recruitment Interviews//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${event.id}-round-${event.round}@recruitment.isitha.global`, `DTSTAMP:${stamp(start)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + 60 * 60 * 1000))}`,
    `SUMMARY:${text(`Interview: ${event.candidate} – ${event.role}`)}`, `DESCRIPTION:${text(description)}`, `LOCATION:${text(event.location || event.meetingLink || "To be confirmed")}`, "STATUS:CONFIRMED", "TRANSP:OPAQUE",
    "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", "DESCRIPTION:Interview reminder", "END:VALARM", "END:VEVENT", "END:VCALENDAR", ""].map(fold).join("\r\n");
}
