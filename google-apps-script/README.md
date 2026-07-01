# TOSF Increase Monitoring Apps Script Setup

This backend receives CHEDRO form entries and writes them into one normalized Google Sheet table. The public form can submit a batch of HEIs, and the backend stores each HEI as its own row. Public users do not edit a spreadsheet; they submit through the web form. The spreadsheet is only the datastore and admin export source.

## 1. Create the backend Google Sheet

Create a Google Sheet with these tabs, or run `setupProject_()` after setting `SPREADSHEET_ID` and the script will create the core tabs:

- `TOSF_Submissions`
- `Users`
- `Audit`
- `HEI_List` (recommended for server-side HEI validation)

## 2. Paste `Code.gs`

Open Apps Script from the Sheet, paste `Code.gs`, then set Script Properties:

| Property | Required | Value |
|---|---:|---|
| `SPREADSHEET_ID` | Yes | The Google Sheet ID |
| `SUBMISSIONS_SHEET_NAME` | No | Defaults to `TOSF_Submissions` |
| `USERS_SHEET_NAME` | No | Defaults to `Users` |
| `AUDIT_SHEET_NAME` | No | Defaults to `Audit` |
| `HEI_LIST_SHEET_NAME` | No | Defaults to `HEI_List` |
| `SUBMIT_SHARED_TOKEN` | No | Match `VITE_SUBMIT_SHARED_TOKEN` if you use it |
| `PORTAL_OPEN` | No | `TRUE` or `FALSE`; defaults to `TRUE` |
| `SESSION_SECRET` | No | Auto-generated if missing |
| `ALLOWED_EMAIL_DOMAIN` | No | Email domain to restrict public OTP verification (e.g. `ched.gov.ph`). Blank = any email domain |

Run `setupProject_()` once.

## 2a. Email OTP

The public form verifies submitters by email OTP and does not require Google Cloud Console or an OAuth client ID.

When a user requests a code, Apps Script sends a 6-digit passcode using `MailApp`. The code expires after 10 minutes. After verification, the form receives a short-lived OTP session token used for final submission.

To restrict submissions to a domain, set `ALLOWED_EMAIL_DOMAIN` in Apps Script and `VITE_ALLOWED_EMAIL_DOMAIN` in the frontend environment. The frontend setting is only a hint; Apps Script enforces the restriction.

> Note: OTP delivery uses `MailApp`, so the script needs permission to send email. Run any function once in the editor after pasting the code and approve the permission prompt.

## 3. Authorize admin accounts

Admin access uses email/password accounts stored in the `Users` sheet. Run this from the Apps Script editor for each admin:

```javascript
seedUser('your.email@ched.gov.ph', 'change-this-password', 'Your Name', 'admin')
```

The Apps Script Run button cannot pass arguments into `seedUser(...)`. For the editor dropdown, edit the `seedAdminUser()` helper in `Code.gs` with your real email/password/display name, then select `seedAdminUser` and click Run.

Passwords are stored as salted, iterated HMAC-SHA256 records, not plaintext. The row's `Active` flag must be truthy.

## 4. Load the HEI master list

Create or update the `HEI_List` tab with these headers:

```text
HEI Name | UII | Region | HEI Type | Province | City/Municipality | Status
```

Use the same `hei-list.csv` shipped in `public/hei-list.csv`. The frontend loads the CSV for the searchable dropdown. The backend uses `HEI_List` to validate that the selected UII/school belongs to the selected CHEDRO region. If `HEI_List` is absent, the backend still accepts the frontend CSV selection, but that is weaker.

## 5. Deploy

Deploy the script as a Web App and set Netlify/Vite environment variables:

```text
VITE_GAS_WEB_APP_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
VITE_SUBMIT_SHARED_TOKEN=same_value_as_SUBMIT_SHARED_TOKEN_if_used
VITE_ALLOWED_EMAIL_DOMAIN=ched.gov.ph
```

Then run:

```bash
npm install
npm run build
```

Deploy the generated `dist` folder.

## Data model

The app writes one row per HEI TOSF application. A single web form submission may append multiple rows when multiple HEIs are added to the review table. Important fields:

- Region code, region label, and applicable RIR
- UII, HEI name, province, city/municipality, status
- Proposed tuition fee increase (%)
- Proposed other school fees increase (%)
- Computed RIR category: below, equivalent, or higher than RIR
- CHEDRO action/status
- Other specifics and remarks
- Submitter name, official email, position/unit, and contact number

The admin dashboard computes the Excel-style consolidation summary from this normalized table.
