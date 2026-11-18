# Asset status before commercial distribution

This is an initial inventory, not a statement that every remaining asset is commercially cleared. Keep the original MIT copyright and licence notice for the code.

## Removed from the current tree

The upstream `public/assets/VIDEO-NOTICE.md` explicitly says the author does not hold rights to the example film, TV and sports clips. The following fourteen files were removed from this fork's current tree:

```text
public/assets/demolition/bust-break-concentration.mp4
public/assets/demolition/bust-digital-circus.mp4
public/assets/demolition/bust-happy-gilmore.mp4
public/assets/demolition/bust-spongebob-no-skills.mp4
public/assets/demolition/bust-wile-e.mp4
public/assets/killer/became-charon.mp4
public/assets/killer/elim-skyfall-take-the-shot.mp4
public/assets/killer/lost-excommunicado.mp4
public/assets/shared/winner-happy-gilmore.mp4
public/assets/shared/winner-karate-kid-crane.mp4
public/assets/shared/winner-rocky-champion.mp4
public/assets/shared/winner-seahawks-sb-lx.mp4
public/assets/shared/winner-spongebob-no-skills.mp4
public/assets/shared/winner-star-wars-throne.mp4
```

This is a genuine GitHub fork and preserves upstream history. **The inherited history still contains the original clips.** Do not describe a full repository clone as a cleared commercial package. A future release needs a verified asset manifest and a reviewed distribution/export process. The original attribution and media-warning documents are retained as provenance records; their presence does not mean the removed files are still shipped in the current tree.

Dead example-clip references have been removed. Viewer Video defaults to off, and text/animation presentation works without example clips. Custom, operator-supplied clips can still be used. The remaining assets are enumerated with sizes and SHA-256 hashes in [ASSET-MANIFEST.json](ASSET-MANIFEST.json); unresolved rights remain explicitly unverified. No commercial asset clearance is claimed.

## 3D Derby

`public/vendor/three-0.160.0/three.module.min.js` is three.js r160, MIT licensed (licence alongside it). Everything the 3D Derby draws (horses, jockeys, course, crowd, sky, textures and signage) is generated in code at load time in `public/games/derby/`. It ships no image, model, font or audio files. The display typefaces are system fonts already on the Mac TV host (Didot, Avenir Next Condensed), with generic fallbacks.

## 3D Killer

Everything the 3D Killer page draws (the club, the glass and the city beyond it, the rain, the floor board, the agents, darts, particles and signage) is generated in code at load time in `public/games/killer/` and `public/games/lib3d/`. It ships no image, model, font or audio files. In video mode it plays the venue's winner clips through `event-videos.js` like every other page, and it will play operator-supplied Killer moment clips at `public/assets/killer/{became-charon,lost-excommunicado,elim-skyfall-take-the-shot}.mp4` only if such files are present (they were removed from this tree; see above). The 2D original is kept as `public/games/killer-classic.html`.

## Remaining assets requiring a decision

| Group | Current evidence | Required action |
|---|---|---|
| Game and registration backgrounds | Upstream generally describes stock-site images; complete per-file terms are not supplied | Find source/licence evidence for each file or replace with original/licensed art |
| Derby horse, Quackshot icon and other illustrations | No complete commercial rights manifest | Record provenance and permissions or replace |
| Limbo dinosaurs | Attribution says user-supplied | Obtain an explicit commercial redistribution grant or replace |
| Around the World map | Has a public-domain map attribution and source reference | Retain attribution and verify reproduction/source terms |
| Crowd cheer and demolition sound | Attribution cites Mixkit sound effects | Retain the applicable terms and verify the intended packaged distribution |
| Bella/Daniel callouts | Upstream says generated with Kokoro TTS; scripts and voice identifiers are supplied | Verify the exact model/voice/output terms and required notices |
| `app/keep-awake-silent.mp4` | Functional silent-video asset, outside the third-party clip notice | Retained for existing wake-lock behaviour; document provenance before release |
| Product/game branding | Several upstream names/presentations reference Flight Club | Adopt original branding and review names/presentation before commercial launch |

Do not discard useful functioning artwork indiscriminately during the prototype. Track unresolved rights and replace or clear them before publishing a commercial build.
