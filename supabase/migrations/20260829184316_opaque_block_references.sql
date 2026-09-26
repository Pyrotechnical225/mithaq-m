-- Give browser-facing block management an opaque reference that is not the
-- blocked member's Auth user id.
ALTER TABLE public.member_blocks
  ADD COLUMN IF NOT EXISTS block_id uuid DEFAULT gen_random_uuid();

UPDATE public.member_blocks
SET block_id = gen_random_uuid()
WHERE block_id IS NULL;

ALTER TABLE public.member_blocks
  ALTER COLUMN block_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN block_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS member_blocks_block_id_idx
  ON public.member_blocks(block_id);
