-- Corrects customers_identity_check, which made deleting a chatbot impossible.
--
-- The previous migration required a customer with no email to have BOTH
-- visitor_api_key_id AND visitor_ref. But customers.visitor_api_key_id is
-- ON DELETE SET NULL, so deleting an api_key nulls that column on every visitor
-- it ever saw — and each of those rows then violates the check. The delete fails
-- with a constraint error and the chatbot cannot be removed at all.
--
-- Caught by the integration suite's own teardown, which is the cheapest possible
-- place to find it.
--
-- The fix separates two concerns that were conflated:
--   validity   — the row must be identifiable at all: it needs an email or a
--                visitor reference. That is what the check should say.
--   uniqueness — two visitors of the SAME chatbot must not collide. That is the
--                job of customers_visitor_unique_idx, which is unchanged and
--                still keyed on (visitor_api_key_id, visitor_ref).
--
-- After a chatbot is deleted its historical visitors keep visitor_ref and stay
-- valid, readable and attached to their tickets. They simply stop being matched
-- by findOrCreateVisitor, which is correct: the chatbot that knew that reference
-- no longer exists.
--
-- Note that revocation, not deletion, is the normal lifecycle — api_keys.is_active
-- goes false and the credential stops authenticating while all history remains.
-- This only concerns genuine hard deletes.

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_identity_check;
ALTER TABLE customers ADD CONSTRAINT customers_identity_check
  CHECK (email IS NOT NULL OR visitor_ref IS NOT NULL);
