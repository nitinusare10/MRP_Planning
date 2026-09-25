# Zoho response field names — provenance note

The Zod schemas in this folder reflect the well-documented, stable parts of
the Zoho Inventory v1 REST API (item/vendor/warehouse/purchase-order/
purchase-receive/sales-order identifiers, names, statuses, quantities). This
environment has no live Zoho credentials and blocked egress to Zoho's own
docs while this phase was built, so a few line-item-level fields — line-item
delivery dates in particular, marked `// VERIFY` below — are implemented as
best-effort, defensively-optional fields with a documented fallback rather
than assumed with certainty.

**Before the first real sync run**, cross-check every schema in this folder
against the live Zoho API Console / Inventory API reference for your
registered app, and adjust field names where they differ. Nothing here was
invented to _behave_ a particular way beyond what's stated — where a field's
exact name was uncertain, the code says so and degrades safely (treats it as
optional/defaulted) rather than silently guessing a value.
