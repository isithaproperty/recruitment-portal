"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage(){
 const router=useRouter();
 const supabase=createClient();
 const[password,setPassword]=useState("");
 const[confirm,setConfirm]=useState("");
 const[message,setMessage]=useState("");
 const[loading,setLoading]=useState(false);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setMessage("");
  if(password.length<8){setMessage("Please use at least 8 characters.");return;}
  if(password!==confirm){setMessage("Passwords do not match.");return;}
  setLoading(true);
  const{error}=await supabase.auth.updateUser({password});
  setLoading(false);
  if(error){setMessage(error.message);return;}
  setMessage("Password updated successfully. Redirecting to the portal...");
  setTimeout(()=>{router.push("/");router.refresh()},1200);
 }
 return <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6"><div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm"><h1 className="text-3xl font-bold text-slate-900">Choose a new password</h1><p className="mt-2 text-sm text-slate-500">Enter and confirm your new recruitment portal password.</p><form onSubmit={submit} className="mt-8 space-y-5"><div><label className="mb-2 block text-sm font-semibold text-slate-700">New password</label><input type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-lg border border-slate-300 px-4 py-3"/></div><div><label className="mb-2 block text-sm font-semibold text-slate-700">Confirm new password</label><input type="password" required minLength={8} value={confirm} onChange={e=>setConfirm(e.target.value)} className="w-full rounded-lg border border-slate-300 px-4 py-3"/></div>{message&&<p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">{message}</p>}<button disabled={loading} className="w-full rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{loading?"Updating...":"Update password"}</button></form></div></main>;
}
