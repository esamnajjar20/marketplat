-- Normalize service-type capabilities used by listing validation and UI.
-- Existing types receive an explicit allow-list derived from their location flags.
UPDATE "service_types" SET "capabilities" = COALESCE("capabilities", '{}'::jsonb)
  || jsonb_build_object(
    'allowedPricingTypes', COALESCE("capabilities"->'allowedPricingTypes', '["FIXED","STARTING_FROM","NEGOTIABLE"]'::jsonb),
    'allowedLocations', COALESCE("capabilities"->'allowedLocations', (
      SELECT jsonb_agg(x) FROM jsonb_array_elements_text('["AT_CUSTOMER","AT_PROVIDER","REMOTE"]'::jsonb) x
      WHERE (x = 'AT_CUSTOMER' AND COALESCE(("capabilities"->>'atCustomer')::boolean, false))
         OR (x = 'AT_PROVIDER' AND COALESCE(("capabilities"->>'atProvider')::boolean, false))
         OR (x = 'REMOTE' AND COALESCE(("capabilities"->>'remote')::boolean, false))
    ))
  );
