# Elemental Ascension — design notes

The blueprint and scope document describe *what* Version 1 should contain. They do
not say how any of it holds together, and several of the rules they do state break
if you follow them literally. This document lists every gap I found, the decision I
made, and where it lives in the code.

Nothing here changes the shape of what was asked for. Fire, single-player, 20
stages, bosses, AI, loot, equipment, a hub, a skill tree and a save system are all
present. These are the joints between them.

---

## 1. "Health is restored only in the Hub"

**The gap.** Taken literally, this is either meaningless (if health refills at the
start of every stage, the Hub does nothing) or a dead end (if it doesn't, a player
who finishes a stage on 4 HP with no potions has no way forward — every subsequent
run is unwinnable, and the only cure is grinding a stage they cannot survive).

**The decision.** Health genuinely persists between stages — `profile.data.currentHp`
carries a wounded Ascendant from run to run, which is what gives the Hub a job.
Three things stop that from becoming a death spiral:

- Out of combat, health trickles back at 1.6/sec after 6 seconds without damage,
  but **only up to 35% of maximum**. It is a floor, not a rest: enough that a run
  is always attempted from a survivable position, far too slow to replace potions.
- Potions are the field option, bought at the Forge, capped by the Control tree.
- Dying costs the *run*, never the account. You keep 35% of the XP and half the
  loot from the attempt and can walk straight back in.

*Code:* `PLAYER.REGEN_*` in `data/Balance.js`, `Player._tickTimers`, `HubScene.create`,
`PlayScene._finish`.

---

## 2. "Mana regenerates slowly; attacks speed it up"

**The gap.** Paying out for *attacking* pays out for swinging at empty air. A player
would mash into the void to charge abilities before every fight.

**The decision.** Mana ticks slowly on its own and gains on **landed hits**, with a
diminishing streak (×0.55 per additional hit inside one second) so flailing into a
crowd is not a mana fountain. Parries give a large lump sum, which is the intended
skill expression.

*Code:* `PLAYER.MANA_ON_HIT*`, `Player._onHitLanded`.

---

## 3. Block and parry, with nothing stopping either

**The gap.** "Block & Perfect Parry" with no cost means holding guard is a winning
strategy against everything, and mashing guard makes the parry window permanent.

**The decisions.**

- **Guard costs stamina** — passively while held, and a chunk on every impact. At
  zero stamina the guard breaks and you are stunned for 1.1s. Turtling has a
  timer on it.
- **Guard is directional.** Hits from behind are not blocked at all.
- **The parry window has a cooldown** (0.32s), so mashing guard cannot chain
  parries. You have to read the attack.
- **Half of every enemy's moveset is unblockable.** This is the big one. Every
  enemy telegraph is colour-coded: **amber** = blockable/parryable, **crimson** =
  unblockable, move. Guard is a tool for half the situations, not an answer to
  all of them.

*Code:* `PLAYER.STAMINA_*`, `PLAYER.PARRY_*`, `Player.takeDamage`, `Enemy._drawTelegraph`,
`TELEGRAPH_COLOUR` in `entities/Enemy.js`.

---

## 4. Roll spam

**The gap.** I-frames on a dodge with no cost means rolling is strictly better than
any other defensive option.

**The decision.** Rolls cost stamina and have a cooldown, and the i-frames
(0.24s) are shorter than the roll itself (0.42s) — so a panicked roll into a slam
still eats it. Rolling out of an attack's recovery is allowed and is one of the
intended movement techs; rolling as a permanent state is not.

*Code:* `PLAYER.ROLL_*`, `Player._updateRoll`.

---

## 5. A style rank that is really just a hit counter

**The gap.** "C → B → A → S → SS → SSS" says nothing about what earns it. Points
for hits alone makes the highest rank a reward for mashing one button.

**The decisions.** Three rules do the work:

- **A repetition tax.** The last six moves are remembered; each repeat of the same
  move multiplies its style value by 0.55 (floored at 0.12). One-button play
  plateaus at a low rank; varied play climbs.
- **Decay.** The meter bleeds 62/sec after 2.4 seconds of inactivity, so rank
  reflects what you are doing now.
