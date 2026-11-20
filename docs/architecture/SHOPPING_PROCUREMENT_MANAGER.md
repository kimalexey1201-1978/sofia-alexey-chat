# Shopping & Procurement Manager

**Status:** architecture specification; runtime implementation is pending.  
**Contract baseline:** JSON Schema Draft 2020-12. Versioning follows [CONTRACT_AND_IDENTIFIER_STANDARDS.md](CONTRACT_AND_IDENTIFIER_STANDARDS.md).

## 1. Purpose

Shopping & Procurement Manager (SPM) helps the user discover products and services, compare offers, evaluate compatibility and total cost, prepare purchasing decisions, and track authorized orders, deliveries, returns, and refunds.

The manager is an informed decision-support and workflow layer, not an autonomous buyer. Browsing and comparison are separate from cart changes, checkout, payment, subscription enrollment, and order placement. Purchases and other binding commitments require fresh, explicit, action-specific approval.

## 2. Responsibility boundaries

- SPM owns product/offer normalization, comparison criteria, shopping lists, cart intent, order tracking, delivery status, return/refund workflow metadata, and purchase decision support.
- Knowledge & Search Manager handles general information retrieval and source provenance.
- Automation & Integration Manager supplies approved retailer, marketplace, courier, and service-provider adapters and connection lifecycle.
- Financial & Expense Manager may provide user-authorized budget context; it does not authorize purchases.
- File & Document Manager manages receipts, invoices, warranties, and related files.
- Identity & Authentication Manager resolves account identity.
- Security Manager authorizes each protected operation.
- Privacy & Data Governance Manager governs personal data, purchase history, and provider disclosure.
- Autonomy & Decision Manager controls authority and confirmation requirements.
- Workflow & State Manager owns durable order/return workflows and recovery.
- Notification & Reminder Manager delivers delivery, return-window, and warranty reminders.
- Audit & Observability Manager records decisions and external side effects with data minimization.

## 3. Product discovery and source quality

Product discovery may use official retailer/brand APIs, approved shopping feeds, or permitted public web sources. Each product and offer records source, retrieval time, region, currency, availability evidence, and source URL/reference.

Do not fabricate products, stock, prices, discounts, seller identity, ratings, reviews, shipping dates, or warranty terms. Distinguish seller claims, provider-reported values, user reviews, and Sofia's derived comparisons. Prices and availability are time-sensitive and must be refreshed before checkout.

No scraping that violates site terms, CAPTCHA evasion, bot-detection circumvention, or unauthorized access is permitted. When an official API is unavailable, provide a user-mediated link or hand-off instead of pretending to have transactional access.

## 4. Product identity and compatibility

Normalize brand, model, variant, SKU/GTIN where available, condition, size, color, region, and seller. Similar-looking products must not be treated as identical without sufficient identifiers.

Compatibility checks declare the target device/model and evidence source. Unknown or conflicting compatibility is marked uncertain. Safety-critical products, regulated goods, age-restricted items, and items subject to legal or platform restrictions require category-specific policy gates and may be unavailable.

## 5. Offer comparison and total cost

Compare like-for-like variants and show:
- item price and currency;
- shipping, taxes, duties, and other known fees;
- delivery estimate and its freshness;
- seller identity and fulfillment model;
- condition, warranty, and return terms;
- stock/availability source and timestamp;
- relevant compatibility and specification differences.

Do not rank solely by headline price. If taxes, duties, or fees are unknown, label the total as incomplete rather than estimating without basis. Currency conversion must identify rate source and timestamp.

## 6. Shopping lists and budgets

Shopping lists may include item requirements, quantity, acceptable variants, priority, target price, deadline, and user notes. Budget context from Financial & Expense Manager is read-only and purpose-limited.

A budget warning is advisory. Being within budget does not authorize checkout, and a savings goal or previous purchase does not imply consent for a new purchase.

## 7. Cart, checkout, and purchase authorization

Cart preparation may be supported where the provider allows it, but checkout and order placement are high-impact external side effects. Before any purchase, show and bind approval to:
- exact item, variant, and quantity;
- seller and fulfillment method;
- total amount, currency, shipping, taxes, and fees;
- shipping address and delivery option;
- payment instrument reference (never its secret credentials);
- subscription/recurrence status;
- cancellation and return terms.

Any change to these parameters invalidates the approval. Require fresh confirmation immediately before order submission, and provider-required step-up authentication. Never store full payment-card details or bank credentials. Do not purchase, subscribe, bid, donate, or commit to a contract from a general instruction such as "find the best one."

## 8. Orders, delivery, returns, and refunds

Order states distinguish draft, awaiting approval, submitted, accepted, processing, shipped, out for delivery, delivered, cancelled, returned, refunded, failed, and completion unknown. Provider acceptance is not proof of delivery.

Track shipment only through authorized provider/courier capabilities. Delivery notifications must distinguish estimated from confirmed delivery. Returns and refunds are separate workflows with deadlines, eligibility evidence, return-label references, shipment tracking, and provider-confirmed refund status.

Never claim a refund is complete until the provider or payment source confirms it. Unknown completion must be reconciled before retrying a cancellation, return request, or purchase.

## 9. Privacy and security

Purchase history, addresses, household details, and payment references are sensitive. Apply purpose limitation, minimization, classification, consent, retention, export, and deletion. Credentials remain in protected vaults and are never exposed to models, browser storage, logs, or repository files.

Protect against counterfeit listings, seller impersonation, malicious product descriptions/reviews, prompt injection, price manipulation, affiliate conflicts, address substitution, duplicate orders, and cross-account leakage. External content is untrusted data, never executable instruction.

## 10. Notifications and proactive behavior

Price-drop, restock, delivery, return-window, and warranty alerts must be explicitly configured, bounded in frequency, and tied to a specific item/order and user purpose. A notification is informational and never authorizes a purchase or subscription.

## 11. Android-first and cross-platform

Android is the primary client. Use supported app links, official apps, browser hand-off, and secure provider integrations. Respect Android permissions, app lifecycle, background limits, and notification settings. Other platforms use the same contracts behind platform-specific adapters.

Capability discovery is mandatory per provider, account, region, API version, and product category. Universal retailer access is not assumed.

## 12. Verification requirements

Test offer freshness, currency and total-cost arithmetic, variant identity, seller impersonation, counterfeit signals, stock drift, region restrictions, compatibility uncertainty, provider rate limits, checkout parameter tampering, approval invalidation, duplicate order prevention, account/address mismatch, subscription disclosure, payment credential isolation, delivery status reconciliation, return-window calculation, refund verification, prompt injection, and data deletion.

## 13. Implementation status

**Implementation status:** this change adds architecture and versioned contracts only. It does not connect retailers, create carts, place orders, process payments, track shipments, submit returns, or access purchase accounts. No production configuration or existing prototype data is changed.
