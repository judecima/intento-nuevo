alter type public.order_status add value if not exists 'pending' before 'submitted';
alter type public.order_status add value if not exists 'edgebanding' after 'production';
