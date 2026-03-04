# StratAds — Development Guide

## Setup

```bash
cd stratads
npm install
```

## Tests

```bash
npm test
```

Tests couvrent :
- `data-contract.test.js` — Schéma JSON data contract
- `quality-gate.test.js` — Validation modules, préconditions privées
- `scoring-engine.test.js` — Score 8 critères
- `tracking-infrastructure.test.js` — Modules GA4/GTM/Ads/DataQuality
- `report-gen-html.test.js` — Génération HTML 4 modes
- `metrics-calculator.test.js` — Métriques Ads
- `ads-intelligence.test.js` — Intelligence Ads
- `report-profiles.test.js` — 4 profils rapport (fast, public, private_only, full)
- `premium-sections.test.js` — Sections dashboard privé

## Lancement app Electron

```bash
npm start
```

## CLI

```bash
node scripts/cli.js audit --help
node scripts/cli.js audit --site https://example.com --mode prospection
```

## Ajouter un module

1. Créer `src/engine/modules/my-module.js`
2. Retourner un objet conforme au data contract (`src/core/data-contract.json`)
3. Valider avec `validateModuleOutput()` dans `src/core/quality-gate.js`
4. Ajouter dans `CRITERION_MODULE_MAP` dans `src/core/scoring-engine.js`
5. Intégrer dans `src/engine/orchestrator.js`
6. Écrire les tests dans `test/`

### Structure minimale d'un module

```javascript
export async function myModule(params) {
  return {
    module_id: 'my_module',
    version: '1.0.0',
    ok: true,
    inputs: { url: params.url },
    observations: [],
    evidence: [],
    issues: [],
    metrics: {},
    score_contrib: { weight: 0.10, score: 80 },
    recommendations: [],
  };
}
```

## Architecture décisions

### HTML uniquement (pas de PDF)
Les rapports sont en HTML uniquement (autonomes, CSS embarqué).
Pas de génération PDF ni PPTX.

### Data Contract
Tous les nouveaux modules DOIVENT retourner un objet avec `module_id`.
Les modules legacy (sans `module_id`) sont acceptés pour compat.

### Scoring Engine
Score normalisé : si un module est skipped, son poids est redistribué.
Résultat = average pondéré des critères actifs seulement.

### Private Policy
- Jamais OAuth — upload JSON uniquement
- Secrets détectés par quality-gate (PRIVATE_PATTERNS)
- Mode private refuse proprement si données manquantes

## Variables d'environnement

Aucune variable requise. Tout passe par params.
