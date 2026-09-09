# Où retrouver la V1

La refonte V2 (2026-09-09) a tout remplacé. La V1 complète reste disponible ici :

| Quoi | Où |
|---|---|
| Code source complet V1 (front Vite, styles, assets) | tag git `v1-legacy` et branche `legacy-v1` |
| Les 22 Edge Functions telles que déployées (seule copie fidèle, le repo ne les versionnait pas) | dossier local `archive/edge-functions-deployed/` (hors git) et archive `~/Project/archives/leadControl-v1-2026-09-09.tar.gz` |
| Schéma et données V1 (tables, 2 783 conversations, 24 263 messages) | schéma `legacy` de la base Supabase de production, intact |
| Fonctions SQL, policies et crons V1 | tables `legacy._functions_v1_backup`, `legacy._policies_v1_backup`, `legacy._cron_v1_backup` |
| Palette et tokens visuels V1 | `docs/legacy/palette-v1.md` |
| Catalogue des fonctions V1 (rôles, routes, failles) | `docs/legacy/edge-functions-v1.md` |

Revenir en arrière tant que le schéma `legacy` existe : redéployer le front du tag
`v1-legacy`, redéployer les fonctions depuis `archive/edge-functions-deployed/`,
puis repasser les tables de `legacy` vers `public` (`alter table legacy.x set schema public`).

Repris à l'identique dans la V2 : la landing et les pages policy (`components/marketing/`),
la logique du pipeline Instagram (webhook, debounce 8 s, fenêtre 7 à 12 messages,
règles de crédits), le billing Stripe (produits et routes inchangés), la palette.
