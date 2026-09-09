import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false
  }
});
export async function getInstagramAccessTokenForConnector(userConnectorId) {
  const { data: tokenData, error: tokenError } = await supabase.schema("secrets").from("connectors_token").select("refresh_token,id_user_plateform").eq("id", userConnectorId).maybeSingle();
  if (tokenError) throw new Error(`Impossible de récupérer refresh_token: ${tokenError.message}`);
  const long_access_token = tokenData?.refresh_token ?? null;
  const id_user_plateform = tokenData?.id_user_plateform ?? null;
  return {
    long_access_token,
    id_user_plateform
  };
}
