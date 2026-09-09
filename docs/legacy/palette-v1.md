# Palette et tokens V1 (référence pour revenir à cet état visuel)

## Application (thème clair, repris tel quel en V2)

| Token V1 | Valeur | Usage |
|---|---|---|
| --app-bg | #F6F8FC | fond de page |
| --app-surface | #FFFFFF | cartes, panneaux |
| --app-border | #E6EBF2 | bordures |
| --app-text-primary | #0B1220 | texte principal |
| --app-text-secondary | #5B667A | texte secondaire |
| --app-primary | #2563EB | actions, liens |
| --app-primary-hover | #1D4ED8 | survol |
| --app-accent | #22D3EE | accent rare (10 % max) |
| --app-success | #16A34A | succès |
| --app-warning | #F59E0B | avertissement |
| --app-error | #EF4444 | erreur |
| --app-chip-bg | #EEF2FF | fond de chip |
| --app-chip-text | #3730A3 | texte de chip |

Rayons V1 : 4, 8, 10, 14, 20, 32 px. Ombres : `0 4px 10px 1px rgb(0 0 0 / .15)`.
Police V1 : Roboto (Google Fonts) + Material Icons. La V2 passe à Inter auto-hébergée.

## Landing (thème sombre, portée à l'identique en V2)

Les variables `--landing-*` vivent dans `components/marketing/landing-global.css`
(copie exacte des blocs `:global` de `src/styles/landing/Landing.module.css` V1).
Les CSS Modules de chaque section sont copiés au caractère près depuis
`src/styles/landing/` (tag `v1-legacy`).

## Images V1 non reprises

Les visuels générés par IA (CLARA-PP, GREG-PP, EMMA-PP, RICK-PP et leurs fonds,
0,6 à 1,3 Mo chacun) restent dans `public/` du tag `v1-legacy` et dans l'archive.
