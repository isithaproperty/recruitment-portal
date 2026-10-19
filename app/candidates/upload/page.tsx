import Link from "next/link";
import CandidateCvUpload from "@/components/candidate-cv-upload";

export default function ManualCandidateUpload() {
  return (
    <main className="min-h-screen bg-[#f4f6f8] text-[#172536]">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.12em] text-[#c89a4b]">
              Candidate intake
            </p>
            <h1 className="mt-2 text-3xl font-extrabold text-[#0b2239]">
              Upload an emailed CV
            </h1>
            <p className="mt-2 text-sm text-[#667085]">
              Upload the CV first and candidate details will be filled in
              automatically for you to check.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-[#aebbc7] bg-white px-4 py-2 text-sm font-bold"
          >
            Dashboard
          </Link>
        </div>
        <CandidateCvUpload />
      </div>
    </main>
  );
}
