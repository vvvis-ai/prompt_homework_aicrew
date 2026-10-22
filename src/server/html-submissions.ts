import { getSupabaseAdmin, isDemoMode } from "./supabase";

export async function getHtmlSubmission(id: string) {
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1 || isDemoMode()) return null;
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("submissions")
    .select("id,participant_id,title,description,submitted_at,html_file_name,html_content")
    .eq("id", Number(id)).maybeSingle();
  if (error) throw error;
  if (!data?.html_file_name || !data.html_content) return null;
  return data;
}
