# DK Dashboard

A dashboard for following DraftKings daily-fantasy contests in real time —
tracking specific entrants ("VIPs") through a contest and reading the live
state of the field as games play out.

## Language

### Data capture

**Snapshot**:
A point-in-time capture of DraftKings data across all sports at a single moment.
_Avoid_: dump, export

**Latest**:
The most recent snapshot; the app's default landing view.

**Manifest**:
A per-day index of the snapshots captured on a given UTC day.
_Avoid_: index, catalog

**History**:
The browsable timeline of past snapshots, resolved through manifests.

### Freshness and lifecycle

**Status**:
A sport's data freshness — fresh, stale, or error. Describes the *data*, not a
contest.
_Avoid_: state

**State**:
A contest's lifecycle position — upcoming, live, completed, or cancelled.
Describes the *contest*, not data freshness.
_Avoid_: status

**Health**:
The diagnostics view of snapshot freshness and per-sport status.

### Sports and contests

**Sport**:
A DraftKings sport (e.g. NBA, NFL) that groups its own contests and player pool.

**Contest**:
A single paid DraftKings competition with entries, a prize pool, and a lifecycle
state.

**Primary contest**:
The one contest per sport chosen as the focus of the live sweat view.
_Avoid_: main contest, featured contest

**Field**:
All entrants in a contest. When narrowed to the tracked subset, that subset is
the Watchlist, not the field.

**Watchlist**:
The tracked subset of a contest's entries, used as a stand-in for the field when
full contest data is unavailable.

### People and entries

**VIP**:
A person/entrant you deliberately track through a contest. A VIP is always a
person, never a lineup.
_Avoid_: user, player

**User**:
An authenticated person who can sign in to the dashboard; holds the role of
Owner or Friend.
_Avoid_: account

**Owner**:
A User role with administrative rights, including creating other users.

**Friend**:
A standard, non-administrative User role.

**Profile**:
A locally saved, named set of rules for filtering which VIP entries you see. It
lives in the browser, not on a User.
_Avoid_: account, preset

**Entry**:
A single paid submission to a contest, with its own rank, payout, and lineup.
_Avoid_: ticket

**Lineup**:
The roster of player slots that makes up an entry. An entry has exactly one
lineup.
_Avoid_: team, roster

**Slot**:
One position within a lineup, holding a player and an optional scoring
multiplier.

### Players

**Player**:
An athlete available in a sport's pool, carrying a salary, projected and actual
points, and ownership.
_Avoid_: VIP

**Player pool**:
The full set of players available for a sport's contests.
_Avoid_: field

**Ownership**:
The share of a contest's entries that roster a given player, as a percentage.
_Avoid_: exposure

**Value**:
A player's scoring efficiency relative to salary — points earned per unit of
salary.

### Cash and scoring

**Cash line**:
The score or rank cutoff that separates paid entries from unpaid ones in a
contest.
_Avoid_: bubble, cut

**Cashing**:
The condition of an entry being on track to win a payout, or having won one.
_Avoid_: in the money

**Distance to cash**:
A projected, positional signal: how far a VIP's entry sits above or below the
cash line right now, measured in points or rank. It says *whether* an entry is
on track, not how much it wins.

**Payout**:
The money an individual entry wins, credited when it finishes above the cash
line. A monetary outcome — distinct from distance to cash, which is only a
position relative to the line.
_Avoid_: winnings

**Prize pool**:
The total money a contest distributes across all paid entries.
_Avoid_: pot

**PMR (Player Minutes Remaining)**:
The total game minutes left across all players in a lineup; more PMR means more
scoring still to come.
_Avoid_: time remaining

**Non-cashing**:
Entries currently sitting below the cash line.

### Trains and leverage

**Train**:
A group of entries riding the same, or nearly identical, lineup.
_Avoid_: cluster, stack

**Train finder**:
The view that surfaces the largest and most relevant trains in a contest.

**Leverage**:
How much a VIP's outcome diverges from the field's, driven by differences in
player ownership.

**Swing player**:
A player with high remaining ownership whose performance will move many entries
at once.

**Uniqueness delta**:
The gap between a VIP's remaining ownership and the field's; positive means the
VIP is more unique than the field.

**Ownership remaining**:
The share of ownership tied to players who have not finished their games —
unrealized ownership that can still move results.

**Ownership in play**:
The share of a VIP's ownership coming from players whose games are currently
underway.
