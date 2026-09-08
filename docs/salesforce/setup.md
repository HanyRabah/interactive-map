# Salesforce showcase org — setup guide

Goal: a free Salesforce Developer Edition org filled with demo inventory, so the map's
availability lens reads live numbers and enquiries land in Salesforce as Leads — the
"I marked it sold in Salesforce and the map changed" demo moment.

Everything code-side is already built (`src/lib/crm/providers/salesforce.ts`). This guide
is only the org-side setup, ~30 minutes once.

## 1. Create the org

1. Sign up at https://developer.salesforce.com/signup (free, full API access, never expires).
2. After activation, note your **My Domain** URL — Setup → My Domain, e.g.
   `https://yourname-dev-ed.develop.my.salesforce.com`. This is `SF_INSTANCE_URL`.

## 2. Create the Unit__c custom object

Setup → Object Manager → Create → Custom Object:

- Label: `Unit`, Plural: `Units`, Record Name: `Unit Code` — **Data Type: Text** (not
  Auto Number — the unit code like `zoya-coastal-villas-001` IS the map's unit id).

Then add these custom fields (Object Manager → Unit → Fields & Relationships → New):

| Field label | API name (auto) | Type | Notes |
|---|---|---|---|
| Project Id | `Project_Id__c` | Text (80) | `zoya`, `bayn`, … |
| Cluster | `Cluster__c` | Text (120) | "Coastal Villas" |
| Status | `Status__c` | Picklist | Values: `Available`, `Reserved`, `Sold` |
| Price | `Price__c` | Currency (16, 0) | Org currency (see step 5) |
| Bedrooms | `Bedrooms__c` | Number (2, 0) | |
| Area Sqm | `Area_Sqm__c` | Number (6, 0) | |

Field API names must match exactly — the adapter queries them verbatim.

## 3. Import the seed data

1. Setup → Data Import Wizard → Launch Wizard.
2. Custom objects → Units → Add new records.
3. Upload `docs/salesforce/units-seed.csv` (164 Zoya units, matching the mock provider's
   numbers exactly, so demo screenshots stay consistent either way).
4. Map columns by header name (they match the field API names) → Start Import.

## 4. Create the Connected App (Client Credentials flow)

1. Setup → App Manager → New Connected App.
2. Name: `DP Interactive`, contact email: yours.
3. Enable OAuth Settings:
   - Callback URL: `https://login.salesforce.com/services/oauth2/callback` (unused by
     this flow, but the field is required).
   - Selected OAuth Scopes: **Manage user data via APIs (api)**.
   - Check **Enable Client Credentials Flow**.
   - Uncheck "Require Proof Key for Code Exchange (PKCE)" if pre-checked.
4. Save (takes ~10 min to propagate).
5. Manage Consumer Details → copy **Consumer Key** (`SF_CLIENT_ID`) and **Consumer
   Secret** (`SF_CLIENT_SECRET`).
6. Back in App Manager → your app → Manage → Edit Policies →
   Client Credentials Flow → **Run As**: pick your own user. Save.

## 5. (Optional) Org currency

Dev Edition defaults to USD. For EGP demo pricing: Setup → Company Information →
Currency Locale → Egypt. Either way, set `SF_CURRENCY` below to match.

## 6. Wire the app

Add to `.env.local` (never committed — `.env*` is gitignored):

```
CRM_PROVIDER=salesforce
SF_INSTANCE_URL=https://yourname-dev-ed.develop.my.salesforce.com
SF_CLIENT_ID=<consumer key>
SF_CLIENT_SECRET=<consumer secret>
SF_CURRENCY=EGP
```

Restart the dev server, then verify:

```bash
curl "http://localhost:3000/api/units?projectId=zoya&summary=1"
```

Cluster counts should match Salesforce. Then the demo loop:

1. In Salesforce, open any Available unit and set Status to `Sold`.
2. Re-hit the endpoint (or reload the map) — the available count drops.
3. Submit an enquiry: `curl -X POST http://localhost:3000/api/leads -H "content-type: application/json" -d '{"contactName":"Demo Buyer","email":"buyer@example.com","unitId":"zoya-coastal-villas-001"}'`
4. Salesforce → Leads: the enquiry is there, source "DP Interactive", unit reference in
   the description.

Switching back to demo data at any time: `CRM_PROVIDER=mock` and restart.

## Limits worth knowing

- Dev Edition API limit: 15,000 calls/day — far beyond demo needs.
- The adapter caches its access token and re-authenticates automatically on expiry.
- Shortlist sync to Salesforce is intentionally not wired yet (phase 3 in the proposal);
  shortlists stay in server memory for the showcase.
