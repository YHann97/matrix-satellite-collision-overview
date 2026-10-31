# Satellite Collision Overview (Matrix)

A high-reliability satellite conjunction assessment and decision-support web application built with **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS**, **Mapbox GL JS (3D Globe)**, and **Supabase**.

> **Operational Boundary Notice**: This application supports human assessment, risk prioritization, and manual maneuver planning. It does **not** execute autonomous satellite maneuvers.

---

## 1. System Architecture & Tech Stack

| Component | Technology | Description |
|---|---|---|
| **Framework** | Next.js 14 (App Router) | Server & Client Components, API routes |
| **Language** | TypeScript (Strict) | Fully typed telemetry, prediction, and operational schemas |
| **Styling & Tokens** | Tailwind CSS | Space Mono typography, dark mission-control palette |
| **3D Visualization** | Mapbox GL JS v3 | Vector globe projection, altitude & occlusion simulation |
| **Charts & Metrics** | Recharts | Collision risk histograms, lead time distributions |
| **Data Parsing** | PapaParse | High-throughput streaming and bounded batch CSV parsing |
| **Validation** | Zod / TypeScript | Input sanitization, model feature allowlists |
| **Database & Auth** | Supabase (Postgres) | 9 relational tables, RLS policies, audit logs |

---

## 2. Shared Design Tokens

Strict palette adhering to aerospace mission-control standards:

- **Deep Space Background:** `#061426`
- **Surface / Panel:** `#0B1E35`
- **Accent Blue:** `#245BFF`
- **Critical Risk Alert:** `#EF4444` ($P_c \ge 10^{-4}$ or Miss $< 1,000\,\text{m}$)
- **Elevated Risk Warning:** `#FBBF24` ($P_c \ge 10^{-6}$ or $1,000\,\text{m} \le \text{Miss} \le 5,000\,\text{m}$)
- **Safe State:** `#10B981` (Miss $> 5,000\,\text{m}$ and $P_c < 10^{-6}$)
- **Incomplete / Pending:** `#94A3B8` (Missing telemetry or uncalculated)
- **Primary Text:** `#F5F7FA`
- **Muted Text:** `#A8B6CB`
- **Border / Divider:** `#1E3A5F`
- **Typography:** `Space Mono`, monospace

---

## 3. Dataset Characteristics & Units

The system ingests and groups conjunction telemetry records (such as ESA / Kelvins challenge benchmark files `test.csv` or `test_data.csv`).

### Reference Checks (`test.csv`):
- **24,484** telemetry messages across **103** columns.
- **2,167** unique encounters (`event_id`).
- **18** distinct operational missions (`mission_id`).
- All 103 columns are preserved in `telemetry_records.raw_attributes`.

### Raw Storage vs Display Conversion:
- `time_to_tca`: Stored in **days**. Displayed as fractional days (e.g., `1.45 d`) or converted to hours where helpful.
- `miss_distance`: Stored in **metres**. Converted to kilometres for display (e.g. `842 m` / `12.4 km`).
- `relative_speed`: Stored in **m/s**. Displayed in km/s (e.g., `14.2 km/s`).
- `risk`: Logarithmic collision probability $\log_{10}(P_c)$. Normalized to linear probability $P_c = 10^{\text{risk}}$ and rendered in scientific notation (e.g., $2.41 \times 10^{-4}$).

### Historical Assessment Principles:
- Encounters represent historical assessment sequences, not live wall-clock timers.
- No artificial countdown clocks.
- A "Within 24 hours of TCA" filter matches $0 \le \text{time\_to\_tca} \le 1.0$. (Note: in the benchmark `test.csv`, all messages have $\text{time\_to\_tca} > 1.0\,\text{d}$, correctly returning 0 rows).

---

## 4. Five Core Application Modules

### 1. 3D Globe Overview (`/globe`)
- Interactive Mapbox GL JS 3D globe with dark satellite projection.
- Color-coded SVG satellite markers indicating operational risk tier.
- Simulated orbital altitude scaling and back-of-globe occlusion dimming.
- Marker selection updates active encounter context and quick-action summary panel.

