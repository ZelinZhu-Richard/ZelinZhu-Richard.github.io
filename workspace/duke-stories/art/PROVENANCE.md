# Duke story artwork and provenance

Status: APPROVED. Richard replied “Yes Approve” after viewing the four-image board.

All four illustrations were generated with the built-in image_gen tool. No CLI/API fallback was used. Original PNGs and quality-85 WebP review exports are retained in gate-v1/. manifest.json records dimensions, hashes and file sizes. Exact prompts are in prompts/.

| Image | Generation inputs |
| --- | --- |
| 01-shared-character-sheet | Richard's previously approved Wings model sheet; official Duke mascot costume photograph |
| 02-richard-transformation | Candidate shared character sheet |
| 03-lantern-rescue | Candidate shared character sheet |
| 04-blue-welcome | Candidate shared sheet; five-stage Richard transformation; official Duke Chapel photograph |

## Reference sources

- reference/richard-approved-sheet.png: copied unchanged from the approved Wings character sheet in the sibling site-wings checkout. Richard's earlier approval applies to this original dragon, not automatically to the Duke candidate set.
- Mascot costume: https://today.duke.edu/2026/05/how-blue-devil-and-brain-research-intersect — photograph credited on the article to Duke University Communications and Marketing. Used only to establish the mascot's costume and appearance, not to reproduce the photographed person, research setting, props or text.
- Mascot reference image: https://today.duke.edu/sites/default/files/2026-05/Blue%20Devil%20full%20costume%20holding%20brain.png
- Chapel reference image: https://brand.duke.edu/wp-content/uploads/sites/42/2018/10/132717b_inauguration037_identity2-1280x720.jpg
- Duke color values: https://brand.duke.edu/colors/ — Royal Blue #00539B; Navy Blue #012169.
- Chapel context: https://chapel.duke.edu/about-chapel/
- Brodhead context for later production scenes: https://admissions.duke.edu/living-dining-and-wellness/

Downloaded official photographs remain local reference material, excluded from Git and intended production output. Their source URLs are retained here. No artwork from AI Safety Dance was copied or used as an image-generation reference.

The four gate images have opaque composed backgrounds. Lettering is absent from generated art; the review board's labels are HTML.

## Production artwork after approval

Seventeen original production illustrations were generated after approval, using the built-in image_gen tool and the approved sheets as explicit inputs. Original PNGs are preserved in production/. production-manifest.json records each exact prompt, reference inputs, generation output identifier and tool. The same prompts are individually saved in prompts/. The approved rescue and welcome illustrations are also reused as optimized production images.

The Brodhead illustrations use an additional official architectural reference: https://arc.duke.edu/brodhead-center-wu/ and its photograph https://arc.duke.edu/files/2026/02/Duke-University-Brodhead-01-scaled-1-950x630.jpg. The photograph remains local, ignored reference material; it is not shipped.

scripts/export-art.mjs exports quality-85 WebP illustrations, transparent sprites, five registered Richard states and separate mobile crops. assets/manifest.json records every exported dimension, SHA-256 hash and byte count. The 434 × 724 Richard crops share the same baseline, scale and wing-root coordinates; adjacent sprites crossfade over an opaque lower sprite. Original transparent PNGs are retained for future edits.

Every shipping raster has an adjacent .webp.json provenance sidecar. Crop operations preserve the underlying generation prompt and identify the source. No AI Safety Dance artwork, text, markup or runtime was copied. The shared serif fonts are self-hosted Merriweather, copied unchanged from the Wings feature's licensed assets, under the included assets/OFL-Merriweather.txt license.

Richard is an original illustrated dragon. The Blue Devil is an original illustration informed by Duke's mascot costume references. The campus locations are illustrated interpretations of official references. All human collaborators are fictional. These two stories do not assert an admissions outcome or Duke affiliation.
