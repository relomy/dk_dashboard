# Store the DraftKings username on the User account

To show a User their own past contests, the dashboard must know which entries are theirs. We store a **DraftKings username** on the User account, defaulting to the login username and editable by that User, and match it case-insensitively to `StandingsRow.username`. We rejected reusing the browser-local Profile `username` rule (it does not follow the User across devices) and having the producer tag entries per dashboard User (it couples `dk_results` to dashboard accounts). Uniqueness is not enforced, so two Users may claim the same name.