- **Damage taken costs 55% of the meter**, immediately. The rank means "in
  control", not "still alive".

The end-of-stage grade blends *sustained* rank (two thirds, time-weighted) with
*peak* rank (one third), so one lucky flurry cannot carry a sloppy run.

*Code:* `systems/Style.js`, `STYLE` in `data/Balance.js`.

---

## 6. Nothing stops you farming stage 1 forever

**The gap.** With flat rewards, the optimal play is to replay the easiest stage
indefinitely instead of pushing forward.

**The decision.** Repeat clears pay `0.55 × 0.9^(clears-1)`, floored at 0.4. The
mission screen shows the exact current multiplier before you commit, so this is
information, not a hidden punishment. Style rank multiplies rewards by up to ×2.0,
which means the fastest progress always comes from playing a *harder* stage well
rather than an easy one repeatedly.

*Code:* `PROGRESSION.REPLAY_*`, `Profile.replayMultiplier`, `MissionScene._renderDetail`.

---

## 7. Crowds that are unfair rather than difficult

**The gap.** "AI" and waves of robots, with no rule about how many may act at once.
Eight enemies winding up on the same frame is not difficulty, it is a coin flip.

**The decision.** A scene-level **attack token**: at most two enemies (three from
stage 13) may be mid-attack at any moment. Everyone else repositions and strafes.
Crowds still pressure you, but in readable waves you can actually answer. Enemies
also commit — once the active frames begin, the attack plays out, so trading and
punishing are real options.

*Code:* `PlayScene.requestAttackToken`, `Enemy._think`.

---

## 8. The 2–3 minute stage that has nothing in it

**The gap.** "Fight AI robots (2–3 minute stages)" — with wave spawns placed
anywhere in a 4,000px level, the player spends the stage walking.

**The decisions.**

- Wave-spawned robots are flagged **hunting**: they cross the level to reach you
  rather than idling until you walk into aggro range. Garrison units placed with
  the terrain keep normal aggro and a leash, so approaching a defended position
  still feels different from being hunted.
- Spawn points are chosen **off-camera but within 1300px**, so waves arrive within
  a couple of seconds without popping in on screen.
- Four objective types keep the 2–3 minutes shaped differently: clear waves, hold
  out for a timer, destroy reactor cores while under attack, hunt marked elites.

*Code:* `PlayScene._pickSpawnPoint`, `PlayScene._updateDirector`, `Enemy._think`.

---

## 9. Loot that becomes noise

**The gap.** "Loot" and "Equipment" with no structure produces a bag of
indistinguishable junk within an hour.

**The decisions.**

- An item never rolls the same affix twice, and affixes are filtered by slot (a
  Sigil cannot roll "Max Stamina").
- Rarity controls both affix count *and* a power multiplier, so a legendary is
  meaningfully better than a rare of the same item level — not just longer.
- Four **hand-authored uniques** with rule-changing effects, gated behind minimum
  stages, so the top of the table contains landmarks rather than more noise.
- A 60-item bag cap that **auto-salvages the worst item** rather than dropping the
  new one, plus one-tap bulk salvage. Inventory management is never a chore and
  never silently eats a drop.
- Every drop is compared against your equipped item, stat by stat, with coloured
  deltas.

*Code:* `systems/Loot.js`, `data/Items.js`, `Profile.addItem`, `LoadoutScene._refreshDetail`.

---

## 10. A skill tree with no shape

**The gap.** "Aggression, Speed and Control branches" — with no gating, a level-3
player takes three capstones and the tree stops being a choice.

**The decision.** Four tiers per branch, gated on points already spent *in that
branch* (0 / 0 / 3 / 7 / 12). Each branch ends in a capstone that changes a rule
rather than a number (Wildfire spreads burn on kill; Perpetual refunds a dash on
kill; Last Ember is a once-per-stage cheat death). Respec costs Ember and scales
with what you have spent, so experimenting is possible but not free.

*Code:* `data/Skills.js`, `Profile.skillBlockedReason`, `Profile.respec`.

---

## 11. A save that can eat itself

**The gap.** "Save system" is one line in the scope. In practice a browser game's
save fails in four specific ways.