### 2. Encounters List & Details (`/encounters`)
- Search by `event_id`, multi-tier filter, object-type filter, and review-status filter.
- 3 Dedicated Subtabs:
  - **Assessment:** Latest collision probability ($P_c$), miss distance, relative geometry, operator alert acknowledgment, and on-demand model prediction.
  - **Telemetry:** Key telemetry parameters plus expandable 103-column raw attribute explorer with search filter.
  - **Updates:** Chronological timeline of all historical messages received for the selected encounter, highlighting the latest assessment (smallest valid `time_to_tca`).

### 3. Insights & Analytics (`/insights`)
- Aggregate metrics: Total unique encounters, critical events, elevated risks, average miss distance.
- Time-to-TCA binned histogram showing distribution of encounter lead times.
- Chaser object type breakdown (Payload, Debris, Rocket Body, Unknown).
- Fleet breakdown by `mission_id`.

### 4. Manual Planning (`/planning`)
- Operator triage queue for unacknowledged and elevated/critical conjunctions.
- Draft manual maneuver mitigation plans:
  - Assigned operator name
  - Proposed action (`radial_boost`, `in_track_burn`, `cross_track_evasion`, `monitoring_only`)
  - Assessment rationale documentation
- Status lifecycle: `unreviewed` $\rightarrow$ `drafting` $\rightarrow$ `reviewed`.
- Note: Reviewing or acknowledging never changes the scientific risk tier.

### 5. Audit History (`/history`)
- Append-only immutable log of all operator actions (acknowledgments, plan updates, prediction runs).
- Before-and-after diff viewer showing exact field alterations.
- CSV export for regulatory compliance and orbital safety records.

---

## 5. External Prediction Contract (`POST /api/predictions`)

The browser sends the selected event's actual per-update history to the Next.js server, which validates and forwards it to `PREDICTION_API_URL` (the native Python `/v1/predict` endpoint). See [backend/README.md](backend/README.md) for the private model bundle and backend startup. With no `PREDICTION_API_URL`, a deterministic rule-based demonstration runs locally in the Next.js server. The technical API records `simulation:true` and `model_version:"demo-simulation-not-trained"`; these illustrative tier probabilities are not learned or validated. The UI uses a neutral tier-estimate panel. A configured real API always takes priority, and its failures stay visible without falling back to simulation.

The request is `{schema_version:"2.0",dataset_id,event_id,record_id,messages:[...]}`. Each message retains its original `source_row` and per-message `c_object_type`. Only these measurements are forwarded: `time_to_tca`, `miss_distance`, `relative_speed`, `relative_position_r`, `relative_position_t`, `relative_position_n`, `c_object_type`, `c_sigma_r`, `t_sigma_r`, `max_risk_estimate`, `F10`, `AP`, and **observed early `risk`**. Only finite messages at least two days before TCA are eligible; future messages are removed before measurement validation. Final labels, final risk, and other CSV columns never cross this allowlist. Missing measurements remain null.

The bundled `public/data/predictions.json` contains frozen-model forecasts precomputed for the exact source CSV SHA-256. Startup joins these only when both full source checksum namespace and event ID match. Matching results display immediately without hosting an API and take priority over the demo path. These external-file predictions have no ground-truth accuracy score. The performance card reports the separate 1,781-event internal holdout; its fold had prior same-row-task exposure and the small observed improvement does not establish superiority. No raw CSV or model weights are included in the frontend assets.

The model forecasts the **final recorded event tier**, with probabilities for Safe, Elevated, and Critical. These class probabilities are not collision probabilities. Final Pc is withheld. The UI displays the model's input horizon and the supplied observed Pc at that horizon separately from the latest source operational assessment (which may include later updates). Model output never overwrites the source Pc or recalculates the current operational policy.

