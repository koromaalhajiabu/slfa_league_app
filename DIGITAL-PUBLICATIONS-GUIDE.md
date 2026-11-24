# SLFA Digital Publications Centre

## Public access

Open the main SLFA League App and select **Digital Publications**. The public library lists documents whose database status is `PUBLISHED`. Visitors can filter by document type, competition and season, or search by title and reference number.

Each PDF download uses a signed link that expires after one hour. The Storage bucket is private; anonymous users can only create download links for documents that have been approved and published.

## Staff access

The Digital Publications Management panel is added to these existing staff portals:

- Media Officer: `media.html`
- Super Admin: `super-admin.html`

### Submit a document

1. Sign in using an active Media Officer or Super Admin account.
2. Open **Digital Publications Management** in the staff workspace.
3. Enter the document title, type, reference number (optional), competition, season, effective date, expiry date and summary.
4. Select a PDF file. The maximum file size is 25 MB.
5. Choose **Save draft** to keep it private, or **Submit for approval** to send it to the review queue.

### Review and publish

Super Admins can open the review queue and choose:

- **Approve & publish** — makes the document visible in the public library.
- **Return for changes** — records a note for the author.
- **Reject** — rejects the submission and keeps the file private.

An author cannot approve their own submission. A Super Admin must review it. Review decisions are written to the existing append-only SLFA activity audit.

Published documents can be withdrawn from the public library by a reviewer. The file remains in private Storage for staff retention. Existing signed links may continue to work until their one-hour expiry.

### Returned or rejected documents

A Media Officer can resubmit a returned document without changes or delete an unpublished item. To correct its content, delete the returned document and upload the corrected PDF as a new submission.

## Data and security

- Database table: `public.slfa_publications`
- Private Storage bucket: `slfa-publications`
- Accepted content type: `application/pdf`
- Maximum file size: 25 MB
- Public database reads: published records only
- Public file access: time-limited signed URLs for published records only
- Staff authoring: Media Officer and Super Admin
- Review authority: Super Admin, excluding the original author
- Activity trail: existing `capture_slfa_activity_audit()` trigger

The feature uses the existing Supabase project and does not require a service-role key in the browser.

## Publication readiness

The library intentionally starts empty. No sample or invented SLFA regulations, circulars or reports have been inserted. Only genuine documents supplied by authorised staff and approved through the review queue should be published. Formal SLFA approval is required before the documents are described as binding Association regulations or notices.
