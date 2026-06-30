# TOSF Increase Monitoring Portal

Refactored from the event-registration portal into a CHEDRO entry form and admin consolidation dashboard for Tuition Fee and Other School Fees (TOSF) increase applications for AY 2026-2027.

## What changed

- Removed event registration, accommodation, breakout sessions, QR, and check-in workflow.
- Added a public TOSF monitoring entry form.
- Added searchable HEI selection from `public/hei-list.csv`.
- Added a review table for multiple HEIs with add, edit, and remove controls before submission.
- Added automatic RIR lookup per CHEDRO and automatic RIR category computation.
- Added CHEDRO action/status options aligned with the consolidated report template.
- Added admin login and summary dashboard.
- Added CSV export for filtered consolidated submissions.
- Replaced the Apps Script backend with a normalized `TOSF_Submissions` datastore.

## Public form flow

1. CHEDRO selects region.
2. Applicable RIR is displayed.
3. CHEDRO searches and selects an HEI from the CSV masterlist.
4. CHEDRO enters proposed TF and/or OSF increase.
5. The app computes whether the proposal is below, equivalent to, or higher than the applicable RIR.
6. CHEDRO selects action/status, adds the HEI to the review table, and may edit or remove the row.
7. CHEDRO repeats the HEI entry steps as needed, then submits the batch.

## Admin dashboard

The admin dashboard provides:

- Total TOSF applications received.
- RIR category counts.
- Regional action/status counts.
- Decrease totals with subcategories.
- Region-by-region table.
- Detailed HEI table with filters.
- Export to CSV.
- Portal open/close toggle.

## Frontend setup

```bash
npm install
cp .env.example .env
npm run dev
```

Build:

```bash
npm run build
```

Required environment variables:

```text
VITE_GAS_WEB_APP_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

Optional:

```text
VITE_SUBMIT_SHARED_TOKEN=match_apps_script_submit_shared_token
# Restrict public OTP entry to one email domain (blank = any domain):
VITE_ALLOWED_EMAIL_DOMAIN=ched.gov.ph
```

## Authentication

The public entry form uses email OTP verification. The user enters an official email address, Apps Script sends a 6-digit code, and the verified email is attached to the submission. The admin dashboard uses the password login backed by the Apps Script `Users` sheet. No Google Cloud OAuth client is required.

## Backend setup

See `google-apps-script/README.md`.

## HEI CSV

The file must be available at:

```text
public/hei-list.csv
```

Expected columns:

```text
HEI Name, UII, Region, HEI Type, Province, City/Municipality, Status
```

The backend should also have the same data in a Google Sheet tab named `HEI_List` for server-side validation.
