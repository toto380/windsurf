# StratAds — Architecture (Option C)

## Vue d'ensemble

StratAds est une application Electron d'audit web premium qui génère des **rapports HTML style cabinet Big4**, centrés sur l'audit tracking (GA4/GTM/Ads/Consent) et l'impact business.

```
stratads/
├── src/
│   ├── core/                     # Data contract + Quality Gate + Scoring Engine
│   │   ├── data-contract.json    # Schéma JSON pour validation modules
│   │   ├── quality-gate.js       # Validation, cohérence, déduplication
│   │   └── scoring-engine.js     # Score 100 — 8 critères pondérés
│   ├── engine/
│   │   ├── orchestrator.js       # Pipeline unifiée (4 modes)
│   │   └── modules/
│   │       ├── tracking-infrastructure.js  # GA4/GTM/CMP/sGTM détection
│   │       ├── ga4-audit.js                # Événements, e-commerce, cohérence
│   │       ├── gtm-web-audit.js            # Tags, triggers, variables, dataLayer
│   │       ├── server-side-audit.js        # Container sGTM, enrichissement
│   │       ├── ads-audit.js                # Pixels, mapping, déduplication, ROAS
│   │       ├── data-quality.js             # Self-referrals, duplications, distribution
│   │       ├── tracking-lite.js            # Détection légère (public)
│   │       └── ...                         # Autres modules existants
│   ├── main/
│   │   ├── report-gen-html.js    # Générateur HTML (4 profils, HTML uniquement)
│   │   └── ...
│   └── renderer/
│       ├── index.html            # UI 4 modes
│       └── renderer.js           # Logique renderer + branchSelect fix
├── test/
│   ├── data-contract.test.js
│   ├── quality-gate.test.js
│   ├── scoring-engine.test.js
│   ├── tracking-infrastructure.test.js
│   └── report-gen-html.test.js
├── fixtures/
│   ├── audit-sample.json         # Audit public complet (démo)
│   ├── ga4-sample.json           # Données GA4 privées (démo)
│   └── ads-sample.csv            # Données Google Ads (démo)
├── scripts/
│   └── cli.js                    # CLI stratads audit --site ... --mode ...
└── docs/
    ├── ARCHITECTURE.md           # Ce fichier
    ├── DATA_CONTRACT.md          # Spécification du data contract
    ├── USAGE.md                  # Guide d'utilisation
    └── DEVELOPMENT.md            # Guide développeur
```

## 4 Modes d'audit

| Mode           | Description                         | Rapport       | Privé requis |
|----------------|-------------------------------------|---------------|--------------|
| `prospection`  | Mini audit public rapide (1-2 pages)| HTML compact  | ❌           |
| `public_full`  | Audit technique complet (7-8 sections) | HTML premium | ❌          |
| `private_only` | Focus données privées (GA4/Ads)     | HTML confidentiel | ✅        |
| `public_private` | Fusion 360° public + privé        | HTML 360° | ✅           |

## Scoring Engine (8 critères)

| Critère              | Poids | Module source                  |
|----------------------|-------|-------------------------------|
| Infrastructure       | 15%   | tracking-infrastructure        |
| GA4                  | 15%   | ga4-audit, tracking             |
| E-commerce           | 15%   | ga4-audit, data-quality         |
| GTM                  | 10%   | gtm-web-audit, gtm-api          |
| Server-side          | 15%   | server-side-audit               |
| Ads                  | 15%   | ads-audit, ads-intelligence     |
| Data Quality         | 10%   | data-quality                    |
| Business Reliability |  5%   | lighthouse, seo, schema         |

## Data Contract

Chaque module retourne un objet conforme à `src/core/data-contract.json` :

```json
{
  "module_id": "string",
  "version": "x.y.z",
  "inputs": {},
  "observations": [],
  "evidence": [],
  "issues": [{ "id", "title", "severity", "confidence", "effort" }],
  "metrics": {},
  "score_contrib": { "weight": 0.15, "score": 80 },
  "recommendations": [{ "id", "title", "priority", "effort", "impact" }]
}
```

## Pipeline Orchestrateur

```
params (URL, mode, reportModules, privateAccess)
  ↓
Quality Gate (checkPrivatePreconditions)
  ↓
Public modules (DNS, headers, robots, SEO, schema, techstack, tracking)
  + Tracking Infrastructure (GA4/GTM/CMP détection)
  + Server-side audit
  ↓
Private modules (if enabled):
  + Google API (GA4, GSC, GTM)
  + Ads imports (Google, Meta)
  ↓
Synthesis modules:
  + GA4 Audit (données privées)
  + GTM Web Audit
  + Ads Audit (ROAS, déduplication)
  + Data Quality (self-referrals, duplications)
  ↓
Scoring Engine (8 critères → score global /100)
  ↓
HTML Report Generator (4 templates)
```

## Contraintes

1. **HTML uniquement** : pas de PDF, pas de PPTX pour les nouveaux rapports
2. **Data contract** : chaque module conforme au schéma JSON
3. **Déterministe** : reproductible, testable unitairement
4. **Private policy** : jamais OAuth, upload JSON uniquement. Secrets sanitisés.
5. **Quality gate** : refuse si données privées demandées mais manquantes
