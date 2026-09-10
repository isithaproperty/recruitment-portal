"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setMessage(error.message); setLoading(false); return; }
    router.push("/"); router.refresh();
  }

  async function handleReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage("");
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setLoading(false);
    if (error) { setMessage(error.message); return; }
    setMessage("Password reset email sent. Check your inbox and follow the link to choose a new password.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-900">{resetMode ? "Reset password" : "Recruiter login"}</h1>
        <p className="mt-2 text-sm text-slate-500">{resetMode ? "Enter your email address and we'll send you a secure reset link." : "Sign in to manage jobs and candidates."}</p>
        <form onSubmit={resetMode ? handleReset : handleLogin} className="mt-8 space-y-5">
          <div><label className="mb-2 block text-sm font-semibold text-slate-700">Email address</label><input type="email" required value={email} onChange={(e)=>setEmail(e.target.value)} className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-slate-600" /></div>
          {!resetMode && <div><label className="mb-2 block text-sm font-semibold text-slate-700">Password</label><input type="password" required value={password} onChange={(e)=>setPassword(e.target.value)} className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-slate-600" /></div>}
          {message && <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">{message}</p>}
          <button type="submit" disabled={loading} className="w-full rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60">{loading ? "Please wait..." : resetMode ? "Send reset email" : "Sign in"}</button>
        </form>
        <button type="button" onClick={()=>{setResetMode(!resetMode);setMessage("")}} className="mt-5 w-full text-center text-sm font-semibold text-slate-700 underline">{resetMode ? "Back to sign in" : "Forgot password?"}</button>
      </div>
    </main>
  );
}
