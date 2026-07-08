-- Partial unique: at most one default address per company + address_type (among non-deleted rows)
CREATE UNIQUE INDEX IF NOT EXISTS company_addresses_one_default_per_type
ON company_addresses (company_id, address_type)
WHERE is_default = true AND is_deleted = false;
