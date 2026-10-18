import * as C from "./constants";
import {
  title,
  startLevel,
  fire,
  grant,
  groups,
  point,
  normalize,
  speed,
  danger,
  holds,
} from "./simulation";
import type { State } from "./simulation";
import type { VoluteState } from "./game";
function number(n: number, min = -Infinity, max = Infinity, integer = false) {
  if (
    typeof n !== "number" ||
    !Number.isFinite(n) ||
    n < min ||
    n > max ||
    (integer && !Number.isInteger(n))
  )
    throw new RangeError(`Invalid number: ${n}`);
  return n;
}
function member<T extends string>(n: T, values: readonly T[]): T {
  if (!values.includes(n)) throw new RangeError(`Unknown value: ${n}`);
  return n;
}
function boolean(n: boolean) {
  if (typeof n !== "boolean") throw new TypeError("Expected boolean");
  return n;
}
export const debug = {
  version: C.VOLUTE_DEBUG_VERSION,
  reset: (s: State) => title(s.emission, s.feed, s.muted),
  reconcile: (s: State): VoluteState => ({
    ...s,
    segments: groups(s.cores, holds(s)),
  }),
  snapshot: (s: State) => {
    const segments = groups(s.cores, holds(s));
    let segment = 0,
      left = segments[0]?.count ?? 0;
    return {
      version: C.VOLUTE_DEBUG_VERSION,
      screen: s.screen,
      score: s.score,
      level: s.level,
      cells: s.cells,
      quotaRemaining: s.quotaRemaining,
      emitted: C.LEVELS[s.level - 1].quota - s.quotaRemaining,
      pressure: s.pressure,
      feedSpeed: speed(s),
      chainStep: s.chainStep,
      chainTimer: s.chainTimer,
      interlude: s.interlude,
      danger: danger(s),
      train: s.cores.map((c) => {
        if (left === 0) {
          segment++;
          left = segments[segment].count;
        }
        left--;
        return { ...c, ...point(c.s), segment };
      }),
      segments,
      injector: {
        aim: s.aim,
        cooldown: s.fireCooldown,
        loaded: s.loaded,
        queued: s.queued,
      },
      projectiles: s.projectiles.map((p) => ({ ...p })),
      machinery: s.machinery ? { ...s.machinery } : null,
      emission: s.emission,
      feed: s.feed,
      nextEmitted: s.nextEmitted,
      muted: s.muted,
      simTime: s.simTime,
    };
  },
  setScreen: (s: State, screen: C.ScreenName): VoluteState => ({
    ...s,
    screen: member(screen, C.SCREENS),
  }),
  setLevel: (s: State, level: number): VoluteState => ({
    ...s,
    level: number(level, 1, C.LEVEL_COUNT, true),
  }),
  setScore: (s: State, score: number): VoluteState => ({
    ...s,
    score: number(score, 0, Infinity, true),
  }),
  setCells: (s: State, cells: number): VoluteState => ({
    ...s,
    cells: number(cells, 0, C.CELLS, true),
  }),
  setChainStep: (s: State, chainStep: number): VoluteState => ({
    ...s,
    chainStep: number(chainStep, 1, Infinity, true),
    chainTimer: C.CHAIN_RESET,
  }),
  startLevel: (s: State, level: number) =>
    startLevel(s, number(level, 1, C.LEVEL_COUNT, true)),
  poseTrain: (
    s: State,
    cores: readonly (readonly [number, C.ChargeId, C.MachineryKind | null])[],
  ): VoluteState => {
    const next = cores
      .map(([arc, charge, mark]) => ({
        s: number(arc, -Infinity, C.PATH_LENGTH),
        charge: member(charge, C.CHARGE_IDS),
        mark: mark === null ? null : member(mark, C.MACHINERY_KINDS),
      }))
      .sort((a, b) => b.s - a.s);
    return { ...s, cores: next, segments: groups(next) };
  },
  clearTrain: (s: State): VoluteState => ({
    ...s,
    cores: [],
    segments: [],
    projectiles: [],
  }),
  setLoaded: (s: State, loaded: C.ChargeId): VoluteState => ({
    ...s,
    loaded: member(loaded, C.CHARGE_IDS),
  }),
  setQueued: (s: State, queued: C.ChargeId): VoluteState => ({
    ...s,
    queued: member(queued, C.CHARGE_IDS),
  }),
  setAim: (s: State, angleDegrees: number): VoluteState => ({
    ...s,
    aim: normalize(number(angleDegrees)),
  }),
  fire: (s: State) => fire({ ...s, fireCooldown: 0 }),
  setPressure: (s: State, pressure: number): VoluteState => ({
    ...s,
    pressure: number(pressure, C.PRESSURE_MIN, C.PRESSURE_MAX),
  }),
  setQuotaRemaining: (s: State, quotaRemaining: number): VoluteState => ({
    ...s,
    quotaRemaining: number(quotaRemaining, 0, Infinity, true),
  }),
  setEmission: (s: State, emission: boolean): VoluteState => ({
    ...s,
    emission: boolean(emission),
  }),
  setFeed: (s: State, feed: boolean): VoluteState => ({
    ...s,
    feed: boolean(feed),
  }),
  setNextEmitted: (s: State, nextEmitted: C.ChargeId | null): VoluteState => ({
    ...s,
    nextEmitted:
      nextEmitted === null ? null : member(nextEmitted, C.CHARGE_IDS),
  }),
  grantMachinery: (s: State, kind: Exclude<C.MachineryKind, "bore">) =>
    grant(s, member(kind, ["choke", "backflow", "sightline"])),
  pause: (s: State): VoluteState => ({ ...s, screen: "paused" }),
  resume: (s: State): VoluteState => ({ ...s, screen: "playing" }),
};
