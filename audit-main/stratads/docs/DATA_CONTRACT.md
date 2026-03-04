# StratAds — Data Contract

## Vue d'ensemble

Chaque module d'audit doit retourner un objet conforme au schéma défini dans `src/core/data-contract.json`.

## Schéma requis

```typescript
{
  module_id: string;          // Identifiant unique (snake_case)
  version: string;            // "x.y.z" (semver)
  inputs: object;             // Paramètres consommés
  observations: Array<{       // Observations brutes
    type: string;
    value: any;
    label?: string;
    source?: string;
  }>;
  evidence?: string[];        // Preuves textuelles (pas d'images)
  issues: Array<{             // Problèmes détectés
    id: string;
    title: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    description?: string;
    evidence?: string;
    confidence?: number;      // 0-1
    effort?: 'XS' | 'S' | 'M' | 'L' | 'XL';
    impact_euro?: number;
  }>;
  metrics: object;            // Métriques calculées
  score_contrib: {
    weight: number;           // 0-1 (poids dans le score global)
    score: number;            // 0-100
    skipped?: boolean;
  };
  recommendations: Array<{
    id: string;
    title: string;
    priority: 'now' | 'next' | 'later';
    effort?: string;
    impact?: string;
    details?: string;
  }>;
  artifacts?: string[];       // Fichiers produits
  ok?: boolean;
  skipped?: boolean;
  error?: string;
}
```

## Critères de scoring (8)

| Critère              | Poids | Description                          |
|----------------------|-------|--------------------------------------|
| `infrastructure`     | 15%   | GA4/GTM/CMP présence et configuration |
| `ga4`                | 15%   | Qualité tracking GA4                 |
| `ecommerce`          | 15%   | Funnel e-commerce complet            |
| `gtm`                | 10%   | Configuration GTM (tags/triggers)    |
| `server_side`        | 15%   | Container sGTM                       |
| `ads`                | 15%   | Attribution Ads et ROAS              |
| `data_quality`       | 10%   | Cohérence et qualité données         |
| `business_reliability` | 5%  | Performance, SEO, schema             |

## Sévérité des issues

| Sévérité  | Déduction score | Exemple                              |
|-----------|----------------|--------------------------------------|
| `critical`| -25 pts        | GA4 absent, ROAS < 0, 0 conversions  |
| `high`    | -15 pts        | Double comptage, pas de CMP          |
| `medium`  | -8 pts         | Tags sans trigger, data inconsistency|
| `low`     | -3 pts         | GTM noscript manquant                |
| `info`    | 0 pts          | Observation informationnelle         |

## Roadmap priorités

| Priorité | Délai   | Description                        |
|----------|---------|------------------------------------|
| `now`    | 7 jours  | Actions critiques urgentes         |
| `next`   | 30 jours | Optimisations importantes          |
| `later`  | 90 jours | Améliorations non urgentes         |

## Validation

```javascript
import { validateModuleOutput } from './src/core/quality-gate.js';

const result = validateModuleOutput(myModuleOutput);
// { valid: boolean, errors: string[], warnings: string[] }
```

## Exemple minimal

```javascript
export function myModule(params) {
  return {
    module_id: 'my_module',
    version: '1.0.0',
    ok: true,
    inputs: { url: params.url },
    observations: [{ type: 'detection', value: 'found', label: 'Widget detected' }],
    evidence: ['Widget script found at position 42'],
    issues: [],
    metrics: { detected: true },
    score_contrib: { weight: 0.10, score: 90 },
    recommendations: [],
  };
}
```