**The decisions.**

- **Private browsing** throws on `localStorage` access — every access is guarded
  and falls back to an in-memory store, and the menu says progress will not
  survive a reload rather than silently losing it.
- **Interrupted writes** (phone kills the tab mid-save) are caught by a checksum,
  and a double-buffered backup slot means a corrupt save can only ever cost the
  newer of two copies.
- **Old saves** are versioned and migrated forward, then backfilled against the
  current default shape, so a new field never wipes a profile.
- **Hand-edited saves** are clamped on load — not as anti-cheat (it's single
  player, the save is right there in devtools) but so a malformed value cannot
  produce NaN health or an infinite loop in the level-up routine.
- Writes are debounced and flushed on `pagehide`, `visibilitychange` and
  `beforeunload` — the three events mobile browsers actually fire.

*Code:* `systems/Save.js`, lifecycle wiring in `src/main.js`.

---

## 12. Mobile was listed as a target, not designed for

Landscape phone play is the requirement that touches the most code.

- **A floating stick.** It materialises wherever the left thumb lands rather than
  living at a fixed spot the player must find without looking.
- **Sprint by push.** Pushing the stick past 75% sprints, so no button competes
  for thumb space. Pulling down while sprinting slides.
- **Real multi-touch.** Pointers are tracked by hand rather than through per-object
  hit areas, so holding guard with one thumb while driving the stick with the other
  works, and sliding off a button mid-press does not silently release it. A pointer
  that grabs a button keeps it until release, so a drifting thumb never swaps
  buttons mid-combo.
- **Targets bigger than they look.** Every button accepts touches 32% outside its
  drawn circle.
- **Configurable.** Size, opacity and left/right handedness, with a live preview.
  Buttons scale around the bottom outer corner so shrinking them keeps them under
  the thumb.
- **Auto-hide.** The layer fades out when a keyboard or pad is used, and fades back
  on the next touch.
- **The page itself**: no rubber-band scroll, no double-tap zoom, no tap highlight,
  no text selection, safe-area padding, a rotate gate in portrait, and DPR clamped
  to 2 (rendering 1280×720 at DPR 3 costs 8× the fill rate for a difference nobody
  can see while dodging a Brute).
- **A quality setting** that halves the particle budget and drops two of the three
  full-screen blended layers, defaulting to the cheap path on touch devices with
  few cores.

*Code:* `systems/TouchControls.js`, `systems/Input.js`, `styles.css`, `src/main.js`,
`systems/FX.js`.

---

## 13. Things the documents didn't mention that the game needs anyway

- **Coyote time (0.11s) and jump buffering (0.13s).** The single biggest difference
  between a platformer that responds and one that "eats inputs".
- **Jump-cut**: releasing early trims the arc, so height is controllable.
- **Hitstop** on impact, capped at 0.16s, with particles still moving during the
  freeze so it reads as punch rather than as a stutter.
- **Post-hit i-frames (0.45s)** so a crowd cannot chain-lock you to death.
- **Enemy separation** — a soft positional nudge rather than physics colliders,
  which produce shoving matches and jitter.
- **A leash and a void catch**: enemies that lose you go home; falling off the world
  costs 12% health and puts you back on solid ground instead of ending the run.
- **A stagger meter** on every enemy, so sustained pressure interrupts attacks and
  melee has a reason to stay close. Bosses give a long punish window, and each
  stagger is 15% harder to earn than the last.
- **Boss phases** as chapters: crossing a health threshold plays an invulnerable
  transition that clears the arena and swaps the attack pool, so a long health bar
  reads as a fight rather than as a slog.
- **A codex** that answers the questions a new player actually has in the first two
  minutes: what the colours mean, why the guard broke, why the style rank is stuck.

---

## Deliberate scope boundaries

Water, Earth, Air, PvP, co-op, guilds and raids are listed as Future in the scope
document and are not implemented. Two decisions were made with them in mind:
element-specific values are isolated in `data/Balance.js` and `data/Items.js` rather
than scattered through gameplay code, and enemy and boss behaviour is fully
data-driven, so a second element is a data package plus a palette rather than a
rewrite.
