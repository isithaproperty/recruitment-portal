import { NextResponse } from "next/server";

type RequestBody={cvUrl?:string;fileName?:string;candidateName?:string;jobTitle?:string|null};

function outputText(payload:unknown){
  if(!payload||typeof payload!=="object")return "";
  const output=(payload as {output?:unknown[]}).output;
  if(!Array.isArray(output))return "";
  for(const item of output){
    if(!item||typeof item!=="object")continue;
    const content=(item as {content?:unknown[]}).content;
    if(!Array.isArray(content))continue;
    for(const part of content){
      if(!part||typeof part!=="object")continue;
      const typed=part as {type?:string;text?:string};
      if(typed.type==="output_text"&&typeof typed.text==="string")return typed.text;
    }
  }
  return "";
}

export async function POST(request:Request){
  try{
    const authHeader=request.headers.get("authorization")||"";
    const accessToken=authHeader.startsWith("Bearer ")?authHeader.slice(7):"";
    if(!accessToken)return NextResponse.json({error:"Please sign in again."},{status:401});

    const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const openAiKey=process.env.OPENAI_API_KEY;
    if(!supabaseUrl||!publishableKey)return NextResponse.json({error:"Recruitment database configuration is incomplete."},{status:500});
    if(!openAiKey)return NextResponse.json({error:"CV redaction is not configured yet. Add the OPENAI_API_KEY environment variable in Vercel."},{status:503});

    const userResponse=await fetch(`${supabaseUrl}/auth/v1/user`,{headers:{apikey:publishableKey,Authorization:`Bearer ${accessToken}`},cache:"no-store"});
    if(!userResponse.ok)return NextResponse.json({error:"Please sign in again."},{status:401});

    const body=(await request.json()) as RequestBody;
    if(!body.cvUrl||!body.candidateName)return NextResponse.json({error:"The candidate CV is missing."},{status:400});

    const cvResponse=await fetch(body.cvUrl,{cache:"no-store"});
    if(!cvResponse.ok)return NextResponse.json({error:"The original CV could not be opened."},{status:400});
    const cvBlob=await cvResponse.blob();
    if(cvBlob.size>10*1024*1024)return NextResponse.json({error:"The CV is larger than 10 MB."},{status:400});

    const form=new FormData();
    form.append("purpose","user_data");
    form.append("file",new File([cvBlob],body.fileName||"candidate-cv",{type:cvBlob.type||"application/octet-stream"}));
    const upload=await fetch("https://api.openai.com/v1/files",{method:"POST",headers:{Authorization:`Bearer ${openAiKey}`},body:form});
    if(!upload.ok)return NextResponse.json({error:"The CV could not be prepared for redaction."},{status:502});
    const uploaded=(await upload.json()) as {id:string};

    try{
      const response=await fetch("https://api.openai.com/v1/responses",{
        method:"POST",
        headers:{Authorization:`Bearer ${openAiKey}`,"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"gpt-5.6-luna",
          reasoning:{effort:"low"},
          input:[
            {role:"system",content:[{type:"input_text",text:"You prepare client CVs for Isitha Recruitment. This is a REDACTION task, not a rewriting, summarising, scoring or enhancement task. Keep the candidate's original CV content, wording, chronology, section order, job titles, employment history, qualifications, skills, achievements and project details as written. Do not add recruiter comments, AI comments, recommendations, summaries, inferred skills, rewritten profiles, improved wording, or facts that do not appear in the source CV. Remove only personal or sensitive identifying information that should not be sent to a client: personal email addresses, personal phone/mobile numbers, street/home/postal addresses, ID/passport numbers, dates of birth/age, marital/family details, photographs, and personal social-media handles. Keep the candidate name. Keep professional portfolio or work links only when they are clearly relevant to the candidate's work. Return valid JSON only with exactly these string keys: recruiter_summary, professional_profile, skills, qualifications, experience, projects, additional_information. recruiter_summary MUST always be an empty string. Populate the remaining fields only with content actually present in the source CV, preserving the source wording and order as closely as possible. If the source has no content for a field, return an empty string. Do not mention that AI was used and do not add any commentary."}]},
            {role:"user",content:[{type:"input_text",text:`Candidate: ${body.candidateName}\nTarget role: ${body.jobTitle||"Not specified"}\nInstruction: redact personal information only; otherwise preserve the source CV.`},{type:"input_file",file_id:uploaded.id}]}
          ]
        })
      });
      if(!response.ok)return NextResponse.json({error:"The CV could not be redacted right now."},{status:502});
      const payload=await response.json();
      const text=outputText(payload).trim().replace(/^```json\s*/i,"").replace(/```$/i,"").trim();
      const result=JSON.parse(text) as Record<string,string>;
      result.recruiter_summary="";
      return NextResponse.json(result);
    }finally{
      await fetch(`https://api.openai.com/v1/files/${encodeURIComponent(uploaded.id)}`,{method:"DELETE",headers:{Authorization:`Bearer ${openAiKey}`}}).catch(()=>undefined);
    }
  }catch(error){
    if(process.env.NODE_ENV!=="production")console.error(error);
    return NextResponse.json({error:"The CV could not be redacted. Please try again."},{status:500});
  }
}
