# Colorado Now newsletter: manual setup

The website interface is prepared. The secure backend must be deployed and connected before the newsletter can send or accept website subscriptions. You do not need a plugin. No subscriber emails or secret keys belong in GitHub, public storage, or this chat.

Configured identity:
- Sender: **Colorado Now <newsletter@thecoloradonow.com>**
- Footer: **1500 N GRANT ST, STE R, Denver, CO, 80203, US**
- Supabase project: **ilhlwostiitksxhhaqbt** (use the same project as the website).

## 1. Prepare Brevo

1. Ensure `newsletter@thecoloradonow.com` exists as a mailbox or alias that can receive replies and verification emails. Brevo does not create this inbox.
2. In Brevo's sender/domain settings, add and authenticate `thecoloradonow.com`. Copy the DNS records generated for your account into your domain provider, or follow Brevo's authentication wizard. Use the actual record names and values Brevo supplies. Preserve existing website records and other mail-service records; do not create a second SPF or DMARC record or blindly replace an existing mail policy.
3. Add/verify the sender **Colorado Now**, email **newsletter@thecoloradonow.com**. Wait until Brevo shows the sender active and the domain authenticated.
4. Create an empty, dedicated contact list named **Colorado Now Newsletter — Confirmed**. Note its numeric list ID. Only confirmed opt-ins should enter this list. Do not import unconfirmed or unsubscribed contacts.
5. Create and activate a **double-opt-in transactional email template**. Use the supplied `brevo-confirmation-template.html` as its HTML. Sender: the verified newsletter address. Subject: **Confirm your Colorado Now newsletter subscription**. The confirmation button must keep `{{ params.DOIurl }}` as its destination: this is the variable for Brevo's API double-opt-in flow, not a hardcoded website link. Note the template's numeric ID. The backend checks that the template is active and recognized as a DOI template.
6. Generate a **Brevo API key** in its SMTP/API settings. This is the API key, not an SMTP password. Copy it directly to the Supabase secret setting in step 4. Never put it in website JavaScript or GitHub.

