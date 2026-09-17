// Google exige une adresse de retour sur un domaine vérifié : celle-ci relaie la réponse
// telle quelle vers la fonction qui échange le code.
export function GET(request: Request) {
  const { search } = new URL(request.url)
  return Response.redirect(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/google-oauth/callback${search}`, 302)
}
