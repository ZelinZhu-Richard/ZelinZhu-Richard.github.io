# Engine architecture

The engine is plain ES modules (JS with JSDoc). `engine/index.js` is the only thing the Vue app imports. Pure modules (timeline, schedule, audio voices, quality rules) import nothing outside `engine/` and no `three`, so root `node --test` can run them.

## Flow of one frame

```
scroll progress p (0..1)
  -> schedule.progressToU(p)            u in section units, 0..20
  -> timeline.evaluate(u, viewport)     FrameState (pure)
  -> acts[*].render(frame, target)      each active act draws itself into an HDR target
  -> composer                            crossfade / dissolve between at most two acts
  -> post (film finish)                  the only pass that writes the canvas
```

## FrameState (output of the timeline; plain data)

```js
{
  u,                      // section units 0..20
  section,                // integer 0..19
  beat,                   // index of the text beat in view, or -1
  viewport: 'land'|'port',
  acts: [{ id, weight }], // one or two active acts, weights sum to 1
  transition,             // null | { from, to, t, kind: 'cut'|'fade'|'lift'|'reveal'|'dissolve' }
  camera: { position:[x,y,z], target:[x,y,z], fov, roll },   // in the active act's world units
  cameraB,                // same, for the second act during a transition, else null
  params: { ... }         // named scalars 0..1 unless stated; see below
}
```

Params (about a dozen, all driven by the choreography):
`draw` (plate line drawing progress), `lift` (wheel off the page), `train` (gears meshed: 0,1,2,3), `crank` (radians, exact function of u), `build` (instrument assembly 0..1), `lights` (room strips and lamps), `screens` (monitors awake), `aurora`, `galaxy`, `brass` (1 = brass, 0 = engraved), `arms` (arm extension 0..1), `stones` (labels visible), `contact` (rings sealed).

## Acts

Each act is a self-contained renderer for one part of the story. An act never writes the canvas.

```js
// engine/acts/<id>.js
export function create<Id>Act(ctx) -> {
  id,                                   // 'plate' | 'gears' | 'room' | 'space'
  async load(onProgress),               // fetch and build; may be called before first use
  ready,                                // boolean
  setTier(tier),                        // 0..3
  resize(width, height, dpr),
  render(frame, camera, target, time),  // draw into `target` (HalfFloat RGBA render target, linear, may be MSAA); one render call per target
  pick(ndcX, ndcY, frame, camera),      // -> stone id | null   (only 'space' and 'room' need real picking)
  stonesScreen(frame, camera),          // -> [{id, x, y, r}] in CSS px, or []
  dispose(),
}
ctx = { THREE, renderer, assetsBase, rngFor, instrument, sky, tier, reducedMotion }
```

Acts and their sections:

| act | sections | world |
|---|---|---|
| `plate` | 0-3 | the orange point, the astrolabe drawing on a notebook page, the wheel lifting off |
| `gears` | 4-8 | macro inside the gear train, rising up the column through the rings |
| `room` | 9-17 | false space, lights on, the desk, the four objects, lights off, dissolve |
| `space` | 17-19 | the instrument in the galaxy, seven stones, contact mode |

## Shared objects

- `ctx.instrument` (`engine/instrument/`): ONE instrument used by every act, so the brass object on the desk and the engraved object in space are the same geometry. API: `object3D`, `setBuild(0..1)`, `setCrank(rad)`, `setArms(0..1)`, `setBrass(0..1)`, `setHover(id|null)`, `setContact(0..1)`, `stoneWorldPositions()`, `setEnvironment(...)`.
- `ctx.sky` (`engine/sky/`): the procedural sky; acts add `sky.object3D` to their own scene or render it to their own target.
- `engine/post/`: the film finish and the two-act composer.

## Units and anchors

Each act has its own world. The room is in metres (Y up); the instrument's desk anchor is exported by the room act as `anchors.instrument = { position, scale }`. The instrument module is authored at unit scale and placed by the act that draws it.
