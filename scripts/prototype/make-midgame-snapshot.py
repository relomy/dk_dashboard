"""PROTOTYPE ONLY — throwaway. Derives a fake *mid-game* snapshot from the canonical
completed NBA fixture so the Live redesign prototype has something to sweat.

Run: python3 scripts/prototype/make-midgame-snapshot.py
Writes: public/mock/snapshots/PROTOTYPE-midgame.v3.json
"""
import json
import random
from pathlib import Path

random.seed(7)
ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "public/mock/snapshots/canonical-live-snapshot.v3.json"
OUT = ROOT / "public/mock/snapshots/PROTOTYPE-midgame.v3.json"

d = json.loads(SRC.read_text())
d["snapshot_at"] = d["generated_at"] = "2026-02-21T03:12:00Z"
sport = d["sports"]["nba"]
sport["updated_at"] = d["snapshot_at"]
contest = sport["contests"][0]
contest["state"] = "live"

# Three games: one final, one mid-third-quarter, one not started.
GAMES = {
    "LAL": ("DAL@LAL", "final"), "DAL": ("DAL@LAL", "final"),
    "OKC": ("MIL@OKC", "live"), "MIL": ("MIL@OKC", "live"),
    "POR": ("UTA@POR", "pre"), "UTA": ("UTA@POR", "pre"),
}
LIVE_FRACTION = 0.62  # share of the game played
LIVE_CLOCK = "Q3 4:12"
PRE_CLOCK = "10:00 PM ET"
AVG_MINUTES = 34


def q(x):
    return round(x * 4) / 4


players = {}
for p in sport["players"]:
    final_pts = p["fantasy_points"]
    matchup, phase = GAMES[p["team"]]
    p["matchup"] = matchup
    if phase == "final":
        p["game_status"] = "Final"
        pts, mins_left, clock, proj = final_pts, 0, "Final", final_pts
    elif phase == "live":
        p["game_status"] = "In Progress"
        pts = q(final_pts * LIVE_FRACTION)
        mins_left = round(AVG_MINUTES * (1 - LIVE_FRACTION)) if final_pts > 0 else 0
        clock, proj = LIVE_CLOCK, q(final_pts * random.uniform(0.9, 1.1))
    else:
        p["game_status"] = "Scheduled"
        pts, mins_left, clock = 0.0, AVG_MINUTES if final_pts > 0 else 0, PRE_CLOCK
        proj = q(p["salary"] / 1000 * 5.2)
    p["fantasy_points"] = pts
    p["value"] = round(pts / (p["salary"] / 1000), 2) if p["salary"] else 0
    # Stand-in for DraftKings' valueIcon (dk_results#165) so the prototype can show markers.
    if phase != "pre" and p["value"] >= 6:
        p["value_icon"] = "fire"
    elif phase == "final" and p["ownership_pct"] > 10 and p["value"] < 2.5:
        p["value_icon"] = "ice"
    players[p["name"]] = {**p, "mins_left": mins_left, "clock": clock, "proj": proj, "phase": phase}

# Diversify the three (identical) VIP lineups so the board is interesting.
SWAPS = {
    "Aj_cray": {"Donovan Clingan": "Deni Avdija", "Isaiah Joe": "Shai Gilgeous-Alexander"},
    "cglenn91": {"LeBron James": "Giannis Antetokounmpo", "Brandon Williams": "Lauri Markkanen",
                 "Naji Marshall": "Scoot Henderson"},
}
pool_names = set(players)
for vip in contest["vip_lineups"]:
    swaps = {k: v for k, v in SWAPS.get(vip["display_name"], {}).items() if v in pool_names}
    for slot in vip["slots"]:
        slot["player_name"] = swaps.get(slot["player_name"], slot["player_name"])
    live_rows = []
    for row in vip["players_live"]:
        name = swaps.get(row["player_name"], row["player_name"])
        pl = players[name]
        live_rows.append({
            "slot": row["slot"], "player_name": name, "game_status": pl["game_status"],
            "ownership_pct": pl["ownership_pct"], "salary": pl["salary"], "points": pl["fantasy_points"],
            "value": pl["value"], "value_icon": pl.get("value_icon"), "rt_projection": pl["proj"], "time_remaining_display": pl["clock"],
            "time_remaining_minutes": pl["mins_left"],
            "stats_text": row["stats_text"] if pl["phase"] == "final" and name == row["player_name"]
            else ("" if pl["phase"] == "pre" else "6 REB, 4 AST, 14 PTS"),
        })
    vip["players_live"] = live_rows
    pts = sum(r["points"] for r in live_rows)
    pmr = sum(r["time_remaining_minutes"] for r in live_rows)
    own_left = sum(r["ownership_pct"] for r in live_rows if players[r["player_name"]]["phase"] != "final")
    vip["live"].update({"current_points": pts, "pmr": pmr, "ownership_remaining_pct": round(own_left, 2),
                        "updated_at": d["snapshot_at"]})

