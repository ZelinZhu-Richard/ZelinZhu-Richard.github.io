# The room: Richard's imagined lab-bedroom at night

Act 3 of the homepage story (see STORYBOARD.md) takes place here. Richard supplied six pictures of the room he imagines. They are reference for layout, mood and what is in the room. The room on the site is rebuilt as real 3D so the camera can move through it; the pictures themselves do not ship.

## Mood

Night. A tall room lit only by practical lights: violet and cyan light strips along desk edges, shelves and ceiling; warm amber under the bed and from two globe lamps; cold light from three monitors; and a floor-to-ceiling window wall with the northern lights over a far skyline and coast. The floor is dark polished stone that mirrors the lights. It should feel like the best place in the world to be awake at 3 a.m.

Palette: near-black violet shadows (`#0b0a14`), indigo (`#1b1750`), violet (`#7a4dff`), cyan (`#27e0d0`), aurora green (`#39f0a6`), warm amber (`#ffb469`), ink white (`#ece9e1`).

## Layout (one open room, about 10 m wide, 7 m deep, 5 m high)

- **Window wall** on the left and back-left: tall panes with thin dark mullions. Outside: aurora and stars (the procedural sky in `sketches/sky/`), a dark coastline, and a far skyline of slim towers with small lit windows and a few neon edges.
- **Desk** along the window, L-shaped, dark top with glowing edge strips. On it: three monitors in a row (left one angled), keyboard, mouse, a desk mat with a glowing dial pattern, a studio microphone on a boom arm, a camera on a small tripod, headphones on a stand, a mug, an open notebook with handwritten diagrams and a pen, a closed notebook, a twisty-cube puzzle, a Newton's cradle, a small glowing glass cube, and **a brass armillary sphere on a stand: this is the instrument the whole homepage is about**. Under the desk: a rack of stacked computer units with small status lights. A high-backed mesh office chair.
- **Bed** on the right: low platform bed with warm light underneath, pale duvet, dark knitted throw, pillows, and a row of soft toys. Two globe lamps on side tables.
- **Back wall**: floor-to-ceiling bookshelves with warm shelf lights, books, a few small figures and ornaments, a globe, and a large dark board covered in chalk-style notes (system diagrams, an optimisation plot, checklists). Above it a mezzanine with a glass rail, a small sofa, a telescope on a tripod and hanging plants.
- **Front right**: a round rug, a low round dark table with a stack of books and a candle in a glass, the corner of a sofa.
- Large leafy plants at the front left and around the room. A ring light fixture hangs from the ceiling.

## What must be original (the site is public and is meant to be entirely Richard's own)

- No company logos or product names on any hardware. The computer rack is generic boxes with status lights.
- No existing characters. The soft toys are original simple shapes: a round dog, a cat, a rabbit, a penguin, a seal, a panda-like bear, and one very large sleepy round creature of our own design. The small shelf figures are abstract statuettes. The wall picture is an original night-sky scene.
- Screens, the board and book spines carry only true or neutral content: real project and subject names (machine learning, statistics, operations research, management science, logic, entrepreneurship, engineering), plots without invented numbers, no revenue or user counts, no borrowed assistant name.
- The middle monitor shows Richard's own startup, **ZeroMind** (capital Z and M), with the line "Personal AI operating system" under it. It is the only product name anywhere in the room. What it is, in his words: one agent that runs on every frontier model, keeps a single memory of your whole life, and gets better at it every week. It exists today as a repository and a demo slide, so the screen shows the name, that line and a simple diagram (one agent, several models, one memory): no feature lists, status percentages or usage numbers.

## What each thing stands for (used by the story beats)

| Object | Interest |
|---|---|
| Left monitor: model evaluation curves and code | Machine learning, statistics, AI evaluation |
| Middle monitor: ZeroMind | His startup |
| Board on the back wall: system diagram, optimisation contours | Management science and engineering, operations research |
| Open notebook: a plan with a v1, v2, v3 curve | Startups, zero to one |
| Twisty cube and Newton's cradle | Logic, judgement |
| Book stack on the low table | The seven subjects, one spine each |
| Telescope, window, aurora | Curiosity; the way out to space |
| Soft toys on the bed | Life off the keyboard |
| Armillary sphere on the desk | The instrument: everything above, assembled |

## Technical target

- Built by a Blender Python script (`assets-src/room/build_room.py`), deterministic, no downloaded assets. Lighting baked to lightmaps so the browser draws it unlit and cheaply.
- Shipped as one GLB plus baked textures: at most 150k triangles and about 2.5 MB.
- Monitors, light strips and the window are separate named objects so the engine can animate them (screens waking, lights switching off, the window opening onto the sky).
