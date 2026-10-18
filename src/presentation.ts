import type { InitApi, RenderApi } from "@clockwyrks/simple-2d";
import { ParticleCanvasPlayer } from "@clockwyrks/particle-runtime/canvas";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import type { VoluteState } from "./game";
import { point, radians, danger } from "./simulation";
import type { State } from "./simulation";
export const BACKGROUND = "#0b1b23";
export const COLORS: Record<C.ChargeId, string> = {
  halide: "#62e4ce",
  sulfur: "#ffd16a",
  cobalt: "#7cafff",
  garnet: "#ff7588",
  olivine: "#b5e66b",
};
const images: Record<string, ImageBitmap> = {};
const systems: Record<string, ParticleSystem> = {};
const tintedFlashes: Record<string, ImageBitmap> = {};
const imageNames = [
  ...C.CHARGE_IDS.map((n) => "core-" + n),
  ...C.MACHINERY_KINDS.map((n) => "mark-" + n),
  "injector-base",
  "injector-barrel",
  "intake-maw",
  "channel-plate",
  "hud-cell",
  "hud-pressure",
  ...Array.from({ length: 4 }, (_, i) => "recoil-" + i),
  ...Array.from({ length: 6 }, (_, i) => "swallow-" + i),
  ...Array.from({ length: 6 }, (_, i) => "flash-" + i),
];
export async function loadAssets(api: InitApi<VoluteState>) {
  await Promise.all([
    ...imageNames.map(async (n) => {
      images[n] = await api.assets.loadImage(n + ".png");
    }),
    ...Object.values(C.CUES).map((n) => api.audio.load(n, n + ".wav")),
    ...["extraction", "bore", "swallow", "pickup"].map(async (n) => {
      const blob = await api.assets.load(n + ".system.json");
      systems[n] = JSON.parse(await blob.text()) as ParticleSystem;
    }),
  ]);
  prepareFlashes();
}
function prepareFlashes() {
  for (const charge of C.CHARGE_IDS) {
    for (let frame = 0; frame < 6; frame++) {
      const canvas = new OffscreenCanvas(48, 48);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Unable to prepare extraction frames");
      ctx.drawImage(images["flash-" + frame], 0, 0);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = COLORS[charge];
      ctx.fillRect(0, 0, 48, 48);
      tintedFlashes[charge + frame] = canvas.transferToImageBitmap();
    }
  }
}
function image(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
) {
  const i = images[name];
  if (i)
    ctx.drawImage(i, Math.round(x - i.width / 2), Math.round(y - i.height / 2));
}
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 12,
  color = "#aec4c5",
  align: CanvasTextAlign = "left",
) {
  ctx.font = `${size >= 30 ? "600" : "500"} ${size}px ${size >= 30 ? "Georgia" : "monospace"}`;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}
