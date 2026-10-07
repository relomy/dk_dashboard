# Snapshot interpretation and public types

The schema-v3 producer contract owns the modeled snapshot graph. `src/lib/types.ts`
re-exports generated VIP rows, roster slots, live and contest metrics, statuses,
primary-contest wrappers, and selection reasons. Envelope, sport, and contest aliases
only replace open children with usable dashboard field declarations. All modeled
metadata, required arrays, optional fields, literals, and nullability remain generated.
Producer state strings remain open; the dashboard maps unfamiliar states into its
existing unknown presentation group. API responses, manifests, and authentication
types remain dashboard-owned.

`interpretSnapshot` is the shared ingress for fetches, Live, contracts, and production
checks. It copies the input and converts historical VIP `pts` only when `points` is
absent. Rank and PMR accept finite nonblank numeric strings. Zero survives; malformed
figures are omitted and can fall back to matched standings. Unsupported versions keep
their original envelope and have a separate unknown type; they never claim schema 3.
Routes guard this boundary before consuming sport data.

The original raw object and concrete compatibility-field origins remain attached to
the interpreted root. Conversion is not consumption: unread detection credits only
the source actually read and still reports shadowed aliases, discarded malformed
figures, and new unused fields. Snapshot queries disable structural sharing so a
refetch cannot rebuild the root and discard this provenance. October 4 and October 6
captures and their provenance files are unchanged.

The remaining open sections are:

- Player base fields: the producer leaves the pool open. Name, team, salary,
  positions, actual points, value, ownership, matchup, and game status remain
  supplemental; modeled Scorecard fields are inherited without overrides.
- Standings rows: stable entry keys, figures, explicit cashing, ownership, and
  nullable monetary payouts are supplemental because the producer leaves rows open.
- Train clusters: clustering, overlap, signatures, keys, and figures are supplemental
  because the producer leaves cluster rows open.
- Ownership watchlists: entries, ownership totals, and timestamps remain supplemental
  because the producer leaves this object open.
- Selection reasons: the producer leaves the object open. No dashboard field
  supplement is needed; the generated selection-reason and primary wrapper are
  re-exported directly.

Sport and History cards render `players_live`. Locked slots show the shared locked
placeholder and no player details. Cashing uses the same stable-key evidence resolver
as Live: matched distance points/rank, then matched standings cashing/payout evidence.
Missing evidence produces no badge. Completed monetary labels use only the matched
standings payout; a positive distance by itself says Cashed without inventing winnings.
Profile username rules match the producer's display name, while general rules can
also match the producer's entry keys; unsupported VIP username/entry-id fields are
not read.

Final verification and compact production reports are recorded with the implementation
handoff and integration PR. The required NFL and golf production checks use the
immutable October 4 snapshot because the current latest snapshot only carries Showdown.
