-- Prevent two concurrent open requests from the same customer for the same listing.
-- Closed requests remain allowed; the unique constraint applies only to the
-- lifecycle states that are still actionable.
CREATE UNIQUE INDEX "service_requests_one_open_per_customer_listing"
ON "service_requests" ("customerId", "listingId")
WHERE "status" IN ('PENDING', 'ACCEPTED', 'IN_PROGRESS');