Official references:
- [Domain authentication](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC)
- [API double opt-in](https://developers.brevo.com/reference/create-doi-contact)

## 2. Prepare bot protection

In Cloudflare Turnstile, create a Managed widget for `thecoloradonow.com` and `www.thecoloradonow.com`. You can use Turnstile without moving your website hosting or DNS to Cloudflare. Keep the resulting **site key** and **secret key** for step 4. Restrict the widget to these website hostnames. Do not use Cloudflare's testing keys in production.

## 3. Run the Supabase SQL

1. Open the website's Supabase project → **SQL Editor → New query**.
2. Paste the entire supplied `newsletter.sql` file and run it.
3. It creates private newsletter drafts and temporary hashed rate-limit records. It does not modify existing articles, authors, image storage, or video settings. It does not create a public subscriber table.
4. Keep row-level security enabled. Direct browser access to these tables is intentionally denied. The backend uses the server-only service role after checking each editor's identity.

## 4. Add Supabase function secrets

Open **Edge Functions → Secrets** (the label may appear as Manage Secrets). Add:

| Name | Value |
|---|---|
| `BREVO_API_KEY` | Your private Brevo API key |
| `BREVO_LIST_ID` | Numeric ID of the dedicated confirmed-subscriber list |
| `BREVO_DOI_TEMPLATE_ID` | Numeric ID of your active API double-opt-in template |
| `TURNSTILE_SECRET_KEY` | Private Turnstile secret key |
| `TURNSTILE_SITE_KEY` | Public Turnstile site key |
| `NEWSLETTER_PUBLIC_ENABLED` | `false` initially |

Supabase normally provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` automatically inside Edge Functions. Leave these built-in settings alone. The service-role key must never be copied into the website.

Optional overrides, already set to the identity above in the function source:
- `NEWSLETTER_SENDER_NAME`
- `NEWSLETTER_SENDER_EMAIL`
- `NEWSLETTER_POSTAL_ADDRESS`

## 5. Deploy the Supabase function

1. Open **Edge Functions → Deploy a new function → Via Editor**.
2. Name it exactly **newsletter**.
3. Replace the default `index.ts` with the complete supplied `index.ts` file. It is self-contained; there are no packages or additional files to install.
4. Deploy it.
5. In this function's settings, turn **Verify JWT / Verify JWT with legacy secret** **OFF** so visitors can request confirmation emails without signing in. This is specific to the `newsletter` function. Its code independently verifies admin sessions through Supabase Auth; public signup requires Turnstile and rate limits. Do not turn off database RLS or change authentication on other functions.

Expected URL: `https://ilhlwostiitksxhhaqbt.supabase.co/functions/v1/newsletter`.

## 6. Check the admin connection before enabling signups

1. Sign in to the website admin with one of the two existing approved editor accounts.
2. Open **Newsletter → Check Connection / Refresh**.
3. It checks the database, Brevo list, active sender, and DOI template. If a setting is missing, fix that in Supabase or Brevo and retry.
4. Create a draft with a subject, optional preview text/introduction, and 1–12 published articles. **Save & Preview Draft**.
5. Click **Send Test to My Email**. The test goes only to the signed-in approved editor's address. Inspect the email on desktop and phone, including footer, links, branding, and postal address.
6. Do not use **Send to Subscribers** until you deliberately want a live delivery. Nothing in deployment automatically sends email.

## 7. Enable and verify website signup

1. Once the checks pass, change `NEWSLETTER_PUBLIC_ENABLED` to **true** in Supabase Secrets. Redeploy the function if needed for the setting to take effect.
2. Open Subscribe on the website. The new form should appear while the Substack alternative remains available.
3. With an address you own, tick consent, pass the security check, and subscribe. You should receive a confirmation email. Confirm it and verify that the address enters the dedicated Brevo list only after confirmation.
4. Send a newsletter to this small test audience after reviewing the test email. Check the unsubscribe link. Verify that the address is blocklisted/excluded by Brevo afterward. Do not clear that blocklist status to test again; use another address you own or deliberately resubscribe through the confirmed flow.

## Normal use

- Save edits before testing. Every saved edit requires a fresh test before send/schedule controls unlock.
- **Schedule Newsletter** uses the device timezone displayed beside the input; the backend sends a UTC timestamp to Brevo.
- Use **Refresh Delivery Report** for delivery, bounce, and unsubscribe totals. Brevo is the authoritative subscriber and suppression store; this implementation does not copy your contact list into public website files or require a custom webhook.
- Manage scheduled campaign cancellation or unusual delivery states directly in Brevo. Delivery submission is not proof that every recipient received the message.
- If a request times out after a send, the draft is locked for review rather than automatically sent again. Inspect its campaign in Brevo before taking further action. A status of `preparing`, `submitting`, or `review_required` can require this manual review after an interrupted request.
- Free-plan sending caps still apply. Confirmation/test emails also use the account's allowance. Brevo may require requeuing large campaigns across days; review your remaining quota before sending to a growing list. The website does not bypass provider limits.
- Signup protections initially allow 5 requests per network address/hour, 2 per email address/day, and 100 total/day after a valid CAPTCHA. Temporary rate-limit identifiers are HMAC hashes and are cleaned up after two days during subsequent signup/test requests.
- Approved newsletter editors match the two existing website editor emails. Changes to that allowlist must be made in the backend source as well as any website admin account settings.

## Rollback

Set `NEWSLETTER_PUBLIC_ENABLED=false` and redeploy if needed. The website signup form stays hidden and the existing Substack link remains usable. Existing Brevo contacts, drafts, and campaigns are not deleted. Campaigns already queued or scheduled must be paused/canceled in Brevo separately.

## Verification performed during development

The backend was tested with simulated Supabase/Brevo responses for authorization, secret isolation, published-article checks, draft revisions, test-before-send, race protection, scheduling, uncertain-send handling, CAPTCHA, rate limiting, and duplicate-address privacy. Browser tests covered signup fallback, consent, mobile layout, admin navigation, preview sandboxing, unsaved edits, test gating, final-send confirmation, and error handling. Live account access, DNS, actual database installation, and real email delivery still require the manual setup above.
