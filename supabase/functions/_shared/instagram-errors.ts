// Sans import : partagé par les fonctions et les tests.

// Meta refuse un jeton mort (mot de passe changé, session révoquée, jeton expiré) par un 401,
// ou par un 400 portant le code OAuth 190. L'erreur vient de la connexion, pas du message :
// réessayer ne sert à rien tant que le compte n'est pas reconnecté.
export function isTokenRejected(error: unknown): boolean {
  const text = String(error)
  const status = /graph_[a-z_]+_(\d{3}):/.exec(text)?.[1]
  if (!status) return false
  if (status === '401') return true
  return status === '400' && /"code":\s*190\b/.test(text)
}
