# Porting SetiAstro (Franklin Marek) PJSR scripts to PixInsight 1.9.4+ (V8)

Audience: Claude Code. This is the playbook for porting old SpiderMonkey-era `.js`
scripts to PixInsight 1.9.4 "Lockhart", which replaced the SpiderMonkey JS engine
with Google V8. Done so far: `ContinuumSubtraction.js`, `AutoDBE.js`. Expect the
same handful of failures every time, in roughly this order.

## How we work this
- Edit the loose `.js` in this directory (`/Volumes/Office-SSD/Astronomy`).
- The user tests by **restarting PixInsight** (there is no working File > Reload),
  then `Script > Execute Script File` (or it auto-runs). They paste the console error.
- Fix → restart → rerun, one error at a time. The engine only reports the first error,
  so iterate. Errors are usually `file.js:<line>: <message>` — go straight there.
- When the canonical install copy is wanted, it goes in `~/PixInsight/scripts/`
  (user-writable, no sudo) and is registered via **Feature Scripts** (registers a
  *folder*, scanned for `#feature-id`; individual files are greyed out in the picker).
  `/Applications/PixInsight/...` is root-owned (needs sudo) — avoid.
- Stale `.xsgn` signature files: V8 forbids invalidly-signed scripts but allows
  unsigned. If you edited a `.js` that had an `.xsgn`, delete the `.xsgn`.

## The recurring fixes (the porting checklist)

1. **`#engine v8` as the very first line of the file.** This is the actual
   load-blocker — without it 1.9.4 routes the script to the absent "sm" engine and
   nothing runs. Put it above the comment banner / `#feature-id`. Also add
   `CoreApplication.ensureMinimumVersion(1, 9, 4);` at the top of `main()`.

2. **Includes that DECLARE native classes now conflict.** Comment them out:
   - `#include <pjsr/Sizer.jsh>` — `Sizer`/`HorizontalSizer`/`VerticalSizer` are
     native V8 classes; re-declaring them is `SyntaxError: Identifier '...' has
     already been declared`. **But** Sizer.jsh also `#define`s the `Align_*`
     constants — if the script uses any (commonly `Align_Expand`), re-add just those
     (`#define Align_Expand 0`). Trailing `// comments` on `#define` are fine.
   - `#include <pjsr/NumericControl.jsh>` — `NumericControl`/`NumericEdit` are native
     now. Comment out even if the script *uses* `NumericControl` (the native class
     provides the same API: `.label`, `.setRange`, `.slider.setRange`, `.setPrecision`,
     `.setValue`, `.onValueUpdated`).
   - Includes that only `#define` constants (StdButton, StdIcon, StdCursor, FrameStyle,
     ImageOp, SampleType, UndoFlag, TextAlign) are fine — keep them.

3. **`TextAlign_*` are no longer predefined globals.** Symptom:
   `ReferenceError: TextAlign_Center is not defined`. Add
   `#include <pjsr/TextAlign.jsh>`. (Defines `TextAlign_Left/Right/HorzCenter/VertCenter/Center/...`.)

4. **`Dialog`/`ScrollBox` (and other UI bases) are real ES6 classes.** The legacy
   idiom fails with `The 'Dialog' class constructor cannot be invoked without 'new'`:
   ```js
   function Foo() { this.__base__ = Dialog; this.__base__(); ... }
   Foo.prototype = new Dialog;
   ```
   Convert to:
   ```js
   class Foo extends Dialog {
     constructor() {
       super();
       ...        // body unchanged: this.x = ... and method assignments are fine
     }
   }              // delete the `Foo.prototype = new Dialog;` line
   ```
   Watch the brace count: `function(){...}` → `class { constructor(){...} }` adds one
   `}`. There can be **multiple** such classes per file (AutoDBE had `ScrollControl
   extends ScrollBox` *and* `ADBEDialog extends Dialog`). Class declarations are not
   hoisted like functions, but top-level classes are all defined before `main()` runs,
   so ordering is fine.

