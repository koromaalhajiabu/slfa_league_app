# SLFA Test Accounts Centre setup

This feature creates genuine Supabase Auth users, but assigns them only a TEST_* identity in slfa_test_accounts. It does not assign a production role in user_profiles. The existing auth trigger creates a Pending production profile; the provisioning function verifies that it stayed Pending and rejects emails that already have a production role invitation.

## 1. Run the database migration

In Supabase Dashboard → SQL Editor, run the complete file:

supabase/migrations/2026-11-14-slfa-test-accounts.sql

The migration creates the test-account registry, test-only activity and record tables, and the RPCs used by the isolated test portal.

## 2. Deploy the Edge Function

Deploy the folder supabase/functions/manage-test-accounts.

Function name: manage-test-accounts

With Supabase CLI, from the repository root:

```bash
supabase functions deploy manage-test-accounts
```

The function uses the project's built-in SUPABASE_URL and SUPABASE_ANON_KEY, plus the server-only SUPABASE_SERVICE_ROLE_KEY. Confirm that the service-role secret is configured in Supabase Dashboard → Edge Functions → Secrets. Never put this key in config.js, HTML, JavaScript served by GitHub Pages, or any public repository file.

Keep JWT verification enabled for this function. It independently verifies that the caller is an active Developer before using the service-role client.

## 3. Create test identities

After the migration and function are deployed:

1. Open the SLFA Developer portal and sign in as the active Developer.
2. Open SLFA Test Accounts Centre.
3. Enter a distinct email address, full name, password (at least 10 characters), and test role.
4. Create the account and securely retain its login credentials.
5. Open test-portal.html and sign in using those credentials.

Use email addresses that are not present in role_invitations. The function rejects an email with a pending production invitation.

## Isolation and limitations

- Test accounts are separate Supabase Auth identities with TEST_* roles, not SUPER_ADMIN, REFEREE, or other production roles.
- The normal production portal requires an active user_profiles record. Test signups are deliberately left Pending there, so production portals reject them.
- Test data is stored in slfa_test_records and test actions in slfa_test_activity; these do not write to official league tables.
- The current test dashboards exercise isolated sample workflows (fixture/result simulation, club notes, match events, disciplinary cases, and media drafts). They are not copies of every production workflow and do not publish or submit official data.
- Disabling a test account blocks its test-profile RPC access. Deleting it removes the Auth identity and its linked test data.
- No test credentials are pre-created. The Developer creates each account and sets its initial password.