function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.fillStyle = "#10262fee";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#3b555a";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = "#d4aa6e";
  ctx.fillRect(x, y, 3, Math.min(h, 18));
}
function core(
  ctx: CanvasRenderingContext2D,
  charge: C.ChargeId | null,
  x: number,
  y: number,
) {
  if (charge) image(ctx, "core-" + charge, x, y);
}
function hall(ctx: CanvasRenderingContext2D, s: State) {
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
  // Architectural joints and narrow service lines behind the winding raceway.
  ctx.strokeStyle = "#142c35";
  ctx.lineWidth = 1;
  for (let x = 0; x < C.FIELD_W; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, C.FIELD_H);
    ctx.stroke();
  }
  for (let y = 0; y < C.FIELD_H; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(C.FIELD_W, y);
    ctx.stroke();
  }
  ctx.save();
  ctx.beginPath();
  C.CHANNEL.forEach((p, i) =>
    i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
  );
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = 42;
  ctx.strokeStyle = "#061319";
  ctx.stroke();
  ctx.lineWidth = 34;
  ctx.strokeStyle = "#64716a";
  ctx.stroke();
  ctx.lineWidth = 30;
  ctx.strokeStyle = "#243c43";
  ctx.stroke();
  // The authored tile follows each leg; clip to the channel so corners join cleanly.
  ctx.beginPath();
  C.CHANNEL.forEach((p, i) =>
    i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
  );
  ctx.lineWidth = 28;
  ctx.strokeStyle =
    ctx.createPattern(images["channel-plate"], "repeat") ?? "#243c43";
  ctx.stroke();
  ctx.setLineDash([2, 30]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#a78d60";
  ctx.stroke();
  ctx.restore();
  for (let arc = 70; arc < C.PATH_LENGTH - 70; arc += 128) {
    const p = point(arc);
    ctx.fillStyle = "#78918a";
    ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
  }
  text(ctx, "INLET / 01", 40, 17, 9, "#d4aa6e");
  text(ctx, "GEOTHERMAL EXTRACTION WORKS", 155, 77, 10, "#65858b");
  text(ctx, "V / 07", 875, 470, 11, "#65858b");
  text(ctx, "VOLUTE   •   PUMP HALL", 140, 532, 10, "#5c7c83");
  text(ctx, "M  SOUND     P  PAUSE", 915, 532, 10, "#5c7c83", "right");
  // Low service piping accent, outside the playable channel.
  ctx.strokeStyle = "#294650";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(660, 270);
  ctx.lineTo(764, 270);
  ctx.lineTo(764, 360);
  ctx.stroke();
  text(ctx, "INTAKE", 480, 367, 9, "#a28e75", "center");
  image(ctx, "intake-maw", 480, 320);
  s.cores.forEach((c) => {
    const p = point(c.s);
    core(ctx, c.charge, p.x, p.y);
    if (c.mark) image(ctx, "mark-" + c.mark, p.x, p.y);
  });
  if (s.machinery?.kind === "sightline") {
    const dx = Math.cos(radians(s.aim)),
      dy = Math.sin(radians(s.aim));
    let end = Infinity;
    for (const [v, d, limit] of [
      [C.INJECTOR_X, dx, C.FIELD_W],
      [C.INJECTOR_Y, dy, C.FIELD_H],
    ]) {
      if (d > 0) end = Math.min(end, (limit - v) / d);
      else if (d < 0) end = Math.min(end, -v / d);
    }
    for (const c of s.cores) {
      const p = point(c.s),
        x = p.x - C.INJECTOR_X,
        y = p.y - C.INJECTOR_Y,
        t = x * dx + y * dy,
        perp = x * x + y * y - t * t;
      if (t > 0 && perp <= C.CORE_RADIUS ** 2)
        end = Math.min(end, t - Math.sqrt(C.CORE_RADIUS ** 2 - perp));
    }
    ctx.strokeStyle = "#baf7c9";
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(C.INJECTOR_X, C.INJECTOR_Y);
    ctx.lineTo(C.INJECTOR_X + dx * end, C.INJECTOR_Y + dy * end);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  image(ctx, "injector-base", C.INJECTOR_X, C.INJECTOR_Y);
  ctx.save();
  ctx.translate(C.INJECTOR_X, C.INJECTOR_Y);
  ctx.rotate(radians(s.aim));
  if (s.fireCooldown > 0) {
    const frame = Math.min(
      3,
      Math.floor(((C.FIRE_COOLDOWN - s.fireCooldown) / C.FIRE_COOLDOWN) * 4),
    );
    image(ctx, "recoil-" + frame, 15, 0);
  } else image(ctx, "injector-barrel", 15, 0);
  ctx.restore();
  core(ctx, s.loaded, C.INJECTOR_X, C.INJECTOR_Y);
  s.projectiles.forEach((p) => {
    ctx.save();
    ctx.shadowColor = COLORS[p.charge];
    ctx.shadowBlur = 12;
    core(ctx, p.charge, p.x, p.y);
    ctx.restore();
  });
  for (const stored of s.effects) {
    const e = {
      ...stored,
      age:
        stored.age + (s.screen === "setback" ? C.INTERLUDE - s.interlude : 0),
    };
    if (e.age >= 1) continue;
    if (e.kind === "extraction" && e.age < C.RECOIL_HOLD) {
      ctx.save();
      ctx.globalAlpha = 1 - e.age / C.RECOIL_HOLD;
      const frame = Math.min(5, Math.floor((e.age / C.RECOIL_HOLD) * 6));
      ctx.drawImage(tintedFlashes[e.charge + frame], e.x - 24, e.y - 24);
      ctx.restore();
    }
    if (e.kind === "swallow" && e.age < 0.6)
      image(
        ctx,
        "swallow-" + Math.min(5, Math.floor((e.age / 0.6) * 6)),
        e.x,
        e.y,
      );
    const system = systems[e.kind];
    if (system) {
      // Reconstruct at its authoritative age. No simulation or player object escapes render.
      // The binding uses canvas dimensions; cancel that fit while keeping the engine's transform.
      const cw = ctx.canvas.width,
        ch = ctx.canvas.height;
      ctx.save();
      ctx.translate(e.x - 480, e.y - 270);
      ctx.scale(C.FIELD_W / cw, C.FIELD_H / ch);
      const player = new ParticleCanvasPlayer(
        {
          ...system,
          emitters: system.emitters.map((emitter) => ({
            ...emitter,
            particle: {
              ...emitter.particle,
              colorGradient:
                e.kind === "extraction"
                  ? [
                      { at: 0, color: "#fff8da" },
                      { at: 0.2, color: COLORS[e.charge] },
                      { at: 1, color: COLORS[e.charge] },
                    ]
                  : emitter.particle?.colorGradient,
            },
          })),
        },
        ctx,
        {
          seed: e.seed,
          clear: false,
          pixelRadius: 10,
        },
      );
      player.update(e.age);
      ctx.restore();
    }
  }
  if (danger(s)) {
    ctx.strokeStyle = "#f17d68";
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, C.FIELD_W - 6, C.FIELD_H - 6);
    text(ctx, "!  INTAKE APPROACHING", 480, 188, 13, "#ff9c83", "center");
  }
}
function hud(ctx: CanvasRenderingContext2D, s: State) {
  panel(ctx, 260, 149, 480, 49);
  text(ctx, "SCORE", 276, 166, 9, "#718e94");
  text(ctx, String(s.score).padStart(6, "0"), 276, 186, 18, "#edf1d9");
  text(ctx, "HALL", 387, 166, 9, "#718e94");
  text(
    ctx,
    String(s.level).padStart(2, "0") + " / 05",
    387,
    185,
    14,
    "#d7e3d6",
  );
  for (let i = 0; i < s.cells; i++) image(ctx, "hud-cell", 490 + i * 22, 176);
  image(ctx, "hud-pressure", 580, 174);
  text(ctx, "PRESSURE", 600, 165, 9, "#718e94");
  ctx.fillStyle = "#07171d";
  ctx.fillRect(601, 174, 118, 8);
  ctx.fillStyle = s.pressure > 65 ? "#ef906e" : "#d5b174";
  ctx.fillRect(601, 174, (118 * s.pressure) / C.PRESSURE_MAX, 8);
  text(ctx, Math.round(s.pressure) + "%", 720, 192, 8, "#d5b174", "right");
  text(ctx, "LOADED", 324, 291, 9, "#9bb4b6", "center");
  core(ctx, s.loaded, 324, 314);
  text(ctx, "NEXT / X", 324, 358, 9, "#9bb4b6", "center");
  core(ctx, s.queued, 324, 381);
  text(ctx, "INJECTOR", 420, 385, 9, "#66868e", "center");
  text(ctx, "FEED REMAINING", 720, 308, 9, "#718e94", "center");
  text(
    ctx,
    String(s.quotaRemaining).padStart(2, "0"),
    720,
    337,
    25,
    "#d9dcc0",
    "center",
  );
  if (s.chainTimer > 0) {
    text(ctx, "CHAIN ×" + s.chainStep, 720, 370, 13, "#efc783", "center");
    ctx.fillStyle = "#efc783";
    ctx.fillRect(680, 379, (80 * s.chainTimer) / C.CHAIN_RESET, 2);
  }
  if (s.machinery) {
    text(
      ctx,
      s.machinery.kind.toUpperCase() +
        " / " +
        s.machinery.remaining.toFixed(1) +
        "s",
      480,
      462,
      12,
      "#aff0d3",
      "center",
    );
  }
}
function titleScreen(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#06141bdc";
  ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
  panel(ctx, 196, 64, 568, 408);
  text(
    ctx,
    "DEEP EARTH / MINERAL RECOVERY DIVISION",
    480,
    100,
    10,
    "#8ba7a8",
    "center",
  );
  text(ctx, C.TITLE_TEXT, 480, 182, 76, "#e9d9ae", "center");
  ctx.fillStyle = "#ad895a";
  ctx.fillRect(412, 202, 136, 2);
  text(ctx, "Keep the hall running.", 480, 234, 20, "#d1e3d7", "center");
  text(
    ctx,
    "Gather three like cores. Extract before the intake.",
    480,
    261,
    12,
    "#8faeb1",
    "center",
  );
  C.CHARGE_IDS.forEach((c, i) => core(ctx, c, 416 + i * 32, 295));
  panel(ctx, 332, 325, 296, 40);
  text(ctx, "ENTER / CLICK TO BEGIN", 480, 351, 14, "#efcd91", "center");
  text(
    ctx,
    "AIM  Mouse / ← →      FIRE  Click / Space",
    480,
    398,
    11,
    "#b2c9c8",
    "center",
  );
  text(
    ctx,
    "SWAP  X        PAUSE  P / Esc        MUTE  M",
    480,
    422,
    11,
    "#b2c9c8",
    "center",
  );
  text(
    ctx,
    "FIVE HALLS     •     THREE CELLS     •     ONE MACHINE",
    480,
    453,
    9,
    "#708c92",
    "center",
  );
}
export function render(s: State, api: RenderApi) {
  const ctx = api.ctx;
  ctx.imageSmoothingEnabled = false;
  hall(ctx, s);
  if (s.screen === "title") {
    titleScreen(ctx);
    return;
  }
  if (["playing", "paused", "cleared", "setback"].includes(s.screen))
    hud(ctx, s);
  if (s.screen === "playing") return;
  ctx.fillStyle = "#07151bc9";
  ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
  panel(ctx, 258, 202, 444, 188);
  const heading = {
    paused: "HALL ON HOLD",
    cleared: `HALL ${s.level} CLEARED`,
    setback: "CELL SPENT",
    gameover: "THE HALL FALLS SILENT",
    victory: "ALL HALLS RESTORED",
  }[s.screen];
  text(
    ctx,
    heading,
    480,
    252,
    29,
    s.screen === "setback" || s.screen === "gameover" ? "#f1a284" : "#ebd5a7",
    "center",
  );
  const detail =
    s.screen === "paused"
      ? "The machine waits for you."
      : s.screen === "setback"
        ? `${s.cells} cells remain. Repressurizing…`
        : s.screen === "gameover"
          ? `FINAL SCORE ${s.score}  /  HALL ${s.level}`
          : s.screen === "victory"
            ? `All five levels cleared.  FINAL SCORE ${s.score}`
            : `SCORE ${s.score}  /  +${C.CLEAR_SCORE} CLEAR BONUS`;
  text(ctx, detail, 480, 293, 12, "#b5c9c8", "center");
  text(
    ctx,
    s.screen === "paused"
      ? "P / ESC TO RESUME"
      : s.screen === "cleared" || s.screen === "setback"
        ? "RESTARTING IN " + Math.ceil(s.interlude) + "…"
        : "ENTER / CLICK TO RETURN",
    480,
    351,
    12,
    "#d2b47e",
    "center",
  );
}
