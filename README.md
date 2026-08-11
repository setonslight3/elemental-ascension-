# Elemental Ascension

A 2D side-view action RPG built with Phaser 3. Version 1 is the **Fire** chapter:
single-player, 20 stages, five multi-phase bosses, loot, equipment, a three-branch
skill tree, a style-rank system and a persistent save.

It runs on desktop (keyboard or gamepad) and on phones and tablets **in landscape**,
with a purpose-built multi-touch control layer.

---

## Play it

The game is plain ES modules with no build step. It needs to be served over HTTP
(module scripts don't load from `file://`).

```bash
# any static server works
npx http-server -p 8080 -c-1 .
#  → open http://localhost:8080
```

or

```bash
python3 -m http.server 8080
```

There is nothing to install and nothing to download at runtime: Phaser is vendored
in `vendor/`, every texture is generated procedurally at boot, and every sound is
synthesised with WebAudio. The whole game is about 1.4 MB, most of which is Phaser.

### On a phone

Open the same URL on the device and turn it sideways. A rotate prompt appears in
portrait. Controls, their size, their opacity and left/right handedness are all in
**Settings**.

---

## Controls

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move | `A` `D` / arrows | left stick | left thumb (stick appears where you touch) |
| Sprint | `SHIFT` | push stick | push the stick to its edge |
| Jump | `SPACE` / `W` | `A` | jump button (hold for height) |
| Slide | `S` while sprinting | down while sprinting | pull down while sprinting |
| Attack | `J` / `Z` | `X` | attack button |
| Guard / Parry | `K` / `X` | `LB` | guard button |
| Roll | `L` / `C` | `B` | roll button |
| Fire abilities | `1` `2` `3` `4` | `RB` / triggers | ability row |
| Ultimate | `Q` | `L3` | ultimate button |
| Potion | `R` | `Y` | potion button |
| Pause | `ESC` / `P` | `START` | top-right |

**The two colours that matter.** An enemy winding up flashes its hitbox:
**amber** is blockable — guard it, or tap guard on the frame it lands to *parry*.
**Crimson** is unblockable — guard does nothing, get out of the way. What is drawn
is exactly what will hit you.

---

## What's in it

**Combat.** Three-hit ground chain with cancel windows, air attacks, dash attacks,
roll with i-frames, slide, guard with stamina and guard-break, a real parry window
with a cooldown, four fire abilities, burn stacking, a charged ultimate, hitstop,
and a style rank from C to SSS that multiplies your rewards.

**Twenty stages** across five biomes, with four objective types (clear waves, hold
out, destroy cores, hunt marked elites) plus five boss encounters. Layouts are
generated from seeded parameters, so a stage is the same stage every time you
play it, on every device.

**Eight enemy archetypes** — chargers, flyers, shielded lancers, snipers, suicide
bombers, armoured brutes, turrets and blink-rushing wardens — and **five bosses**
with 2–4 scripted phases each.

**Progression.** 30 levels, a 24-node skill tree in three branches with respec,
three equipment slots with rarities, affixes, item levels, upgrades and four
hand-authored uniques, plus a Forge that turns currency into gear.

**Saving.** Versioned, checksummed, double-buffered `localStorage` with migration,
a memory fallback for private browsing, and copy/paste save codes.

---

## Project layout

```
index.html            page shell, rotate gate, boot splash
styles.css            mobile hygiene (no scroll, no zoom, no tap highlight)
vendor/phaser.min.js  Phaser 3.90, vendored so the game works offline
src/
  main.js             Phaser config + page lifecycle (visibility, orientation, save-on-hide)
  core/Context.js     the single global: profile + audio
  data/               pure tuning data — no logic lives here
    Balance.js          every number that decides how the game feels
    Enemies.js          archetypes and boss scripts (declarative attacks)
    Stages.js           the 20-stage campaign, biomes, modifiers
    Skills.js           the three-branch tree
    Items.js            bases, affixes, uniques
  systems/
    Save.js             versioned + checksummed persistence
    Profile.js          the live account; the only thing that writes to the save
    Stats.js            folds level + skills + gear into one derived stat block
    Art.js              every texture, generated at boot
    Audio.js            synthesised SFX and procedural music
    Input.js            one action model over keyboard / gamepad / touch
    TouchControls.js    the on-screen controls
    FX.js               pooled particles, damage numbers, shake, hitstop
    Style.js            the C→SSS meter
    Terrain.js          seeded world building
    Loot.js             item generation and drop rolling
  entities/
    Rig.js              characters built from primitives, animated in code
    Player.js, Enemy.js, Boss.js, Projectile.js, Hazards.js
  ui/UI.js            touch-first widget kit
  scenes/             boot, menu, hub, missions, play, HUD, pause, results,
                      skills, loadout, forge, settings, codex
```

`DESIGN.md` documents the gaps in the original blueprint and how each one was
closed.

---

## Notes on the technical choices

**No asset pipeline.** Characters are skeletons of tintable capsules posed by
maths each frame (`entities/Rig.js`), effects are gradient sprites generated into
canvas textures at boot (`systems/Art.js`), and audio is oscillators and filtered
noise (`systems/Audio.js`). The result: no loading screen, no 404s, no CORS, and
the entire palette is re-tintable per biome for free.

**One input model.** Gameplay code never asks whether a key is down; it asks
`input.pressed('jump')`. Buffering and coyote time live in the input layer, which
is why the same `Player` class feels right on a keyboard and on a thumb.

**Data-driven enemies.** Every attack in the game — including every boss attack —
is a data object describing windup, active frames, recovery, range and telegraph
type. One executor in `Enemy.js` performs all of them, so a new enemy is a data
change, not new code.

**Frame-rate independence.** Physics runs a fixed step and delta is clamped, so
combat timings are identical at 60 Hz and 120 Hz, and a stalled frame can never
teleport anything through a wall.
