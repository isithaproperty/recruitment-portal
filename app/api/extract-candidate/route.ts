import { NextResponse } from "next/server";

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
    if(!openAiKey)return NextResponse.json({error:"CV reading is not configured yet."},{status:503});

    const userResponse=await fetch(`${supabaseUrl}/auth/v1/user`,{headers:{apikey:publishableKey,Authorization:`Bearer ${accessToken}`},cache:"no-store"});
    if(!userResponse.ok)return NextResponse.json({error:"Please sign in again."},{status:401});

    const formData=await request.formData();
    const file=formData.get("cv");
    if(!(file instanceof File)||!file.size)return NextResponse.json({error:"Attach a CV first."},{status:400});
    const allowed=["application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if(!allowed.includes(file.type)||file.size>10*1024*1024)return NextResponse.json({error:"CV must be PDF, DOC or DOCX and 10 MB or smaller."},{status:400});

    const uploadForm=new FormData();
    uploadForm.append("purpose","user_data");
    uploadForm.append("file",file);
    const upload=await fetch("https://api.openai.com/v1/files",{method:"POST",headers:{Authorization:`Bearer ${openAiKey}`},body:uploadForm});
    if(!upload.ok)return NextResponse.json({error:"The CV could not be read."},{status:502});
    const uploaded=(await upload.json()) as {id:string};

    try{
      const response=await fetch("https://api.openai.com/v1/responses",{
        method:"POST",
        headers:{Authorization:`Bearer ${openAiKey}`,"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"gpt-5.6-luna",
          reasoning:{effort:"low"},
          input:[
            {role:"system",content:[{type:"input_text",text:"Extract only the candidate's explicitly stated contact details from the CV. Return valid JSON only with exactly these string keys: candidate_name, email, phone, location. Do not infer, guess or manufacture any value. For location, use the candidate's own current/home location if explicitly stated, not an employer, project or university location. If a value is not stated, return an empty string."}]},
            {role:"user",content:[{type:"input_file",file_id:uploaded.id}]}
          ]
        })
      });
      if(!response.ok)return NextResponse.json({error:"The CV details could not be extracted right now."},{status:502});
      const payload=await response.json();
      const text=outputText(payload).trim().replace(/^```json\s*/i,"").replace(/```$/i,"").trim();
      const parsed=JSON.parse(text) as Record<string,unknown>;
      return NextResponse.json({
        candidate_name:typeof parsed.candidate_name==="string"?parsed.candidate_name.trim():"",
        email:typeof parsed.email==="string"?parsed.email.trim():"",
        phone:typeof parsed.phone==="string"?parsed.phone.trim():"",
        location:typeof parsed.location==="string"?parsed.location.trim():""
      });
    }finally{
      await fetch(`https://api.openai.com/v1/files/${encodeURIComponent(uploaded.id)}`,{method:"DELETE",headers:{Authorization:`Bearer ${openAiKey}`}}).catch(()=>undefined);
    }
  }catch(error){
    if(process.env.NODE_ENV!=="production")console.error(error);
    return NextResponse.json({error:"The CV could not be read. Please enter the details manually."},{status:500});
  }
}
