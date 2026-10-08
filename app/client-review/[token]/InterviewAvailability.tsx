"use client";

import { useState } from "react";
import { availabilityLabel, type InterviewAvailability } from "@/lib/interview-availability";

export default function AvailabilityEditor({ round, initial, busy, onSave }: { round: number; initial?: InterviewAvailability | null; busy: boolean; onSave: (value: InterviewAvailability) => Promise<boolean> }) {
  const saved = initial?.round === round ? initial : null;
  const [timezone, setTimezone] = useState(saved?.timezone || "Europe/London");
  const [slots, setSlots] = useState<InterviewAvailability["slots"]>(saved?.slots || []);
  const [date, setDate] = useState("");
  const [period, setPeriod] = useState<"AM" | "PM" | "time">("AM");
  const [time, setTime] = useState("");
  const [message, setMessage] = useState("");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  function add() {
    setMessage("");
    if (!date || date < today || (period === "time" && !time)) return setMessage("Choose a current or future date and a time option.");
    const slot = { date, period, ...(period === "time" ? { time } : {}) };
    if (slots.some(s => s.date === date && s.period === period && s.time === slot.time)) return setMessage("That option is already added.");
    setSlots(current => [...current, slot].sort((a, b) => a.date.localeCompare(b.date)));
  }
  async function save() {
    setMessage("");
    if (!slots.length) return setMessage("Add at least one available date and time.");
    if (slots.some(s => s.date < today)) return setMessage("Remove past dates before saving.");
    if (await onSave({ round, timezone, slots })) setMessage("Availability saved. Isitha will confirm the booking.");
  }
  return <details className="mt-4 rounded-xl border border-[#c89a4b]/40 bg-white">
    <summary className="cursor-pointer px-4 py-3 font-bold">Interview availability · {saved?.slots.length || 0} saved options</summary>
    <div className="space-y-4 border-t p-4">
      <p className="text-sm text-[#667085]">Add several convenient dates with AM, PM or specific times. These are your preferences; Isitha will confirm the interview.</p>
      <label className="block text-sm font-semibold">Timezone<select disabled={busy} value={timezone} onChange={e => setTimezone(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="Europe/London">UK (London, adjusts for daylight saving)</option><option value="Africa/Johannesburg">South Africa (SAST)</option><option value="UTC">UTC</option>{!["Europe/London", "Africa/Johannesburg", "UTC"].includes(timezone) && <option value={timezone}>{timezone}</option>}</select></label>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-sm font-semibold">Date<input disabled={busy} type="date" min={today} value={date} onChange={e => setDate(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
        <label className="text-sm font-semibold">Time preference<select disabled={busy} value={period} onChange={e => setPeriod(e.target.value as typeof period)} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="AM">AM (morning)</option><option value="PM">PM (afternoon)</option><option value="time">Specific time</option></select></label>
        {period === "time" && <label className="text-sm font-semibold">Time<input disabled={busy} type="time" value={time} onChange={e => setTime(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>}
        <button type="button" disabled={busy || slots.length >= 20} onClick={add} className="self-end rounded-lg border px-4 py-2 font-bold">Add option</button>
      </div>
      <ul className="space-y-2">{slots.map((slot, i) => <li key={`${slot.date}-${slot.period}-${slot.time || ""}`} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm"><span>{availabilityLabel(slot)}</span><button type="button" disabled={busy} aria-label={`Remove ${availabilityLabel(slot)}`} onClick={() => setSlots(current => current.filter((_, index) => index !== i))} className="font-bold underline">Remove</button></li>)}</ul>
      {message && <p role="status" className="text-sm font-semibold">{message}</p>}
      <button type="button" disabled={busy || !slots.length} onClick={() => void save()} className="rounded-lg bg-[#0b2239] px-5 py-3 font-bold text-white">{busy ? "Saving…" : "Save availability & request interview"}</button>
    </div>
  </details>;
}
