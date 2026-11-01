# 逍遥游 · Free and Easy Wandering

A meditative browser journey through the opening of Zhuangzi's 逍遥游. You are Kun, a small pale fish with a mountain landscape painted across its back, swimming among pine-topped stone pillars in the dark northern sea. Each red mote you gather makes you larger, until the towers below look like a stone forest.

This is the first vertical slice: title, the northern sea, the source lines with a translation layer, and the seal end card.

## How to run

From the repository root:

```
python3 -m http.server 8101 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8101/games/xiaoyaoyou/`. The game is static ES modules with no build step and no network requests beyond its own folder.

## Controls

- Move the pointer away from the center of the screen to steer.
- Hold the mouse or a finger on the screen to swim forward. Let go to glide.
- `T`, or the Translation button, shows or hides the English.

## Credits

- Text: Zhuangzi, public domain. English drafts are written for this project.
- Three.js, MIT. License in `vendor/three/LICENSE`.
- LXGW WenKai and EB Garamond, SIL Open Font License. Licenses in `fonts/OFL-LXGWWenKai.txt` and `fonts/OFL-EBGaramond.txt`.
- Kun and the pillars are modelled from Python in Blender, with no downloaded or AI-generated meshes.
- `assets/rock.webp`, `assets/paper.webp` and the fin and fluke paint in `blender/paint/` are AI-generated images. The fin and fluke paint are upscales of the project's own reference sheet.

## Text status

Draft, pending verification. Every line in `text.json` is marked `draft: true`, and every source line is marked `verify: true`, which means a human has not yet checked it. Do not treat the English as final.

## Tools

- `tools/capture.mjs --milestone <n> [--autoplay] [--replay]` writes screenshots and metrics to `_dev/evidence/M<n>/`.
- `tools/silhouette.py` renders and compares Kun against the reference sheet.
- `tools/codex_review.sh <milestone> <round> <evidence dir>` runs an independent read-only review from evidence alone.
- `tools/optimize_assets.sh` compresses `_dev/raw/*.glb` into `assets/`.
- `tools/subset_fonts.sh` rebuilds the font subsets from `text.json`, and `tools/check_text.py` validates the text.
