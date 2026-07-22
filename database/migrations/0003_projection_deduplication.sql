-- Defense-in-depth for duplicate SQS delivery: a consumer may record each
-- learner stream sequence at most once, even if a different message UUID is used.

create unique index inbox_deduplication_consumer_sequence_uidx
  on inbox_deduplication (consumer_name, learner_id, sequence)
  where learner_id is not null and sequence is not null;
