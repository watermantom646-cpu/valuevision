# ValueVision Route to 1,000 Paying Customers

Date: 10 July 2026
Deadline: 25 December 2026
Target: 1,000 active paying customers
Target price: GBP 9.99 per month after the founding beta
Target gross monthly recurring revenue: GBP 9,990

## Core Growth Principle

Do not attempt to acquire 1,000 customers with one launch. Build and validate one acquisition system at a time. Every stage must prove customer value, retention, and API margin before increasing spend.

## Milestones

| Date | Active paying target | Primary growth system |
|---|---:|---|
| 31 July | 10 | Founder-led outreach and demonstrations |
| 31 August | 50 | Referrals and focused seller communities |
| 30 September | 150 | Reseller creators and repeatable content |
| 31 October | 350 | Partnerships and proven organic channels |
| 30 November | 650 | Referral loop and selective paid acquisition |
| 25 December | 1,000 | Multiple proven channels operating together |

These are stretch targets. Missing a milestone should trigger a funnel diagnosis, not misleading reporting or uncontrolled advertising.

## Stage 1: 0 to 10 Paying Customers

Objective: prove that active sellers will pay and use the product.

Primary work:

- Personal outreach to qualified UK resellers.
- Live demonstrations using the seller's own inventory.
- Manual payment fulfilment and onboarding.
- Daily customer conversations.
- API cost measurement per completed scan.

Evidence required before scaling:

- 10 completed payments.
- 8 activated customers completing a scan.
- 5 customers returning within seven days.
- 5 customers expressing renewal intent.
- Acceptable API cost and no severe trust issue.

## Stage 2: 10 to 50 Paying Customers

Objective: prove that customers can arrive through repeatable channels rather than only personal relationships.

Primary work:

- Publish one real sourcing or pricing demonstration each day.
- Ask every active customer for one seller introduction.
- Test two focused communities rather than posting everywhere.
- Create category proof for tools, electronics, fashion, coins, and mixed resale finds.
- Track channel, activation, seven-day return, and renewal separately.

Evidence required before scaling:

- At least two channels produce paying customers.
- At least 40 percent of new customers return within seven days.
- Support work remains manageable.
- Gross margin remains healthy at increased usage.

## Stage 3: 50 to 150 Paying Customers

Objective: turn customer proof into trusted distribution.

Primary work:

- Partner with small reseller creators whose audiences match the ideal customer.
- Give each partner a measurable campaign link or code.
- Run live scan sessions using audience-submitted items.
- Publish customer outcomes with permission.
- Introduce automated account and entitlement management before manual fulfilment becomes a bottleneck.

Evidence required before scaling:

- Partner acquisition cost is lower than expected customer contribution.
- Monthly customer loss is understood and controlled.
- Paid entitlement verification is server-side.
- The service can support at least 150 active customers reliably.

## Stage 4: 150 to 350 Paying Customers

Objective: make acquisition and onboarding operate without the founder handling every customer.

Primary work:

- Automate checkout, entitlement, onboarding, renewal, and cancellation handling.
- Build a referral mechanism with measurable rewards.
- Turn the strongest demonstrations into repeatable short-form content.
- Create an onboarding sequence that gets a customer to a useful first result quickly.
- Publish transparent guidance about confidence and specialist categories.

Evidence required before scaling:

- New customers can pay, activate, and complete a scan without manual help.
- At least one organic channel produces customers every week.
- Referral customers retain at least as well as other customers.
- API capacity and customer support have documented operating limits.

## Stage 5: 350 to 650 Paying Customers

Objective: add controlled paid growth to channels already proven organically.

Primary work:

- Test small advertising budgets against a clear cost ceiling.
- Retarget people who watched demonstrations or started checkout.
- Expand creator partnerships only when attribution is reliable.
- Improve conversion through onboarding and proof, not misleading urgency.
- Build a weekly retention and margin review.

Stop paid acquisition immediately when customer acquisition cost exceeds the planned payback, API margin becomes unsafe, or new customers fail to reach a useful result.

## Stage 6: 650 to 1,000 Paying Customers

Objective: combine multiple healthy channels without damaging product trust or service quality.

Primary work:

- Operate content, referrals, partnerships, App Store discovery, and paid acquisition together.
- Publish category-specific landing pages based on proven customer demand.
- Introduce higher-volume plans only for sellers who demonstrate the need.
- Maintain customer support response standards.
- Protect confidence quality and provider budgets during seasonal demand.

## Required Weekly Dashboard

The protected backend summary is available through `cd backend && npm run growth:status` after `GROWTH_DASHBOARD_TOKEN` is configured. Payment-provider records remain the authoritative evidence for completed payments.

| Metric | Why it matters |
|---|---|
| New qualified visitors | Top-of-funnel reach |
| Checkout starts | Offer interest |
| Payments completed | Customer acquisition |
| Access activations | Fulfilment success |
| First useful scan | Product activation |
| Seven-day active customers | Early retention |
| Monthly renewals | Recurring value |
| Cancellations and refunds | Value or trust problems |
| Average scans per customer | Capacity planning |
| API cost per completed scan | Unit economics |
| Gross margin per customer | Sustainability |
| Customers by source | Channel quality |
| Support requests per customer | Operational load |

Use a distinct `utm_source`, `utm_medium`, and `utm_campaign` for each approved outreach, creator, community, referral, and advertising channel. Make growth decisions from activated and retained customers by source, not from clicks alone.

## Non-Negotiable Guardrails

- Do not advertise unlimited scans while API costs are variable.
- Do not describe uncertain results as formal appraisals.
- Do not claim car checks are available while providers are paused.
- Do not buy large volumes of traffic before activation and retention are healthy.
- Do not count free accounts, downloads, or checkout visits as paying customers.
- Count a paying customer only when payment evidence and active entitlement both exist.
- Report gross revenue separately from profit.
- Preserve customer privacy and keep customer records out of the repository.

## Christmas Completion Evidence

The 1,000-customer goal is achieved only when current payment and entitlement records show at least 1,000 distinct active paying customers on or before 25 December 2026. Downloads, trials, expired buyers, unpaid access codes, and cumulative historical purchases do not satisfy the goal.
