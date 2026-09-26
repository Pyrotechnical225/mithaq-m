# Mithaq automated email catalogue — 31 August 2026

This is the agreed notification list and its implementation boundary. Email copy
must stay generic: names, profile answers, compatibility scores, meeting addresses,
family messages and check-in notes belong only inside the signed-in website.

## Product notifications prepared locally

| Audience       | Email                       | Trigger                                                 | Required send-time check                                                         |
| -------------- | --------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Member         | Survey complete             | Survey changes from draft to complete                   | Survey is still complete                                                         |
| Member         | Continue journey            | Unfinished survey/privacy step has been idle for 7 days | Still incomplete, not paused or staff, no active introduction; weekly, maximum 8 |
| Member         | Introduction ready          | Imam-approved anonymous introduction becomes available  | Current participant, unblocked pair, still awaiting member review                |
| Member         | Introduction reminder       | Private response remains pending for 3 days             | Still awaiting that member; weekly, maximum 4                                    |
| Member         | Mutual acceptance           | Both members privately accept                           | Both acceptances are still current                                               |
| Member         | Introduction closed         | A live introduction closes                              | Current participant; never attribute the other person's decision                 |
| Member         | Introduction unavailable    | An introduction is withdrawn or becomes unavailable     | Current participant                                                              |
| Member         | Meeting proposed or changed | A proposed time or venue changes                        | Current meeting is still proposed                                                |
| Member         | Meeting-response reminder   | Proposed meeting is unanswered for 2 days               | Still proposed and awaiting that member; weekly, maximum 3                       |
| Member         | Meeting confirmed           | Meeting is confirmed                                    | Current meeting is still confirmed                                               |
| Member         | Meeting cancelled           | Meeting is cancelled or declined                        | Current meeting has that status                                                  |
| Member         | 24-hour meeting reminder    | Confirmed meeting is within 24 hours                    | Still confirmed, future and not superseded                                       |
| Member         | Payment received            | Meeting-package payment is verified                     | Current member payment state is paid; not a tax invoice                          |
| Member         | Meeting-package reminder    | Own package step remains unpaid for 3 days              | Mutual acceptance still current; weekly, maximum 4                               |
| Member         | Three-week private check-in | Explicitly completed meeting reaches 21 days            | Still due, unanswered, latest completed meeting, pair remains eligible           |
| Member         | Check-in reminder           | Check-in remains unanswered for another week            | Still due and unanswered; weekly, maximum 2                                      |
| Imam           | Match awaiting review       | Proposed pair is assigned                               | Active, verified, currently assigned imam                                        |
| Imam           | Match-review reminder       | Assigned review remains open for 1 day                  | Still assigned and awaiting review; weekly, maximum 4                            |
| Imam           | Pair ready to schedule      | Both members complete the required steps                | Active, verified, currently assigned imam and ready status                       |
| Imam           | Scheduling reminder         | Ready pair remains unscheduled for 2 days               | Still assigned and ready; weekly, maximum 4                                      |
| Imam           | Meeting updated             | Assigned meeting status changes                         | Active, verified, currently assigned imam                                        |
| Imam applicant | Application received        | Signed-in user submits an imam application              | Same applicant and application remains pending                                   |
| Administrator  | New imam application        | Imam application is submitted                           | Current administrator and application remains pending                            |
| Administrator  | Application reminder        | Application remains pending for 7 days                  | Still pending; weekly, maximum 4                                                 |
| Imam applicant | Application decision        | Application is approved or declined                     | Same applicant and a current final decision                                      |
| Administrator  | New imam referral           | Referral is submitted                                   | Current administrator role                                                       |
| Administrator  | Referral reminder           | Referral remains pending for 7 days                     | Still pending; weekly, maximum 4                                                 |
| Referring imam | Referral decision           | Referral is approved, declined or invited               | Active verified referring imam                                                   |
| Administrator  | Member requested support    | Member chooses support in a private check-in            | Current administrator, request is still unreviewed                               |

All seven preference groups are off by default: journey reminders, introductions,
meetings, check-ins, payments, imam workspace and administrator alerts. A member or staff user must opt
in explicitly. Changing a role, assignment, consent, block, meeting status or
support-review status can suppress a queued email before it leaves Mithaq.

## Account and security emails

Keep these separate from optional product notifications and do not allow opt-out:

- verify email address;
- password-reset and passwordless sign-in links;
- confirmed email-address change;
- MFA added, removed or recovery changed;
- account suspension, deletion or security-sensitive recovery.

Supabase Auth currently owns verification and recovery. Its default SMTP and
template limits are separate from the SES product-notification worker. Do not route
these through the product outbox until custom Auth SMTP is explicitly configured
and the full authentication flow has been retested.

## Sensible later additions, after the core launch

- refund or payment-failure resolution;
- privacy/export/deletion completion notices.

These need their own reviewed product states before implementation. Do not infer
them from free text, create marketing sequences, or repeatedly email inactive users.

## Operational alerts, not member emails

The owner needs independent alerts for delivery failures, unknown send outcomes,
queue backlog, SES sandbox/sending pauses, credential failures, and elevated bounce
or complaint rates. They must come from SES/CloudWatch monitoring rather than the
same email queue that may be broken. Do not include a recipient address or enable
paid monitoring services until the owner approves the exact alert destination and
cost implications.
