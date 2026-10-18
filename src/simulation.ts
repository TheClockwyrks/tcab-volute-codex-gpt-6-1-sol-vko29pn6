import * as C from "./constants";
import type { CoreState, SegmentState, VoluteState } from "./game";
import type { DeepReadonly } from "ts-essentials";
export type State = DeepReadonly<VoluteState>;
export interface VisualEffect {
  readonly kind: "extraction" | "bore" | "swallow" | "pickup";
  readonly x: number;
  readonly y: number;
  readonly age: number;
  readonly seed: number;
  readonly charge: C.ChargeId;
}
export type Draft = { -readonly [K in keyof VoluteState]: VoluteState[K] };
export const radians = (n: number) => (n * Math.PI) / 180;
export const normalize = (n: number) => ((n % 360) + 360) % 360;
export const clamp = (n: number, a = C.PRESSURE_MIN, b = C.PRESSURE_MAX) =>
  Math.max(a, Math.min(b, n));
const arcs = C.CHANNEL.map((_, i) =>
  C.CHANNEL.slice(1, i + 1).reduce(
    (n, p, j) => n + Math.hypot(p.x - C.CHANNEL[j].x, p.y - C.CHANNEL[j].y),
    0,
  ),
);
export function forward(s: number) {
  let i = 0;
  while (i < C.CHANNEL.length - 2 && s >= arcs[i + 1]) i++;
  const a = C.CHANNEL[i],
    b = C.CHANNEL[i + 1],
    d = arcs[i + 1] - arcs[i];
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
}
export function point(s: number) {
  let i = 0;
  while (i < C.CHANNEL.length - 2 && s >= arcs[i + 1]) i++;
  const f = forward(s),
    p = C.CHANNEL[i],
    d = Math.max(0, s) - arcs[i];
  return { x: p.x + f.x * d, y: p.y + f.y * d };
}
export function groups(
  cores: readonly CoreState[],
  holds: readonly number[] = [],
): SegmentState[] {
  const out: { count: number; hold: number }[] = [];
  cores.forEach((c, i) => {
    if (i === 0 || Math.abs(cores[i - 1].s - c.s - C.SPACING) > 1e-6)
      out.push({ count: 1, hold: holds[i] ?? 0 });
    else out[out.length - 1].count++;
  });
  return out;
}
export function holds(s: State): number[] {
  return s.segments.flatMap((g) => Array<number>(g.count).fill(g.hold));
}
export const speed = (s: State) =>
  C.LEVELS[s.level - 1].feedSpeed *
  (1 + s.pressure / C.PRESSURE_MAX) *
  (s.machinery?.kind === "choke" ? C.CHOKE_FEED_MULTIPLIER : 1);
export const danger = (s: State) =>
  s.cores.length > 0 && s.cores[0].s >= C.DANGER_S;