CSV imports retain full event histories in memory per dataset. Static histories must be regenerated with `node --import tsx scripts/build-encounters.ts /path/to/authorized.csv`: version 2 shards store per-update categories and original source rows. Existing legacy shards remain displayable but cannot be used for forecasting; re-import the authorized source CSV. Select `synthetic-demo.csv` in the dataset menu for an immediate simulation using explicitly synthetic messages; they are not real CDMs. Do not use held-out evaluation data to regenerate public assets.

Backend failures appear on the encounter. `PREDICTION_API_KEY` uses server-only `X-API-Key`; optional `HF_TOKEN` supplies private Hugging Face gateway authorization. Neither is a public client environment variable.

---

## 6. Getting Started

### Prerequisites
- Node.js 18.17+ or 20.x
- npm 9+ or pnpm 8+

### Installation
```bash
git clone https://github.com/your-org/matrix-satellite-collision-overview.git
cd matrix-satellite-collision-overview
npm install
```

### Environment Configuration
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
Fill in your keys:
- `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`: Mapbox public access token (get one free at [mapbox.com](https://account.mapbox.com/)).
- `NEXT_PUBLIC_SUPABASE_URL` & `SUPABASE_SECRET_KEY`: Your Supabase database credentials.
- `PREDICTION_API_URL`: Full native backend URL, e.g. `http://127.0.0.1:7860/v1/predict`. Optional `PREDICTION_API_KEY`, `HF_TOKEN`, and `PREDICTION_TIMEOUT_MS` are server-only.

### Database Setup (Supabase)
Apply the complete database migration found in `supabase/migrations/20261031000001_initial_schema.sql` via the Supabase SQL Editor or Supabase CLI:
```bash
supabase db push
```

### Ingestion CLI
Run the standalone batch ingestion script:
```bash
# Dry run verification
npm run ingest -- ./test.csv --dry-run

# Ingest and sync to Supabase Postgres
npm run ingest -- ./test.csv
```

### Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 7. Testing & Verification

Execute the test suite covering boundary conditions, numerical conversions, grouping logic, and prediction allowlists:
```bash
npm test
```

### Test Suite Coverage:
- `tests/classification.test.ts`:
  - **B-1:** Miss distance $< 1,000\text{m}$ triggers Critical regardless of low $P_c$.
  - **B-2:** Miss distance exactly $1,000\text{m}$ with low $P_c$ triggers Elevated.
  - **B-3:** Miss distance $4,999\text{m}$ triggers Elevated.
  - **B-4:** Miss distance exactly $5,000\text{m}$ triggers Elevated.
  - **B-5:** Miss distance $5,001\text{m}$ and low $P_c$ triggers Safe.
  - **B-6:** $P_c = 10^{-4}$ triggers Critical.
  - **B-7:** $P_c = 10^{-6}$ triggers Elevated.
  - **B-8:** Missing distance does not silently default to Safe.
  - **B-9:** Missing distance but $P_c \ge 10^{-4}$ triggers Critical independently.
  - Log risk normalization ($P_c = 10^{\text{risk}}$).
  - Model classification vs operational policy discrepancy flag.
- `tests/csv.test.ts`:
  - Preservation of zero values vs converting empty strings to `null`.
  - Batch parsing and encounter grouping with deterministic tie-breaking.
- `tests/prediction.test.ts`:
  - Early-history allowlists, namespace encoding, native response validation, missing/floor Pc, request races, and history provenance.

### Production Build
```bash
npm run build
```
Build and type checks should be run before deployment. This repository currently retains its existing Next.js version; review framework security updates before production use.

---

## 8. Deployment to Vercel

1. Push your repository to GitHub / GitLab / Bitbucket.
2. Import the repository in [Vercel](https://vercel.com).
3. In Project Settings > Environment Variables, supply:
   - `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`
   - `NEXT_PUBLIC_MAPBOX_STYLE_URL`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `PREDICTION_API_URL`
   - `PREDICTION_API_KEY`
4. Deploy. The Next.js 14 App Router configuration will build statically optimized pages and dynamic serverless API endpoints.
