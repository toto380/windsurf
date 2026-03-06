# StratAds — Usage Guide

## Quick Start (1 command)

```bash
# Install dependencies
cd stratads && npm install

# Audit rapide (prospection)
node scripts/cli.js audit --site https://yoursite.com

# Audit technique complet
node scripts/cli.js audit --site https://yoursite.com --mode public-full

# Audit 360° (public + privé)
node scripts/cli.js audit \
  --site https://yoursite.com \
  --mode public-private \
  --inputs ./inputs/ \
  --ga4-property-id 123456789
```

## CLI Reference

```
node scripts/cli.js audit [options]

Options:
  --site <url>              URL du site à auditer (obligatoire)
  --mode <mode>             prospection | public-full | private | public-private
  --inputs <dir>            Dossier fichiers d'entrée (JSON service account, CSV)
  --output <dir>            Dossier de sortie (défaut: ./reports)
  --company <name>          Nom du client
  --lang <fr|en>            Langue du rapport
  --ga4-property-id <id>    GA4 Property ID
  --gsc-site-url <url>      Search Console URL
  --gtm-id <id>             GTM Container ID
  --service-account <file>  Chemin JSON service account
  --google-ads-csv <file>   Export Google Ads CSV
  --meta-ads-csv <file>     Export Meta Ads CSV/XLSX
```

## Structure inputs/ pour mode privé

```
inputs/
  service-account.json       # Clé service account Google (JSON)
  google-ads-export.csv      # Export Google Ads (campagnes, 30j)
  meta-ads-export.csv        # Export Meta Ads
```

Le service account doit avoir :
- **Viewer** sur la propriété GA4
- **Accès en lecture** sur Search Console
- **Viewer** dans GTM (optionnel)

## Application Electron (UI)

```bash
npm start
```

### 4 Modes UI

| Mode                | Données requises                        |
|---------------------|-----------------------------------------|
| Prospection         | URL uniquement                          |
| Audit Public Complet| URL uniquement                          |
| Private Only        | URL + service account JSON + GA4 ID + exports Ads |
| Public + Private    | Tout ci-dessus                          |

## Rapports générés

Les rapports HTML sont autonomes (CSS + données embarqués) :

- `[client]_prospection.html` — Rapport prospection (1-2 pages)
- `[client]_public_full.html` — Audit complet public
- `[client]_private_only.html` — Données privées (CONFIDENTIEL)
- `[client]_public_private.html` — Audit 360° (CONFIDENTIEL)

## Scripts de démo

```bash
# Générer rapports de démonstration (tous profils)
npm run report:sample

# Profils spécifiques
npm run report:sample:fast
npm run report:sample:public
npm run report:sample:private_only
npm run report:sample:full
```

## Politique Zero-Mockdata (sections PRIVATE)

En mode **PRIVATE** et **FULL (360°)**, le rapport n'affiche que des données réelles issues des APIs ou exports fournis (GA4, GSC, Google Ads, Meta Ads).

### Règle fondamentale

> **Jamais de données fictives, jamais de fallback inventé dans les sections PRIVATE.**

Si une source de données est indisponible, la section correspondante affiche **uniquement un message d'indisponibilité** :

```json
{
  "dataAvailable": false,
  "reason": "Données GA4 indisponibles — accès API (service account) ou export requis",
  "summary": ["⚠️ Données indisponibles"],
  "findings": [],
  "actions": [],
  "charts": [],
  "tables": []
}
```

### Ce qui est interdit

- Sessions fictives ou inventées
- Canaux d'acquisition hardcodés (`(direct)`, `Organic`, etc.)
- Scores ou pourcentages calculés sur données vides
- Tableaux avec lignes de fallback

### Comportement par source

| Source | Condition d'affichage | Si indisponible |
|--------|----------------------|-----------------|
| GA4 | `module.ok === true` ET données non vides | Message d'indisponibilité, `tables: []` |
| Google Ads | `module.ok === true` ET campagnes présentes | Message d'indisponibilité, `tables: []` |
| Meta Ads | `module.ok === true` ET campagnes présentes | Message d'indisponibilité, `tables: []` |

### Validation (`validateModuleData`)

La fonction `validateModuleData(module, requiredFields)` exportée depuis `report-assembler.js` effectue la validation stricte :

- `module` : objet brut du module (ex : `auditResults.modules.privateGoogle.ga4`)
- `requiredFields` : tableau de noms de champs qui doivent être des tableaux non vides (ex : `["rows"]`)

Retourne `{ isValid, data, reason }`. Si `isValid` est `false`, `reason` explique pourquoi.

```javascript
import { validateModuleData } from "./report-assembler.js";

// Exiger que le module soit ok:true ET que "rows" soit un tableau non vide
const result = validateModuleData(ga4Module, ["rows"]);
if (!result.isValid) {
  // Afficher le message d'indisponibilité — ne jamais injecter de données
  return { dataAvailable: false, reason: result.reason, tables: [], findings: [] };
}
```

