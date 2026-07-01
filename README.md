# TOSF Increase Monitoring Portal

1. CHEDRO selects region.
2. Applicable RIR is displayed.
3. CHEDRO searches and selects an HEI from the CSV masterlist.
4. CHEDRO enters proposed TF and/or OSF increase.
5. The app computes whether the proposal is below, equivalent to, or higher than the applicable RIR.
6. CHEDRO selects action/status, adds the HEI to the review table, and may edit or remove the row.
7. CHEDRO repeats the HEI entry steps as needed, then submits the batch.

## Manage previous submissions

After verifying their email, a CHEDRO can open **Manage previous submissions** on the public form to review, edit, or delete entries they filed with that email. Edits update the proposed increases, action/status, specifics, and remarks (the RIR category is recomputed server-side). Deletes are soft: the row is flagged `Voided` and excluded from the admin dashboard and CSV export, but retained in the sheet for audit. All operations require the OTP-verified session and only affect rows owned by that email.

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


## Authentication

The public entry form uses email OTP verification. The user enters an official email address, Apps Script sends a 6-digit code, and the verified email is attached to the submission. The admin dashboard uses the password login backed by the Apps Script `Users` sheet. No Google Cloud OAuth client is required.

