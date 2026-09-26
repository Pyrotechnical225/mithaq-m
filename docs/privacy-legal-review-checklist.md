# Mithaq privacy and safeguarding legal-review checklist

Status: required before production promotion. Product controls are implemented in the Weeks 2–3 preview, but this file is not legal advice.

## Controller and contact

- Confirm the data controller’s full legal name, registered or service address, and privacy contact email.
- Confirm whether Mithaq must register with the ICO and publish a registration number.
- Add the controller and complaint details to `/privacy` before production launch.

## Lawful basis and special-category data

- Map a UK GDPR Article 6 lawful basis to each purpose.
- Obtain advice on Article 9 conditions for religious-belief data and compatibility profiling.
- Review whether explicit consent is the correct condition for every use and whether any processing must stop immediately on withdrawal.
- Complete a Data Protection Impact Assessment covering matchmaking, AI-assisted compatibility, safety reports, and imam review.

## Providers and international transfers

- Review the Supabase, Vercel, OpenAI, and Stripe data-processing terms.
- Confirm data locations, transfer mechanisms, subprocessor lists, deletion behaviour, and incident-notification commitments.
- Confirm that compatibility requests use the intended no-storage provider settings and document the evidence.

## Retention and deletion

- Approve or amend every period published in the draft privacy notice.
- Implement scheduled deletion jobs before claiming automated enforcement.
- Document backup deletion, legal holds, chargebacks, safeguarding exceptions, and deletion-request verification.
- Test deletion against Supabase Auth, database cascades, Storage ownership, payment records, and active JWT expiry.

## Member rights and safeguarding

- Define the process, identity checks, response times, and owners for access, correction, deletion, restriction, objection, and portability requests.
- Define the report-triage, escalation, emergency, and appeal procedures.
- Confirm age-assurance requirements beyond self-declared 18+ confirmation.
- Review messaging, imam access, family contact, and disclosure controls with a safeguarding specialist.

## Launch evidence

- Record the approved notice version and effective date.
- Upgrade Supabase from Free to Pro and enable leaked-password protection, or document an approved alternative control before production launch.
- Run security and privacy tests on the exact production candidate.
- Obtain written legal approval and retain the signed review with the release record.
