# Validation — October 15, 2026

## Automated checks

- `npm test`: **73 passed, 0 failed**, including all existing portfolio, Flash, Paper Piano, and Gym tests plus 19 Domain Expansion tests.
- Geometry covers detection-order changes, hand rotation, smoothing/reacquisition, low-confidence/missing/closed/overlapping/out-of-frame hands, convex masks, activation and stale-result timing, and mirrored contained coordinates.
- Lifecycle covers delayed camera permission, cancellation during worker/model initialization, camera restart, interrupted video playback, permission denial, one inference in flight, late bitmap disposal, worker failure/recovery, compatibility fallback when bitmap transfer is unavailable, and model loading failure.
- Site integration checks the project anchor/source link and placement after Gym in shared navigation.
- `npm run build`: **175 production files verified**, including dependency hashes, local links, anchors, JavaScript syntax, metadata, and required route assets. Total site output was 103.8 MiB; MediaPipe files are shared in source and copied into this route at build time.
- `git diff --check`: passed before publication.

## Browser checks

Headless Google Chrome on macOS, with synthetic browser camera input only. All seven browser scenarios passed without page errors:

1. Desktop view at 1440 × 1000, page title/current navigation, initial camera controls, and keyboard operation of Pixel size.
2. Deterministic textured frame: **4,852 interior pixels changed, 0 wholly exterior pixels changed** by pixelation; mirrored video mapping matched. Antialiased polygon-edge pixels were excluded from the exterior comparison.
3. The pinned MediaPipe runtime/model loaded, a tracking worker was created, synthetic video reached the live view, and Stop detached its camera stream.
4. Mobile view at 375 × 812: no horizontal overflow, menu opens/closes, Domain Expansion link is visible, and reduced-motion preference is recognized.
5. Denied camera permission displays recovery instructions and permits retry.
6. Synthetic four-fingertip landmarks activate the visible domain, and Stop resets it.
7. `/domainexp` redirects to `/domainexp/`; the Work project entry, generated navigation at 1024 px, and captured homepage menu contain the new destination.

Desktop, mobile, synthetic active-camera, and homepage-menu captures were opened and inspected. A fresh Impeccable finish review requested stable text backings over camera footage, removal of a decorative stage label, corrected mobile sentence spacing, and complete product/validation notes. Those corrections were applied and the same page states recaptured. The mechanical detector ran in its degraded regex mode; its empty findings are not a full accessibility audit.

## Limits

No physical webcam, real hand movements, iOS Safari, Android hardware, or measured real-world tracking accuracy/latency were tested. Synthetic inputs establish rendering and state behavior, not landmark accuracy on human hands. Fullscreen availability follows the browser’s API support. Test with bright, even lighting and both hands fully visible; occlusion, slow inference, and crossed fingers can interrupt the effect.

Live deployment and asset checks are reported by the release task after GitHub Pages completes.
