import { NextResponse } from "next/server";

type ScoreRequest = {
  applicationId?: string;
  job?: {
    title?: string | null;
    location?: string | null;
    job_description?: string | null;
    mandatory_requirements?: string | null;
    preferred_requirements?: string | null;
  };
  cvUrl?: string;
  fileName?: string;
};

function extractOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const output = (payload as { output?: unknown[] }).output;
  if (!Array.isArray(output)) return "";
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown[] }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const typed = part as { type?: string; text?: string };
      if (typed.type === "output_text" && typeof typed.text === "string") return typed.text;
    }
  }
  return "";
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!accessToken) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const openAiKey = process.env.OPENAI_API_KEY;
    if (!supabaseUrl || !publishableKey) return NextResponse.json({ error: "Recruitment database configuration is incomplete." }, { status: 500 });
    if (!openAiKey) return NextResponse.json({ error: "AI scoring is not configured yet. Add the OPENAI_API_KEY environment variable in Vercel." }, { status: 503 });

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!userResponse.ok) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

    const body = (await request.json()) as ScoreRequest;
    if (!body.applicationId || !body.cvUrl || !body.job?.title) return NextResponse.json({ error: "The candidate CV or job details are missing." }, { status: 400 });

    const cvResponse = await fetch(body.cvUrl, { cache: "no-store" });
    if (!cvResponse.ok) return NextResponse.json({ error: "The CV could not be opened for scoring." }, { status: 400 });
    const cvBlob = await cvResponse.blob();
    if (cvBlob.size > 10 * 1024 * 1024) return NextResponse.json({ error: "The CV is larger than 10 MB." }, { status: 400 });

    const uploadForm = new FormData();
    uploadForm.append("purpose", "user_data");
    uploadForm.append("file", new File([cvBlob], body.fileName || "candidate-cv", { type: cvBlob.type || "application/octet-stream" }));

    const fileResponse = await fetch("https://api.openai.com/v1/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}` },
      body: uploadForm,
    });
    if (!fileResponse.ok) return NextResponse.json({ error: "The CV could not be prepared for AI review." }, { status: 502 });
    const uploaded = (await fileResponse.json()) as { id: string };

    try {
      const criteria = [
        `Job title: ${body.job.title}`,
        `Location: ${body.job.location || "Not specified"}`,
        `Job description: ${body.job.job_description || "Not specified"}`,
        `Mandatory requirements: ${body.job.mandatory_requirements || "Not specified"}`,
        `Preferred requirements: ${body.job.preferred_requirements || "Not specified"}`,
      ].join("\n\n");

      const aiResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-5.6-luna",
          reasoning: { effort: "low" },
          input: [
            {
              role: "system",
              content: [{
                type: "input_text",
                text: "You are assisting a human recruiter. Assess only job-related evidence in the CV against the supplied criteria. Never use or infer age, gender, race, ethnicity, religion, disability, health, sexual orientation, marital/family status, nationality, photograph, home address, or any other protected or irrelevant personal characteristic. Do not make the final hiring decision. Return only valid JSON with exactly these keys: match_score (integer 0-100), strengths (concise string), weaknesses (concise string), rationale (concise string). Mandatory requirements should carry more weight than preferred requirements. Missing evidence is a weakness, not proof the candidate lacks the skill.",
              }],
            },
            {
              role: "user",
              content: [
                { type: "input_text", text: criteria },
                { type: "input_file", file_id: uploaded.id },
              ],
            },
          ],
        }),
      });
      if (!aiResponse.ok) return NextResponse.json({ error: "AI scoring could not be completed right now." }, { status: 502 });
      const payload = await aiResponse.json();
      const outputText = extractOutputText(payload).trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
      const result = JSON.parse(outputText) as { match_score?: number; strengths?: string; weaknesses?: string; rationale?: string };
      const score = Math.max(0, Math.min(100, Math.round(Number(result.match_score))));
      if (!Number.isFinite(score) || !result.strengths || !result.weaknesses) throw new Error("Invalid AI score response");

      const scoredAt = new Date().toISOString();
      const saveResponse = await fetch(`${supabaseUrl}/rest/v1/candidate_applications?id=eq.${encodeURIComponent(body.applicationId)}`, {
        method: "PATCH",
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          match_score: score,
          strengths: result.strengths,
          weaknesses: result.weaknesses,
          ai_rationale: result.rationale || null,
          ai_model: "gpt-5.6-luna",
          ai_scored_at: scoredAt,
        }),
        cache: "no-store",
      });
      if (!saveResponse.ok) return NextResponse.json({ error: "The AI score was created but could not be saved. Please try again." }, { status: 502 });

      return NextResponse.json({
        match_score: score,
        strengths: result.strengths,
        weaknesses: result.weaknesses,
        rationale: result.rationale || "",
        model: "gpt-5.6-luna",
        scored_at: scoredAt,
      });
    } finally {
      if (uploaded.id) {
        await fetch(`https://api.openai.com/v1/files/${encodeURIComponent(uploaded.id)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${openAiKey}` },
        }).catch(() => undefined);
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error(error);
    return NextResponse.json({ error: "The candidate could not be scored. Please try again." }, { status: 500 });
  }
}
