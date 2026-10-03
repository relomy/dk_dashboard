# Accept snapshot schema v3 only

The `dk_results` feed publishes schema v3, and the dashboard was written against the v1 and v2 shapes. We decided the dashboard reads schema v3 only and shows an "unsupported snapshot version" state for any other version, History included. We rejected an adapter that reshapes v3 into the old shapes, because the producer has moved on and an adapter would discard v3 data.

Older snapshots left in the bucket (30-day retention) stay reachable but display as unsupported until they age out.