export function title(
  emission = true,
  feed = true,
  muted = false,
): VoluteState {
  return {
    screen: "title",
    score: 0,
    level: 1,
    cells: C.CELLS,
    quotaRemaining: C.LEVELS[0].quota,
    pressure: 0,
    chainStep: 1,
    chainTimer: 0,
    machinery: null,
    cores: [],
    segments: [],
    projectiles: [],
    loaded: null,
    queued: null,
    aim: C.AIM_START,
    fireCooldown: 0,
    interlude: 0,
    simTime: 0,
    accumulator: 0,
    emission,
    feed,
    nextEmitted: null,
    muted,
    effects: [],
  };
}
export function drawCharge(s: State): C.ChargeId {
  const set = s.cores.length
    ? [...new Set(s.cores.map((c) => c.charge))]
    : C.LEVELS[s.level - 1].charges;
  return set[Math.floor(Math.random() * set.length)];
}
export function markAt(n: number): C.MachineryKind | null {
  return n > 0 && n % C.MARK_INTERVAL === 0
    ? C.MACHINERY_KINDS[(n / C.MARK_INTERVAL - 1) % C.MACHINERY_KINDS.length]
    : null;
}
export function startLevel(s: State, level: number): VoluteState {
  const base: VoluteState = {
    ...s,
    level,
    screen: "playing",
    cores: [],
    segments: [],
    projectiles: [],
    pressure: 0,
    chainStep: 1,
    chainTimer: 0,
    machinery: null,
    fireCooldown: 0,
    interlude: 0,
    quotaRemaining: C.LEVELS[level - 1].quota - C.SEEDED_CORES,
    effects: [],
  };
  const cores = Array.from({ length: C.SEEDED_CORES }, (_, i) => ({
    charge: drawCharge(base),
    s: C.SEEDED_HEAD_S - i * C.SPACING,
    mark: markAt(i + 1),
  }));
  const next = { ...base, cores, segments: groups(cores) };
  return { ...next, loaded: drawCharge(next), queued: drawCharge(next) };
}
export function fire(s: State): VoluteState {
  return {
    ...s,
    loaded: s.queued ?? drawCharge(s),
    queued: drawCharge(s),
    fireCooldown: C.FIRE_COOLDOWN,
    projectiles: [
      ...s.projectiles,
      {
        charge: s.loaded ?? drawCharge(s),
        x: C.INJECTOR_X,
        y: C.INJECTOR_Y,
        angle: s.aim,
      },
    ],
  };
}
export type Sound = (cue: C.CueName) => void;
export function grant(s: State, kind: C.MachineryKind): VoluteState {
  return kind === "bore"
    ? { ...s }
    : { ...s, machinery: { kind, remaining: C.MACHINERY_DURATIONS[kind] } };
}
function effect(
  s: Draft,
  kind: VisualEffect["kind"],
  p: C.Point,
  charge: C.ChargeId,
) {
  s.effects = [
    ...s.effects,
    {
      kind,
      ...p,
      charge,
      age: 0,
      seed: Math.floor(Math.random() * 0x7fffffff),
    },
  ];
}
/** Remove as one event, recoil independent trailing groups using their original room. */
function remove(
  s: Draft,
  indices: Set<number>,
  tracking?: Map<CoreState, number>,
) {
  if (!indices.size) return;
  const oldHolds = holds(s),
    front = Math.max(...[...indices].map((i) => s.cores[i].s));
  const cores = s.cores.filter((_, i) => !indices.has(i));
  const hs = oldHolds.filter((_, i) => !indices.has(i));
  const gs = groups(cores, hs);
  let offset = 0;
  const next = [...cores];
  gs.forEach((g) => {
    const end = offset + g.count - 1;
    if (cores[offset].s < front) {
      const room = Math.min(
        cores[end].s,
        cores[end + 1] ? cores[end].s - cores[end + 1].s - C.SPACING : C.RECOIL,
      );
      const moved = clamp(room, 0, C.RECOIL);
      for (let i = offset; i <= end; i++) {
        next[i] = { ...cores[i], s: cores[i].s - moved };
        if (tracking?.has(cores[i]))
          tracking.set(next[i], tracking.get(cores[i])!);
        hs[i] = C.RECOIL_HOLD;
      }
    }
    offset = end + 1;
  });
  s.cores = next;
  s.segments = groups(next, hs);
  s.pressure = clamp(s.pressure - indices.size * C.PRESSURE_DROP_PER_CORE);
}
function extract(
  s: Draft,
  index: number,
  merge: boolean,
  sound: Sound,
  pending: CoreState[],
  tracking?: Map<CoreState, number>,
) {
  const c = s.cores[index];
  if (!c) return;
  let a = index,
    b = index;
  while (
    a > 0 &&
    s.cores[a - 1].charge === c.charge &&
    Math.abs(s.cores[a - 1].s - s.cores[a].s - C.SPACING) < 1e-6
  )
    a--;
  while (
    b < s.cores.length - 1 &&
    s.cores[b + 1].charge === c.charge &&
    Math.abs(s.cores[b].s - s.cores[b + 1].s - C.SPACING) < 1e-6
  )
    b++;
  if (b - a + 1 < C.MIN_RUN) return;
  const removed = s.cores.slice(a, b + 1);
  s.chainStep = merge ? s.chainStep + 1 : 1;
  s.chainTimer = C.CHAIN_RESET;
  s.score += C.SCORE_PER_CORE * removed.length * s.chainStep;
  sound(C.EXTRACT_CUES[Math.min(s.chainStep, C.EXTRACT_CUES.length) - 1]);
  removed.forEach((core) =>
    effect(s, "extraction", point(core.s), core.charge),
  );
  remove(
    s,
    new Set(Array.from({ length: b - a + 1 }, (_, i) => a + i)),
    tracking,
  );
  pending.push(...removed.filter((core) => core.mark));
}
function resolveGrants(s: Draft, pending: CoreState[], sound: Sound) {
  for (const core of pending) {
    if (!core.mark) continue;
    sound(C.CUES.machinery);
    effect(s, "pickup", point(core.s), core.charge);
    if (core.mark === "bore") {
      const p = point(core.s),
        hit = new Set<number>();
      s.cores.forEach((other, i) => {
        const q = point(other.s);
        if (Math.hypot(p.x - q.x, p.y - q.y) <= C.BORE_RADIUS) hit.add(i);
      });
      effect(s, "bore", p, core.charge);
      s.score += hit.size * C.SCORE_PER_CORE * s.chainStep;
      remove(s, hit);
    } else
      s.machinery = {
        kind: core.mark,
        remaining: C.MACHINERY_DURATIONS[core.mark],
      };
  }
}
function advance(s: Draft, sound: Sound, pending: CoreState[]) {
  if (!s.feed) return;
  if (s.machinery?.kind === "backflow") {
    const next = [...s.cores];
    for (let i = next.length - 1; i >= 0; i--) {
      const c = next[i];
      if (c.s < 0) continue;
      next[i] = {
        ...c,
        s: Math.max(
          c.s - C.BACKFLOW_SPEED * C.TICK_DT,
          i === next.length - 1 ? 0 : next[i + 1].s + C.SPACING,
        ),
      };
    }
    s.cores = next;
    s.segments = groups(next, holds(s));
    return;
  }
  // Keep the original segment's core identities while joins and removals alter indices.
  const tracking = new Map<CoreState, number>();
  const original: CoreState[][] = [];
  let offset = 0;
  s.segments.forEach((g) => {
    original.push(s.cores.slice(offset, offset + g.count));
    offset += g.count;
  });
  original.forEach((cores, g) => cores.forEach((c) => tracking.set(c, g)));
  for (let g = 0; g < original.length; g++) {
    const head = s.cores.find((c) => tracking.get(c) === g);
    if (!head) continue;
    const start = s.cores.indexOf(head),
      members = s.cores.filter((c) => tracking.get(c) === g);
    if (!members.length) continue;
    const hs = holds(s);
    let delta =
      hs[start] > 0 ? 0 : (g === 0 ? speed(s) : C.CATCHUP_SPEED) * C.TICK_DT;
    const ahead = s.cores[start - 1];
    const join = !!ahead && head.s + delta >= ahead.s - C.SPACING - 1e-6;
    if (join) delta = ahead.s - C.SPACING - head.s;
    const memberSet = new Set(members);
    const next = s.cores.map((c, i) => {
      if (!memberSet.has(c)) return c;
      if (join) hs[i] = hs[start - 1];
      const moved = { ...c, s: c.s + delta };
      tracking.set(moved, g);
      return moved;
    });
    s.cores = next;
    s.segments = groups(next, hs);
    if (join && ahead.charge === s.cores[start].charge)
      extract(s, start, true, sound, pending, tracking);
  }
}
export function tick(state: State, sound: Sound): VoluteState {
  const s: Draft = { ...state };
  s.fireCooldown = Math.max(0, s.fireCooldown - C.TICK_DT);
  s.chainTimer = Math.max(0, s.chainTimer - C.TICK_DT);
  if (s.chainTimer < 1e-9) {
    s.chainTimer = 0;
    s.chainStep = 1;
  }
  s.segments = s.segments.map((g) => ({
    ...g,
    hold: g.hold - C.TICK_DT < 1e-9 ? 0 : g.hold - C.TICK_DT,
  }));
  if (s.machinery) {
    const remaining = s.machinery.remaining - C.TICK_DT;
    s.machinery = remaining > 1e-9 ? { ...s.machinery, remaining } : null;
  }
  const pending: CoreState[] = [];
  advance(s, sound, pending);
  const flying = [];
  for (const projectile of s.projectiles) {
    const angle = radians(projectile.angle),
      p = {
        ...projectile,
        x: projectile.x + Math.cos(angle) * C.PROJECTILE_SPEED * C.TICK_DT,
        y: projectile.y + Math.sin(angle) * C.PROJECTILE_SPEED * C.TICK_DT,
      };
    if (p.x < 0 || p.x > C.FIELD_W || p.y < 0 || p.y > C.FIELD_H) continue;
    let hit = -1,
      best = Infinity;
    s.cores.forEach((c, i) => {
      const q = point(c.s),
        d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d <= C.STRIKE_DISTANCE && d < best) {
        hit = i;
        best = d;
      }
    });
    if (hit >= 0) {
      const c = s.cores[hit],
        q = point(c.s),
        f = forward(c.s),
        pos =
          c.s + ((p.x - q.x) * f.x + (p.y - q.y) * f.y > 0 ? 0 : -C.SPACING);
      const hs = holds(s),
        insert = s.cores.filter((c) => c.s > pos).length;
      const next = s.cores.map((c) =>
        c.s <= pos ? { ...c, s: c.s - C.SPACING } : c,
      );
      next.splice(insert, 0, { charge: p.charge, s: pos, mark: null });
      hs.splice(insert, 0, hs[hit] ?? 0);
      s.cores = next;
      s.segments = groups(next, hs);
      sound(C.CUES.seat);
      extract(s, insert, false, sound, pending);
    } else if (p.x >= 0 && p.x <= C.FIELD_W && p.y >= 0 && p.y <= C.FIELD_H)
      flying.push(p);
  }
  s.projectiles = flying;
  resolveGrants(s, pending, sound);
  s.pressure = clamp(
    s.pressure +
      (Math.max(0, s.cores.length - C.PRESSURE_FREE) *
        C.PRESSURE_RISE_PER_CORE -
        (s.cores.length <= C.PRESSURE_FREE ? C.PRESSURE_BLEED : 0)) *
        C.TICK_DT,
  );
  if (s.cores[0]?.s >= C.INTAKE_S) {
    sound(C.CUES.intake);
    sound(C.CUES.cellLost);
    effect(s, "swallow", point(C.INTAKE_S), s.cores[0].charge);
    s.cells = Math.max(0, s.cells - 1);
    s.screen = s.cells ? "setback" : "gameover";
    s.interlude = s.cells ? C.INTERLUDE : 0;
    s.cores = [];
    s.segments = [];
    s.projectiles = [];
    s.pressure = 0;
    s.machinery = null;
    s.chainStep = 1;
    s.chainTimer = 0;
    s.quotaRemaining = C.LEVELS[s.level - 1].quota - C.SEEDED_CORES;
  } else if (s.quotaRemaining === 0 && s.cores.length === 0) {
    s.score += C.CLEAR_SCORE;
    sound(C.CUES.levelClear);
    s.screen = s.level === C.LEVEL_COUNT ? "victory" : "cleared";
    s.interlude = s.screen === "cleared" ? C.INTERLUDE : 0;
  }
  if (
    s.screen === "playing" &&
    s.emission &&
    s.machinery?.kind !== "backflow" &&
    s.quotaRemaining > 0 &&
    (!s.cores.length || s.cores[s.cores.length - 1].s >= C.SPACING)
  ) {
    const core = {
      charge: s.nextEmitted ?? drawCharge(s),
      s: 0,
      mark: markAt(C.LEVELS[s.level - 1].quota - s.quotaRemaining + 1),
    };
    s.cores = [...s.cores, core];
    s.segments = groups(s.cores, [...holds(s), 0]);
    s.quotaRemaining--;
    s.nextEmitted = null;
  }
  return s;
}
