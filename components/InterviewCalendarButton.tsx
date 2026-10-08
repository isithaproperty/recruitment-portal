"use client";

import { interviewCalendar, type InterviewCalendarEvent } from "@/lib/interview-calendar";

export default function InterviewCalendarButton({ event }: { event: InterviewCalendarEvent }) {
  function download() {
    const url = URL.createObjectURL(new Blob([interviewCalendar(event)], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = "interview.ics"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="mt-4"><button type="button" onClick={download} className="rounded-lg border border-[#c89a4b] bg-white px-4 py-2 font-bold text-[#0b2239]">Add to Outlook calendar</button><p className="mt-2 text-xs text-[#667085]">Open the downloaded calendar file in Outlook and save it. Includes a 30-minute reminder and a 60-minute slot; you can adjust these in Outlook.</p></div>;
}
