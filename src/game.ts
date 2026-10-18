import type { ChargeId, MachineryKind, ScreenName } from "./constants";

export type { ChargeId, MachineryKind, ScreenName };

export interface CoreState {
  readonly charge: ChargeId;
  readonly s: number;
  readonly mark: MachineryKind | null;
}

export interface SegmentState {
  readonly count: number;
  readonly hold: number;
}

export interface ProjectileState {
  readonly charge: ChargeId;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

export interface MachineryState {
  readonly kind: MachineryKind;
  readonly remaining: number;
}

export interface VoluteState {
  readonly effects: readonly import("./simulation").VisualEffect[];
  readonly screen: ScreenName;

  readonly score: number;
  readonly level: number;
  readonly cells: number;
  readonly quotaRemaining: number;

  readonly pressure: number;
  readonly chainStep: number;
  readonly chainTimer: number;
  readonly machinery: MachineryState | null;

  readonly cores: readonly CoreState[];
  readonly segments: readonly SegmentState[];
  readonly projectiles: readonly ProjectileState[];

  readonly loaded: ChargeId | null;
  readonly queued: ChargeId | null;
  readonly aim: number;
  readonly fireCooldown: number;

  readonly interlude: number;
  readonly simTime: number;
  readonly accumulator: number;
  readonly emission: boolean;
  readonly feed: boolean;
  readonly nextEmitted: ChargeId | null;
  readonly muted: boolean;
}

import type { Game } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import { debug } from "./debug";
import {
  title,
  startLevel,
  fire,
  tick,
  normalize,
  danger,
  speed,
} from "./simulation";
import { loadAssets, render, BACKGROUND } from "./presentation";
export { BACKGROUND };
export type VoluteDebugApi = typeof debug;
export const game: Game<VoluteState, VoluteDebugApi> = {
  async initialize(api) {
    C.ACTIONS.forEach((name) =>
      api.input.register(name, { keys: [...C.BINDINGS[name]] }),
    );
    await loadAssets(api);
    api.diagnostics.register("screen", (s) => s.screen);
    api.diagnostics.register("level / score", (s) => `${s.level} / ${s.score}`);
    api.diagnostics.register("cells", (s) => s.cells);
    api.diagnostics.register("quota remaining", (s) => s.quotaRemaining);
    api.diagnostics.register(
      "pressure / feed",
      (s) => `${s.pressure.toFixed(1)} / ${speed(s).toFixed(1)}`,
    );
    api.diagnostics.register("chain", (s) => s.chainStep);
    api.diagnostics.register(
      "cores / head",
      (s) => `${s.cores.length} / ${s.cores[0]?.s.toFixed(1) ?? "-"}`,
    );
    api.diagnostics.register("segments", (s) => s.segments.length);
    api.diagnostics.register("danger", danger);
    api.diagnostics.register(
      "injector",
      (s) =>
        `${s.loaded} / ${s.queued} @ ${s.aim.toFixed(0)} / ${s.fireCooldown.toFixed(2)}`,
    );
    api.diagnostics.register("projectiles", (s) => s.projectiles.length);
    api.diagnostics.register("machinery", (s) =>
      s.machinery
        ? `${s.machinery.kind} ${s.machinery.remaining.toFixed(1)}`
        : "none",
    );
    return [title(), debug];
  },
  update(state, api, dt) {
    let s: VoluteState = {
      ...state,
      simTime: state.simTime + dt,
      muted: api.audio.muted(),
    };
    if (api.input.pressed("mute")) {
      api.audio.setMuted(!s.muted);
      s = { ...s, muted: api.audio.muted() };
    }
    const pointer = api.input.pointer(),
      clicked =
        api.input.pointerPressed() &&
        pointer.x >= 0 &&
        pointer.x <= C.FIELD_W &&
        pointer.y >= 0 &&
        pointer.y <= C.FIELD_H;
    const confirm = api.input.pressed("confirm") || clicked;
    if (["title", "gameover", "victory"].includes(s.screen) && confirm) {
      s =
        s.screen === "title"
          ? startLevel(s, 1)
          : title(s.emission, s.feed, s.muted);
    } else if (
      (s.screen === "playing" || s.screen === "paused") &&
      api.input.pressed("pause")
    )
      s = { ...s, screen: s.screen === "playing" ? "paused" : "playing" };
    else if (s.screen === "playing") {
      let aim = s.aim;
      if (
        api.input.pointerSamples().length &&
        (pointer.x !== C.INJECTOR_X || pointer.y !== C.INJECTOR_Y)
      )
        aim = normalize(
          (Math.atan2(pointer.y - C.INJECTOR_Y, pointer.x - C.INJECTOR_X) *
            180) /
            Math.PI,
        );
      aim = normalize(
        aim +
          (api.input.value("right") - api.input.value("left")) *
            C.AIM_TURN_RATE *
            dt,
      );
      s = { ...s, aim };
      if (api.input.pressed("b")) {
        s = { ...s, loaded: s.queued, queued: s.loaded };
        api.audio.play(C.CUES.swap);
      }
      if (api.input.pressed("a") || clicked) {
        if (s.fireCooldown > 0) api.audio.play(C.CUES.denied);
        else {
          s = fire(s);
          api.audio.play(C.CUES.fire);
        }
      }
    }
    const advancing =
      s.screen === "playing" ||
      s.screen === "cleared" ||
      s.screen === "setback";
    if (advancing) {
      let acc = s.accumulator + dt;
      while (acc + 1e-10 >= C.TICK_DT) {
        acc -= C.TICK_DT;
        if (s.screen === "playing") {
          s = {
            ...s,
            effects: s.effects
              .map((e) => ({ ...e, age: e.age + C.TICK_DT }))
              .filter((e) => e.age < 1),
          };
          const sounds = new Set<C.CueName>();
          s = tick(s, (cue) => sounds.add(cue));
          sounds.forEach((cue) => api.audio.play(cue));
        } else if (s.screen === "cleared" || s.screen === "setback") {
          const remaining = Math.max(0, s.interlude - C.TICK_DT);
          s = { ...s, interlude: remaining };
          if (remaining < 1e-9)
            s = startLevel(s, s.level + (s.screen === "cleared" ? 1 : 0));
        } else {
          acc = 0;
          break;
        }
      }
      s = { ...s, accumulator: Math.max(0, acc) };
    } else s = { ...s, accumulator: 0 };
    if (!["playing", "cleared", "setback"].includes(s.screen))
      s = { ...s, accumulator: 0 };
    const bed =
      s.screen === "playing"
        ? danger(s)
          ? C.CUES.dangerLoop
          : C.CUES.hallLoop
        : null;
    C.LOOPING_CUES.forEach((cue) => {
      if (cue === bed) {
        if (!api.audio.looping(cue)) api.audio.loop(cue);
      } else if (api.audio.looping(cue)) api.audio.stop(cue);
    });
    return s;
  },
  render,
};
