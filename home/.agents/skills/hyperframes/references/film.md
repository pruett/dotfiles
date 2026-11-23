# Films from a source: measured facts

What is specific to HyperFrames, or was measured on shipped films, when one video is made from a website, a script, a pull request, a music track, a real place or a short motion brief. The story comes first, from `story.md`; the shape of each kind of film is in `types/`. Motion craft is in `motion.md`, look in `look.md`, sound in `sound.md`, captions in `captions.md`.

## Script and pacing

- TTS reads about 2.2 words a second. Keep a scene to about 19 words (9 s); at most two scenes may reach 26 words (12 s). 30–90 s is about 155 words or fewer; a whole film about 400 at most.
- A voiceover longer than its visuals makes the visuals pad with idle drift. Trim the script; never stretch the motion.
- Everything on screen in the first quarter of a scene, then frozen, reads as a slideshow. Reveal each piece when the voiceover names it, across the back half of the scene; write the voiceover as separate phrases so it has cue points.
- Up to about six short scenes, build them yourself in one context (about 9 min for five, against about 21 min split across sub-agents). Beyond that, give each worker two or three scenes and start them all at once; a second wave nearly doubles the time.

## From a website

Use supplied local screenshots and recordings. Preserve their aspect ratio and inspect their actual pixels before choosing colours or placement.

## From a pull request

Use supplied local diffs and release facts. Credit the actual authors and show only the code needed for the explanation.

## On music

- Supplied music comes as 15–30 s loops: loop the bed to the film with a 0.4 s fade-in and a 1.5 s fade-out. A track whose opening is a quiet build drains a short film: start from a stronger later section.
- Trust beat times only on rhythmic stretches; on calm music the tracker invents a metronome, often at double tempo (`node "<SKILLS>/hyperframes/scripts/plugin-cli.mjs" beats` reports `bpmConfidence`). Cut there on phrase and energy changes; `node "<SKILLS>/hyperframes/scripts/plugin-cli.mjs" audio --only sections,onsets,moments --json` finds them.
- A move that must land on a hit starts 40–190 ms early; a reaction starts 0–45 ms after. The hit itself is a 0 ms `tl.set`: easing a hit kills it. Scenes tile the track with no gaps.
- A word meant to be read holds at least one beat. Any single treatment goes stale after about 6 s: lengthen a section with a hold or a new treatment, never by slowing tweens. On rhythmic sections give footage one clip per strong beat; on calm ones one slow push from 1.0 to 1.08.

## Maps and real places

Use supplied local map imagery with its required attribution. Draw borders and labels as editable SVG overlays. Do not generate a map from a network tile source.

## Short motion pieces

- Kinetic type takes 3–7 English words or 4–12 Chinese characters per scene. A count-up runs 1.2–1.6 s, then holds, landing on a downbeat or a hard stop.
- A highlighter that wraps across lines: tween a custom property on a `background-size` band with `box-decoration-break: clone`. `getTotalLength()` can return 0 before layout; give line draw-ons a fallback.
- Hide a round-capped line with a gap longer than the path (`stroke-dasharray="100 120"`, `stroke-dashoffset="110"` on `pathLength="100"`), not dash = gap = offset: that leaves a dot at the end on some curves.
- Locate objects against the source pixels and verify every placement in a local snapshot.
