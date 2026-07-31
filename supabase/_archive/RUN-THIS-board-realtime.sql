-- Enable Supabase Realtime on the public message board so the company's Investor Q&A
-- inbox live-updates when a new question/comment lands (BoardQA realtime subscription).
-- Safe to run multiple times.

alter publication supabase_realtime add table public.public_board;

-- If the above errors with "already member of publication", it's already enabled —
-- nothing to do.
