"use client";

import { createClient } from "@/lib/supabase/client";

type Feedback={id:string;round_number:number;interviewer:string|null;interview_date:string|null;technical_rating:number|null;experience_rating:number|null;communication_rating:number|null;team_fit_rating:number|null;overall_rating:number|null;strengths:string|null;weaknesses:string|null;salary_comments:string|null;availability_comments:string|null;general_comments:string|null;outcome:string|null;submitted_at:string};

export default function FeedbackActions({feedback,candidate,client,role,onDeleted}:{feedback:Feedback;candidate:string;client:string;role:string;onDeleted:(id:string)=>void}){
 const supabase=createClient();
 function download(){
  const safe=(v:string)=>v.replace(/[^a-z0-9-_]+/gi,"-").replace(/^-+|-+$/g,"");
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>Interview Feedback</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#172536;line-height:1.5}h1{color:#0b2239}h2{margin-top:28px;border-bottom:2px solid #c89a4b;padding-bottom:6px}.meta{background:#f6f7f9;padding:16px;border-radius:10px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}small{color:#667085}</style></head><body><h1>Isitha Global - Interview Feedback</h1><div class="meta"><b>Candidate:</b> ${candidate}<br><b>Client:</b> ${client}<br><b>Role:</b> ${role}<br><b>Round:</b> ${feedback.round_number}<br><b>Interviewer:</b> ${feedback.interviewer||"-"}<br><b>Outcome:</b> ${(feedback.outcome||"submitted").replaceAll("_"," ")}<br><small>Submitted ${new Date(feedback.submitted_at).toLocaleString()}</small></div><h2>Ratings</h2><div class="grid"><div>Technical: ${feedback.technical_rating??"-"}/5</div><div>Experience: ${feedback.experience_rating??"-"}/5</div><div>Communication: ${feedback.communication_rating??"-"}/5</div><div>Team fit: ${feedback.team_fit_rating??"-"}/5</div><div>Overall: ${feedback.overall_rating??"-"}/5</div></div><h2>Strengths</h2><p>${feedback.strengths||"-"}</p><h2>Weaknesses / concerns</h2><p>${feedback.weaknesses||"-"}</p><h2>Salary comments</h2><p>${feedback.salary_comments||"-"}</p><h2>Availability</h2><p>${feedback.availability_comments||"-"}</p><h2>General comments</h2><p>${feedback.general_comments||"-"}</p></body></html>`;
  const blob=new Blob([html],{type:"text/html;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`${safe(candidate)||"candidate"}-interview-feedback-round-${feedback.round_number}.html`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
 }
 async function remove(){
  if(!window.confirm("Delete this interview feedback permanently? This will remove it from Supabase and the dashboard."))return;
  const{error}=await supabase.from("client_interview_feedback").delete().eq("id",feedback.id);
  if(error){window.alert(error.message);return}onDeleted(feedback.id);
 }
 return <div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={download} className="rounded-lg bg-[#0b2239] px-4 py-2 text-sm font-bold text-white">Download feedback</button><button type="button" onClick={remove} className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-700">Delete feedback</button></div>
}