5. **Process enum constants moved off `.prototype`** — and the renaming is
   **inconsistent across process classes**. Symptoms: either
   `Invalid argument type: signed integer value expected` (the old `.prototype.X`
   read returns `undefined`), or our resolver throwing `Unresolved process constant`.
   Two distinct V8 schemes seen:
   - **Bare static**: `ChannelCombination.RGB`, `PixelMath.SameAsTarget`,
     `BackgroundNeutralization.RescaleAsNeeded`, `CurvesTransformation.AkimaSubsplines`.
   - **Category-prefixed static** (some classes only):
     `AutomaticBackgroundExtractor.ModelFormat_f32`, `.CorrectedFormat_SameAsTarget`,
     `.Correction_Subtract`; `DynamicBackgroundExtraction` uses the same prefixes
     (`ModelFormat_*`, `CorrectedFormat_*`, `Correction_*`). Bare `f32`/`SameAsTarget`
     are **ambiguous** here (both `ModelFormat_*` and `CorrectedFormat_*` exist), so a
     category hint is required.

   Drop in this resolver and route every `X.prototype.Y` through it. The optional
   `category` hint disambiguates the prefixed classes; the suffix-scan fallback +
   diagnostic dump handle anything unforeseen without another guess-and-restart:
   ```js
   function piEnum(processClass, name, category) {
       let candidates = [];
       if (category) candidates.push(category + "_" + name);
       candidates.push(name);
       for (let i = 0; i < candidates.length; i++) {
           let c = candidates[i];
           if (processClass[c] !== undefined) return processClass[c];
           if (processClass.prototype && processClass.prototype[c] !== undefined)
               return processClass.prototype[c];
       }
       let suffix = "_" + name;
       let matches = Object.getOwnPropertyNames(processClass).filter(function(n) {
           return n === name || n.slice(-suffix.length) === suffix;
       });
       if (matches.length === 1) return processClass[matches[0]];
       // On failure: dump Object.getOwnPropertyNames(processClass) (+ values) to the
       // console, then throw. The dump tells you the real names/values in ONE rerun.
       throw new Error("Unresolved process constant: " + name);
   }
   ```
   Mechanical conversion of the call sites (BSD/macOS sed):
   ```
   sed -E -i '' 's/(Class1|Class2|...)\.prototype\.([A-Za-z0-9]+)/piEnum(\1, "\2")/g' file.js
   ```
   Then add the `, "ModelFormat"` / `, "CorrectedFormat"` / `, "Correction"` hints to
   the ABE/DBE sample-format and correction sites. Leave PixelMath / BackgroundNeutralization
   bare. **Tip:** the diagnostic dump inside `piEnum` is the fastest way to learn a
   class's real constant names — let it fail once and read the printout, don't guess.

6. **`Dialog.execute()` result** — V8 exposes neither `Dialog.prototype.Accepted` nor a
   static. Use the truthy return directly: `if (dialog.execute()) { ... }` /
   `if (!dialog.execute()) { ... }`.

## V8 is stricter — non-engine bugs surface as port errors

These aren't "V8 API changes," they're latent bugs the old engine tolerated. Expect a
few once the script actually loads and runs:

- **`let` redeclaration in the same scope** → `SyntaxError: Identifier 'x' has
  already been declared`. The old engine let it slide; V8 doesn't. Fix: turn the second
  `let x = ...` into a bare reassignment `x = ...`. (AutoDBE: `sourceImage` declared
  twice in `executeGradientDescent`.) Proactively scan large functions for dup `let`s,
  but remember `let` is block-scoped, so dups in separate `if`/`for`/callback blocks are
  legal — only same-block dups error.

- **Process table-parameter schemas are fixed-width and validated.** E.g.
  `DynamicBackgroundExtraction.data()`: `Too few array elements for row 0: expected 8
  values; got 4`. DBE's `data` table always wants 3 channels (x, y, then z+w per channel
  = 8); `samples` wants 12 (x, y, radius, symmetries, axialCount, isFixed, then z+w ×3).
  Scripts that built rows sized to the image's actual channel count break on mono.
  Fix: always emit the full 3-channel width; for mono/2-channel, replicate the last real
  channel into the phantom columns (`dc = Math.min(c, channels - 1)`). `P.numberOfChannels`
  still tells the process how many are real, so padding is harmless. Watch for `undefined`
  creeping into numeric tables (index a guaranteed-array, not the possibly-short one).

## Order of operations that works well
`#engine v8` → comment out class-declaring includes (+ re-add needed `#define`s) →
`TextAlign.jsh` → `piEnum` resolver + bulk-convert `.prototype.<ENUM>` sites →
ES6-convert every `__base__` class → `ensureMinimumVersion` → then iterate on the
runtime errors (dup `let`, fixed-width process tables, etc.) one restart at a time.

## License note
SetiAstro scripts are CC BY-NC 4.0. Keep Franklin Marek's attribution; no commercial use.
