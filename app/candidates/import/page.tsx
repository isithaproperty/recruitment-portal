import Link from "next/link";
import BulkCvImport from "@/components/bulk-cv-import";

export default function BulkImportPage() {
  return (
    <main className="min-h-screen bg-[#f4f6f8] text-[#172536]">
      <div className="mx-auto max-w-4xl px-5 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#a88436]">
              Candidate intake
            </p>
            <h1 className="mt-2 text-3xl font-extrabold">
              Import LinkedIn CVs
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Choose one role and start automatic candidate import and scoring.
              Only exceptions need attention.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-lg border bg-white px-4 py-2 font-bold"
          >
            Dashboard
          </Link>
        </div>
        <BulkCvImport />
      </div>
    </main>
  );
}