# Field standings: shrink totals as if mid-slate, give everyone PMR.
vip_by_key = {v["entry_key"]: v for v in contest["vip_lineups"]}
for row in contest["standings"]:
    if row["entry_key"] in vip_by_key:
        v = vip_by_key[row["entry_key"]]["live"]
        row.update(points=v["current_points"], pmr=v["pmr"], ownership_remaining_pct=v["ownership_remaining_pct"])
    else:
        row["points"] = q(row["points"] * random.uniform(0.42, 0.7))
        row["pmr"] = random.choice(range(60, 200, 2))
        row["ownership_remaining_pct"] = round(random.uniform(120, 420), 2)
contest["standings"].sort(key=lambda r: -r["points"])
for i, row in enumerate(contest["standings"]):
    row["rank"] = i + 1
paid = contest["positions_paid"]
cutoff = contest["standings"][paid - 1]["points"]
for row in contest["standings"]:
    row["is_cashing"] = row["rank"] <= paid
    if row["is_cashing"]:
        row["payout_cents"] = 2000
    else:
        row.pop("payout_cents", None)

contest["live_metrics"]["cash_line"]["points_cutoff"] = cutoff
contest["live_metrics"]["avg_salary_per_player_remaining"] = 5850
contest["live_metrics"]["updated_at"] = d["snapshot_at"]

ranks = {r["entry_key"]: r for r in contest["standings"]}
for vip in contest["vip_lineups"]:
    r = ranks[vip["entry_key"]]
    vip["live"].update(current_rank=r["rank"], is_cashing=r["is_cashing"],
                       cash_line_delta_points=round(r["points"] - cutoff, 2),
                       payout_cents=r.get("payout_cents"))
    vip["payout_cents"] = r.get("payout_cents")

m = contest["metrics"]
m["updated_at"] = d["snapshot_at"]
m["distance_to_cash"] = {"cutoff_points": cutoff, "per_vip": [
    {"display_name": v["display_name"], "entry_key": v["entry_key"], "vip_entry_key": None,
     "points_delta": round(v["live"]["current_points"] - cutoff, 2),
     "rank_delta": paid - v["live"]["current_rank"]} for v in contest["vip_lineups"]]}

leaders = sorted(contest["standings"], key=lambda r: -r["ownership_remaining_pct"])[:10]
contest["ownership_watchlist"]["entries"] = [
    {"entry_key": r["entry_key"], "display_name": r["display_name"], "current_rank": r["rank"],
     "current_points": r["points"], "ownership_remaining_pct": r["ownership_remaining_pct"], "pmr": r["pmr"]}
    for r in leaders]
field_left = round(sum(r["ownership_remaining_pct"] for r in leaders) / len(leaders), 2)
contest["ownership_watchlist"]["ownership_remaining_total_pct"] = field_left

unfinished = sorted((p for p in players.values() if p["phase"] != "final" and p["ownership_pct"] > 0),
                    key=lambda p: -p["ownership_pct"])
vip_names = [{r["player_name"] for r in v["players_live"]} for v in contest["vip_lineups"]]
m["threat"]["field_remaining_pct"] = field_left
m["threat"]["top_swing_players"] = [
    {"player_name": p["name"], "ownership_remaining_pct": p["ownership_pct"],
     "vip_count": sum(p["name"] in s for s in vip_names)} for p in unfinished[:6]]
m["threat"]["vip_vs_field_leverage"] = [
    {"display_name": v["display_name"], "entry_key": v["entry_key"], "vip_entry_key": None,
     "vip_remaining_pct": v["live"]["ownership_remaining_pct"], "field_remaining_pct": field_left,
     "uniqueness_delta_pct": round(field_left - v["live"]["ownership_remaining_pct"], 2)}
    for v in contest["vip_lineups"]]
for row in m["ownership_summary"]["per_vip"]:
    v = vip_by_key[row["entry_key"]]
    row["total_ownership_pct"] = round(sum(r["ownership_pct"] for r in v["players_live"]), 2)
    row["ownership_in_play_pct"] = v["live"]["ownership_remaining_pct"]
non_cash = [r for r in contest["standings"] if not r["is_cashing"]]
m["non_cashing"] = {"users_not_cashing": len(non_cash),
                    "avg_pmr_remaining": round(sum(r["pmr"] for r in non_cash) / len(non_cash), 1),
                    "top_remaining_players": [{"player_name": p["name"], "ownership_remaining_pct": p["ownership_pct"]}
                                              for p in unfinished[:5]]}
for c in contest["train_clusters"]["clusters"]:
    c["avg_pmr"] = random.choice(range(40, 160, 2))
    c["best_points"] = q(c["best_points"] * 0.6)
for ref in m["trains"]["ranked_clusters"]:
    ref["avg_pmr"] = random.choice(range(40, 160, 2))

OUT.write_text(json.dumps(d, indent=1))
print("wrote", OUT.relative_to(ROOT), "cutoff", cutoff,
      [(v["display_name"], v["live"]["current_rank"], v["live"]["current_points"], v["live"]["pmr"])
       for v in contest["vip_lineups"]])
