import { normalizeContestState } from './contestDisplay'
import {
  interpretSnapshot,
  type InterpretedSnapshot,
  isSupportedSnapshot,
  type LiveSport as SportSnapshot,
} from './interpretedSnapshot'
import type { LiveModelResult, LiveNotRenderableReason } from './liveModelTypes'
import { buildPool, buildTotalOwnership, indexPool } from './livePlayers'
import { buildFieldRemaining, buildOwnershipLeaders, buildStandings, buildThreat } from './liveSections'
import { buildTrains } from './liveTrains'
import { buildVips } from './liveVips'
import { numberOrNull } from './playerPool'

export type {
  GameStatus,
  LiveCashLine,
  LiveContestHeader,
  LiveDistanceToCash,
  LiveFieldRemaining,
  LiveLineupPlayer,
  LiveModel,
  LiveModelResult,
  LiveNotRenderableReason,
  LiveOwnershipLeader,
  LiveOwnershipLeaders,
  LivePoolPlayer,
  LiveStandingsRow,
  LiveSwingPlayer,
  LiveThreat,
  LiveTotalOwnership,
  LiveTrain,
  LiveTrainCloseness,
  LiveTrains,
  LiveTrainVipOverlap,
  LiveVip,
  LiveVipLeverage,
  LiveVipTrainOverlap,
  Section,
} from './liveModelTypes'
export type { PlayerRef } from './livePlayers'
export { classifyGameStatus, isSamePlayer, LOCKED_SLOT_DETAIL } from './livePlayers'
export { largestTrains, TRAIN_NOTICE_MIN_SHARED } from './liveTrains'

function notRenderable(reason: LiveNotRenderableReason): LiveModelResult {
  return { kind: 'not-renderable', reason }
}

/** Match the configured primary contest by key, then by id. */
export function resolvePrimaryContest<T extends { contest_key: string; contest_id: string }>(
  contests: T[],
  configured: NonNullable<SportSnapshot['primary_contest']>,
): T | null {
  return (
    contests.find((contest) => contest.contest_key === configured.contest_key) ??
    contests.find((contest) => contest.contest_id === configured.contest_id) ??
    null
  )
}

/** The only snapshot schema the dashboard reads (ADR 0002). */
export const SUPPORTED_SCHEMA_VERSION = 3

export function buildLiveModel(snapshot: unknown, sportKey: string): LiveModelResult {
  return buildInterpretedLiveModel(interpretSnapshot(snapshot), sportKey)
}

/** Already interpreted input, also used to trace only actual model consumption. */
export function buildInterpretedLiveModel(snapshot: InterpretedSnapshot, sportKey: string): LiveModelResult {
  if (!isSupportedSnapshot(snapshot)) {
    return notRenderable({ kind: 'unsupported-schema', version: numberOrNull(snapshot.schema_version) })
  }
  const sportData = snapshot.sports[sportKey]
  if (!sportData) {
    return notRenderable({ kind: 'sport-missing' })
  }
  const configured = sportData.primary_contest
  if (!configured) {
    return notRenderable({ kind: 'no-primary-contest' })
  }
  const contest = resolvePrimaryContest(sportData.contests, configured)
  if (!contest) {
    return notRenderable({ kind: 'primary-contest-missing' })
  }
  const cashLine = contest.live_metrics?.cash_line
  const standings = buildStandings(contest)
  const pool = {
    byName: indexPool(sportData.players, (player) => player.name),
    byKey: indexPool(sportData.players, (player) => player.player_key),
  }
  const trains = buildTrains(contest, pool.byName, standings)
  return {
    kind: 'ready',
    model: {
      sport: sportKey,
      snapshotAt: snapshot.snapshot_at,
      contest: {
        name: contest.name,
        state: normalizeContestState(contest.state),
        startTime: contest.start_time || null,
      },
      fieldSize: numberOrNull(contest.max_entries),
      cashLine: { points: numberOrNull(cashLine?.points_cutoff), rank: numberOrNull(cashLine?.rank_cutoff) },
      vips: buildVips(contest, trains, pool),
      pool: buildPool(sportData, contest),
      totalOwnership: buildTotalOwnership(sportData.players),
      fieldOwnershipRemaining: buildFieldRemaining(contest),
      trains,
      standings,
      ownershipLeaders: buildOwnershipLeaders(contest),
      threat: buildThreat(contest),
    },
  }
}
