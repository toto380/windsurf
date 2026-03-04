# 🚀 STRATADS AUDIT V2 - Architecture Business-Oriented

## 📊 Nouvelle Structure Commerciale

### 🎯 Objectif Principal
**"Pourquoi l'entreprise ne génère pas plus de revenus avec sa publicité ?"**

Chaque audit répond à cette question centrale avec des KPI business clairs et des recommandations actionnables.

---

## 💰 Pricing & Positionnement

| Type d'Audit | Prix | Durée | Cible |
|---------------|------|--------|--------|
| **Fast Audit** | Gratuit | 2min | Prospection |
| **Public Complet** | 2500€ | 15min | CEO/Marketing |
| **Private Audit** | 5000€ | 30min | e-commerce Manager |
| **Full Audit** | 7500€ | 45min | Premium Clients |

---

## 🏗️ Architecture Technique

### 📁 Fichiers Principaux

```
src/
├── engine/
│   ├── stratads-engine.js      # Moteur d'audit business
│   ├── stratads-orchestrator.js # Orchestrateur des audits
│   └── kpi-calculator.js      # Calcul KPI essentiels
├── main/
│   ├── stratads-report-generator.js # Génération rapports HTML
│   └── stratads-charts.js        # Graphiques business
scripts/
└── stratads-cli.js              # Interface CLI commerciale
```

### 🔧 Composants Clés

#### 1. **StratadsEngine** (`src/engine/stratads-engine.js`)
- Analyse rapide 2min (Fast Audit)
- Détection tracking pixels
- Score acquisition /100
- Estimation potentiel croissance
- Top 5 quick wins

#### 2. **KpiCalculator** (`src/engine/kpi-calculator.js`)
- ROAS = revenue / ad spend
- CPA = ad spend / conversions  
- LTV/CAC ratio
- Benchmarks automatiques
- Score de santé business

#### 3. **StratadsCharts** (`src/main/stratads-charts.js`)
- Radar Chart: Maturité acquisition
- Funnel Chart: Tunnel conversion
- ROAS Timeline: Évolution 30 jours
- CPA Scatter Plot: Performance campagnes
- Budget Allocation: Répartition canaux

#### 4. **Report Generator** (`src/main/stratads-report-generator.js`)
- HTML responsive pour CEO/Marketing
- Pas de jargon technique
- Focus sur ROI et pertes d'argent
- Design moderne StratAds

---

## 📈 KPI Essentiels Implémentés

### 💰 **ROAS (Return On Ad Spend)**
```
ROAS = revenue / ad spend
< 2    = Non rentable (critique)
2-3    = Rentable mais fragile  
3-5    = Bon système
> 5     = Très performant
```

### 💸 **CPA (Cost Per Acquisition)**
```
CPA = ad spend / conversions
Benchmark selon secteur + taille
```

### 🔄 **Conversion Rate**
```
CR = conversions / sessions
< 1%   = Très mauvais
1-2%   = Faible
2-3%   = Moyen  
3-5%   = Bon
> 5%    = Excellent
```

### 📊 **LTV/CAC Ratio**
```
LTV/CAC < 1.5 = Danger (non scalable)
LTV/CAC = 2     = Rentable
LTV/CAC = 3     = Très bon
LTV/CAC > 4     = Scaling possible
```

---

## 🎨 Graphiques Business

### 1. **Radar Chart** - Maturité Acquisition
Axes: Tracking, Conversion, Structure Ads, Economics, Scaling Potential

### 2. **Funnel Chart** - Tunnel Conversion
Impressions → Clicks → Sessions → Add to Cart → Purchase

### 3. **ROAS Timeline** - Évolution 30 jours
Graphique temporel avec benchmarks

### 4. **CPA Scatter Plot** - Performance Campagnes
CPA vs Taux conversion par campagne

### 5. **Budget Allocation** - Répartition Canaux
Pie chart: Google Ads, Meta Ads, Organic, Direct

### 6. **Growth Potential** - Projections
Barres comparatives: Actuel vs Potentiel optimisé

---

## 🚀 Usage CLI

### Audit Rapide (Prospection)
```bash
npm run stratads:fast -- -u https://example.com -c "Client SARL"
```

### Audit Public Complet (2500€)
```bash
npm run stratads:public -- -u https://example.com -c "Client SARL"
```

### Audit Privé (5000€)
```bash
npm run stratads:private -- -u https://example.com -c "Client SARL" -s service-account.json
```

### Audit Premium (7500€)
```bash
npm run stratads:full -- -u https://example.com -c "Client SARL" -s service-account.json
```

---

## 📋 Contenu par Type d'Audit

### 🚀 **Fast Audit** (Prospection 2min)
- ✅ Score global acquisition /100
- ✅ Performance web (vitesse, mobile)
- ✅ Detection tracking pixels
- ✅ Estimation potentiel croissance
- ✅ Top 5 quick wins
- ✅ Message perte d'argent

### 📊 **Public Complet** (2500€)
- ✅ Tout Fast Audit +
- ✅ Analyse conversion (CTA, structure pages)
- ✅ Analyse site (UX, landing pages)
- ✅ Funnel estimation
- ✅ Score maturité acquisition
- ✅ Roadmap optimisation

### 🔐 **Private Audit** (5000€)
- ✅ Tout Public Complet +
- ✅ Données réelles Google APIs
- ✅ Analyse ROAS par campagne/canal
- ✅ Analyse CPA vs cible
- ✅ Structure campagnes détaillée
- ✅ Funnel réel avec données
- ✅ LTV/CAC analysis
- ✅ Diagnostic scaling

### 👑 **Full Audit** (Premium)
- ✅ Tout Private Audit +
- ✅ Benchmarks marché
- ✅ Projections croissance détaillées
- ✅ Plan scaling 0-180 jours
- ✅ Analyse concurrentielle

---

## 🎯 Message Commercial Clé

### Exemple dans le rapport :
> "Votre système actuel génère 1.4M€ de chiffre d'affaires annuel.
> Avec une optimisation du tracking, du funnel et des campagnes,
> le potentiel estimé est de 3.2M€.
> **La perte actuelle est estimée à 1.8M€ par an.**

---

## 🔄 Migration Ancienne → Nouvelle

### ❌ **Supprimé**
- `src/engine/orchestrator.js` (trop technique)
- `src/engine/modules/` (modules complexes)
- `src/main/report-gen-html.js` (générateur legacy)
- `fixtures/` (mock data)
- Profiles techniques (fast, public, private, full)

### ✅ **Créé**
- `src/engine/stratads-engine.js` (business-oriented)
- `src/engine/kpi-calculator.js` (KPI essentiels)
- `src/main/stratads-report-generator.js` (rapports CEO)
- `src/main/stratads-charts.js` (graphiques business)
- `scripts/stratads-cli.js` (CLI commerciale)

---

## 📞 Support & Contact

- **Email**: contact@stratads.com
- **Téléphone**: +33 1 23 45 67 89
- **Documentation**: `docs/STRATADS_V2.md`

---

*Version 2.0 - Business-Oriented Audit Platform*
