/// <reference types="node" />
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createEngine, ConstantClock } from "@clockwyrks/simple-2d";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import { game } from "./game";
import { debug } from "./debug";
import {
  point,
  forward,
  title,
  tick,
  startLevel,
  groups,
  speed,
} from "./simulation";
import * as C from "./constants";
import type { VoluteState } from "./game";
const engines: ReturnType<typeof createEngine<VoluteState, typeof debug>>[] =
  [];
beforeAll(() => {
  vi.stubGlobal("OffscreenCanvas", function (w: number, h: number) {
    const canvas = createCanvas(w, h);
    return Object.assign(canvas, { transferToImageBitmap: () => canvas });
  });
  vi.stubGlobal(
    "fetch",
    async (url: string) => new Response(await readFile("public/" + url)),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  // The Node audio host validates loaded bytes; event assertions test cue routing.
  vi.stubGlobal(
    "AudioContext",
    class {
      state = "suspended";
      async decodeAudioData(bytes: ArrayBuffer) {
        expect(bytes.byteLength).toBeGreaterThan(44);
        return { duration: 1 };
      }
    },
  );
});
afterEach(() => {
  engines.splice(0).forEach((e) => e.destroy());
});
async function hall() {
  const target = new EventTarget();
  const engine = createEngine({
    canvas: createCanvas(C.FIELD_W, C.FIELD_H) as unknown as HTMLCanvasElement,
    width: C.FIELD_W,
    height: C.FIELD_H,
    game,
    background: "#0b1b23",
    clock: new ConstantClock(1000 / C.TICK_HZ),
    surface: {
      cssWidth: () => C.FIELD_W,
      cssHeight: () => C.FIELD_H,
      dpr: () => 1,
      events: () => target,
    },
  });
  engines.push(engine);
  await engine.initialize();
  const key = (code: string, type = "keydown") => {
    const e = new Event(type);
    Object.assign(e, { code, repeat: false });
    target.dispatchEvent(e);
  };
  return { engine, key };
}
const quiet = (s: VoluteState) => ({ ...s, emission: false, feed: false });
const step = (s: VoluteState, n = 1) => {
  for (let i = 0; i < n; i++) s = tick(s, () => {});
  return s;
};
describe("channel geometry and authoritative state", () => {
  it("walks every vertex and clamps negative arcs at the inlet", () => {
    expect(point(-42)).toEqual(C.CHANNEL[0]);
    expect(point(880)).toEqual(C.CHANNEL[1]);
    expect(forward(880)).toEqual({ x: 0, y: 1 });
    expect(point(C.PATH_LENGTH)).toEqual(C.CHANNEL[C.CHANNEL.length - 1]);
    expect(forward(C.PATH_LENGTH)).toEqual({ x: -1, y: 0 });
  });
  it("seeds twelve, marks the twelfth, and preserves caller gates and aim", () => {
    const s = startLevel({ ...title(false, false), aim: 123, score: 90 }, 3);
    expect(s.cores).toHaveLength(C.SEEDED_CORES);
    expect(s.cores[0].s).toBe(C.SEEDED_HEAD_S);
    expect(s.cores[11].mark).toBe("choke");
    expect(s.quotaRemaining).toBe(C.LEVELS[2].quota - C.SEEDED_CORES);
    expect(s.aim).toBe(123);
    expect(s.emission).toBe(false);
    expect(s.score).toBe(90);
  });
  it("validates poses and normalizes headings without mutating old values", () => {
    const s = title();
    expect(debug.setAim(s, -90).aim).toBe(270);
    expect(s.aim).toBe(C.AIM_START);
    expect(() => debug.setCells(s, 4)).toThrow();
    expect(() => debug.setPressure(s, -1)).toThrow();
    expect(() => debug.setLevel(s, 1.1)).toThrow();
    expect(() => debug.setScore(s, NaN)).toThrow();
    expect(() => debug.poseTrain(s, [[5001, "halide", null]])).toThrow();
    expect(() => debug.setLoaded(s, "invalid" as C.ChargeId)).toThrow();
    expect(() => debug.grantMachinery(s, "bore" as "choke")).toThrow();
  });
  it("snapshot derives geometry, segment indices, speed and danger immediately", () => {
    let s = debug.poseTrain(title(), [
      [0, "cobalt", null],
      [4100, "halide", null],
      [4072, "sulfur", null],
    ]);
    s = debug.setPressure(s, 50);
    const a = debug.snapshot(s);
    expect(a.train.map((c) => c.segment)).toEqual([0, 0, 1]);
    expect(a.danger).toBe(true);
    expect(a.feedSpeed).toBe(33);
    expect(debug.reconcile(s)).toEqual(s);
    expect(debug.snapshot(s)).toEqual(a);
  });
});
describe("fixed ticks, train and pressure", () => {
  it("moves the lead at feed speed and catches a trailing group at fixed speed", () => {
    let s = debug.poseTrain(startLevel(title(), 1), [
      [500, "halide", null],
      [400, "sulfur", null],
    ]);
    s = { ...s, emission: false };
    const next = step(s);
    expect(next.cores[0].s).toBeCloseTo(500 + 22 / 60);
    expect(next.cores[1].s).toBeCloseTo(403);
    expect(s.cores[0].s).toBe(500);
  });
  it("merges exactly at spacing, extracts the joining run, increments chain and recoils", () => {
    let s = debug.poseTrain(startLevel(title(), 1), [
      [500, "halide", null],
      [472, "halide", null],
      [442, "halide", null],
      [350, "sulfur", null],
    ]);
    s = { ...s, emission: false };
    const next = step(s);
    expect(next.score).toBe(60);
    expect(next.chainStep).toBe(2);
    expect(next.cores).toHaveLength(1);
    expect(next.segments[0].hold).toBeCloseTo(C.RECOIL_HOLD);
    expect(next.cores[0].s).toBe(308);
  });
  it("does not extract a pre-existing triple merely for existing", () => {
    const s = debug.poseTrain(quiet(startLevel(title(), 1)), [
      [200, "halide", null],
      [172, "halide", null],
      [144, "halide", null],
    ]);
    expect(step(s, 30).score).toBe(0);
  });
  it("emits exactly one core, consumes posed charge and cycles marks", () => {
    let s = debug.clearTrain(startLevel(title(), 1));
    s = debug.setQuotaRemaining(s, C.LEVELS[0].quota - 23);
    s = debug.setNextEmitted(s, "garnet");
    s = step(s);
    expect(s.cores).toEqual([{ s: 0, charge: "garnet", mark: "backflow" }]);
    expect(s.nextEmitted).toBeNull();
    const q = s.quotaRemaining;
    expect(step({ ...s, feed: false }, 10).quotaRemaining).toBe(q);
  });
  it("bleeds and rises pressure, and choke scales only feed", () => {
    const cores = Array.from({ length: 34 }, (_, i) => ({
      s: 2000 - i * C.SPACING,
      charge: "halide" as const,
      mark: null,
    }));
    const s = {
      ...quiet(startLevel(title(), 1)),
      cores,
      segments: groups(cores),
      pressure: 10,
    };
    expect(step(s, 60).pressure).toBeCloseTo(10.5);
    expect(step({ ...s, cores: [], segments: [] }, 60).pressure).toBeCloseTo(8);
    expect(speed(debug.grantMachinery(s, "choke"))).toBeCloseTo(22 * 1.1 * 0.4);
  });
  it("backflow packs at the inlet, overrides recoil and expires", () => {
    let s = debug.poseTrain(startLevel(title(), 1), [
      [50, "halide", null],
      [10, "sulfur", null],
    ]);
    s = debug.grantMachinery(s, "backflow");
    s = { ...s, segments: s.segments.map((g) => ({ ...g, hold: 10 })) };
    const next = step(s, 60);
    expect(next.cores.map((c) => c.s)).toEqual([28, 0]);
    expect(next.quotaRemaining).toBe(s.quotaRemaining);
    expect(
      step({ ...next, machinery: { kind: "backflow", remaining: C.TICK_DT } })
        .machinery,
    ).toBeNull();
  });
  it("expires chain and machinery only while ticks run", () => {
    const s = {
      ...quiet(startLevel(title(), 1)),
      chainStep: 4,
      chainTimer: C.TICK_DT,
      machinery: { kind: "choke" as const, remaining: C.TICK_DT },
    };
    const next = step(s);
    expect(next.chainStep).toBe(1);
    expect(next.machinery).toBeNull();
  });
});
describe("shots, extraction and progression", () => {
  it("seats a shot behind on zero dot, extracts and grants marked machinery", () => {
    let s = debug.poseTrain(quiet(startLevel(title(), 1)), [
      [500, "halide", "choke"],
      [472, "halide", null],
      [350, "sulfur", null],
    ]);
    const p = point(472);
    s = {
      ...s,
      projectiles: [
        {
          charge: "halide",
          x: p.x,
          y: p.y - C.STRIKE_DISTANCE - C.PROJECTILE_SPEED * C.TICK_DT,
          angle: 90,
        },
      ],
    };
    const next = step(s);
    expect(next.score).toBe(30);
    expect(next.cores).toHaveLength(1);
    expect(next.chainStep).toBe(1);
    expect(next.machinery?.kind).toBe("choke");
    expect(next.effects.some((e) => e.kind === "pickup")).toBe(true);
  });
  it("bore clears by straight-line radius without granting the marks it removes", () => {
    let s = debug.poseTrain(quiet(startLevel(title(), 1)), [
      [500, "halide", "bore"],
      [472, "halide", null],
      [350, "sulfur", "backflow"],
      [100, "cobalt", null],
    ]);
    const p = point(472);
    s = {
      ...s,
      projectiles: [
        {
          charge: "halide",
          x: p.x,
          y: p.y - C.STRIKE_DISTANCE - C.PROJECTILE_SPEED * C.TICK_DT,
          angle: 90,
        },
      ],
    };
    const next = step(s);
    expect(next.effects.some((e) => e.kind === "bore")).toBe(true);
    expect(next.machinery).toBeNull();
    expect(next.cores.some((c) => c.charge === "cobalt")).toBe(true);
  });
  it("discards shots outside the field", () => {
    const s = {
      ...quiet(startLevel(title(), 1)),
      projectiles: [{ charge: "halide" as const, x: 959, y: 200, angle: 0 }],
    };
    expect(step(s).projectiles).toHaveLength(0);
  });
  it("spends at most one cell and keeps the level and score", () => {
    const s = debug.poseTrain(
      { ...quiet(startLevel(title(), 3)), score: 120 },
      [
        [5000, "halide", null],
        [4972, "sulfur", null],
      ],
    );
    const next = step(s);
    expect(next.cells).toBe(2);
    expect(next.screen).toBe("setback");
    expect(next.cores).toHaveLength(0);
    expect(next.score).toBe(120);
    expect(next.level).toBe(3);
    expect(step({ ...s, cells: 1 }).screen).toBe("gameover");
  });
  it("awards a clear and ends level five without interlude", () => {
    const s = {
      ...quiet(startLevel(title(), 1)),
      cores: [],
      segments: [],
      quotaRemaining: 0,
    };
    expect(step(s).screen).toBe("cleared");
    expect(step(s).score).toBe(C.CLEAR_SCORE);
    expect(step({ ...s, level: 5 }).screen).toBe("victory");
  });
});
describe("engine integration", () => {
  it("loads all genuine assets, registers diagnostics, renders title and starts on Enter", async () => {
    const { engine, key } = await hall();
    expect(engine.state.screen).toBe("title");
    await engine.advance(1);
    key("Enter");
    await engine.advance(1);
    expect(engine.state.screen).toBe("playing");
    expect(engine.diagnostics().length).toBeGreaterThanOrEqual(12);
    expect(engine.debug.version).toBe(C.VOLUTE_DEBUG_VERSION);
  });
  it("routes fire, swap, denied, pause, resume and mute through engine actions", async () => {
    const { engine, key } = await hall();
    engine.apply((s) => debug.startLevel(s, 1));
    const cues: string[] = [];
    engine.events.on("cue:played", (e) => cues.push(e.cue));
    key("Space");
    await engine.advance(1);
    key("Space", "keyup");
    key("Space");
    await engine.advance(1);
    expect(cues).toContain("fire");
    expect(cues).toContain("denied");
    key("KeyX");
    await engine.advance(1);
    expect(cues).toContain("swap");
    key("KeyP");
    await engine.advance(1);
    const cores = engine.state.cores;
    await engine.advance(30);
    expect(engine.state.cores).toEqual(cores);
    expect(engine.state.screen).toBe("paused");
    key("KeyM");
    await engine.advance(1);
    expect(engine.state.muted).toBe(true);
    key("KeyP", "keyup");
    key("Escape");
    await engine.advance(1);
    expect(engine.state.screen).toBe("playing");
  });
  it("switches beds for danger and stops them on pause", async () => {
    const { engine } = await hall();
    const cues: string[] = [];
    engine.events.on("cue:looped", (e) => cues.push(e.cue));
    engine.apply((s) => debug.startLevel(s, 1));
    await engine.advance(1);
    engine.apply((s) => debug.poseTrain(s, [[4100, "halide", null]]));
    await engine.advance(1);
    expect(cues).toEqual(["hall-loop", "danger-loop"]);
    engine.apply(debug.pause);
    await engine.advance(1);
    expect(engine.state.accumulator).toBe(0);
  });
  it("resolves clear and setback interludes, endings and reset gates", async () => {
    const { engine, key } = await hall();
    engine.apply((s) => ({
      ...debug.startLevel(s, 1),
      quotaRemaining: 0,
      cores: [],
      segments: [],
    }));
    await engine.advance(1);
    expect(engine.state.screen).toBe("cleared");
    await engine.advance(120);
    expect(engine.state.level).toBe(2);
    expect(engine.state.screen).toBe("playing");
    engine.apply((s) => ({ ...s, screen: "gameover" }));
    key("Enter");
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
    expect(engine.state.score).toBe(0);
  });
  it("produces identical positions across different frame deltas and holds all timers on pause", async () => {
    const { engine } = await hall();
    engine.apply((s) => debug.setEmission(debug.startLevel(s, 1), false));
    await engine.advance(60);
    const a = engine.state.cores.map((c) => c.s);
    engine.apply((s) => debug.setEmission(debug.startLevel(s, 1), false));
    engine.setClock(new ConstantClock(1000 / 30));
    await engine.advance(30);
    expect(engine.state.cores.map((c) => c.s)).toEqual(a);
    engine.apply(debug.pause);
    const before = engine.state;
    await engine.advance(10);
    expect(engine.state.fireCooldown).toBe(before.fireCooldown);
    expect(engine.state.simTime).toBeGreaterThan(before.simTime);
  });
});
