-- Direct table access remains ungranted; only trusted worker RPCs can use it.
create policy email_outbox_server_only on moderation_helpers.email_outbox
for all to service_role using (true) with check (true);
