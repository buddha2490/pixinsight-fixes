#engine v8
#feature-id StatisticalStretch : Pixinsight-Fixes > Statistical Stretch
#feature-icon  statisticalstretch.svg
#feature-info This script performs a determines dynamically statistical properties of the image and logirthmically stretches accordingly.

/******************************************************************************
 *######################################################################
 *#        ___     __      ___       __                                #
 *#       / __/___/ /__   / _ | ___ / /________                        #
 *#      _\ \/ -_) _ _   / __ |(_-</ __/ __/ _ \                       #
 *#     /___/\__/_//_/  /_/ |_/___/\__/_/  \___/                       #
 *#                                                                    #
 *######################################################################
 *
 * Statistical Stretch Script
 * Version: 2.3
 * Author: Franklin Marek
 * Website: www.setiastro.com
 *
 * This script performs a determines dynamically statistical properties of the image and logirthmically stretches accordingly.
 *
 * This work is licensed under a Creative Commons Attribution-NonCommercial 4.0 International License.
 * To view a copy of this license, visit http://creativecommons.org/licenses/by-nc/4.0/
 *
 * You are free to:
 * 1. Share — copy and redistribute the material in any medium or format
 * 2. Adapt — remix, transform, and build upon the material
 *
 * Under the following terms:
 * 1. Attribution — You must give appropriate credit, provide a link to the license, and indicate if changes were made. You may do so in any reasonable manner, but not in any way that suggests the licensor endorses you or your use.
 * 2. NonCommercial — You may not use the material for commercial purposes.
 *
 * @license CC BY-NC 4.0 (http://creativecommons.org/licenses/by-nc/4.0/)
 *
 * COPYRIGHT © 2026 Franklin Marek. ALL RIGHTS RESERVED.
 ******************************************************************************/

#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/StdCursor.jsh>
// #include <pjsr/Sizer.jsh>        // native in V8
#define Align_Expand 0
#include <pjsr/FrameStyle.jsh>
// #include <pjsr/NumericControl.jsh> // native in V8
#include <pjsr/TextAlign.jsh>


// include constants
#include <pjsr/ImageOp.jsh>
#include <pjsr/SampleType.jsh>
#include <pjsr/UndoFlag.jsh>

#define TITLE "Statistical Astro Stretching"
#define VERSION "2.3"
#define DEBUGGING_MODE_ON false

// ============================================================================
// Helpers / Core Utilities
// ============================================================================

function calculate_image_median(var_image) {
   return var_image.median();
}

function configurePixelMath(P, doTruncate) {
   P.clearImageCacheAndExit = false;
   P.cacheGeneratedImages = false;
   P.generateOutput = true;
   P.singleThreaded = false;
   P.optimization = true;
   P.use64BitWorkingImage = true;
   P.rescale = false;
   P.rescaleLower = 0;
   P.rescaleUpper = 1;

   // Only truncate when we explicitly want it (usually final step)
   P.truncate = (doTruncate === true);
   P.truncateLower = 0;
   P.truncateUpper = 1;

   P.createNewImage = false;
   P.showNewImage = true;
}

function disableSTF(targetView) {
   var stf = new ScreenTransferFunction;
   var stfParams = [
      [0.00000, 1.00000, 0.50000, 0.00000, 1.00000],
      [0.00000, 1.00000, 0.50000, 0.00000, 1.00000],
      [0.00000, 1.00000, 0.50000, 0.00000, 1.00000],
      [0.00000, 1.00000, 0.50000, 0.00000, 1.00000]
   ];
   stf.STF = stfParams;
   stf.executeOn(targetView, false);
   console.writeln("STF has been disabled.");
}

function lumaCoeffs() {
   switch ((SHOParameters.lumaMode || "rec709").toLowerCase()) {
      case "rec601":  return [0.2990, 0.5870, 0.1140];
      case "rec2020": return [0.2627, 0.6780, 0.0593];
      case "rec709":
      default:        return [0.2126, 0.7152, 0.0722];
   }
}

function _hdrCompressExprMono(amount, knee) {
   return "" +
      "a = " + amount + ";\n" +
      "k = " + knee + ";\n" +
      // clamp knee to avoid div-by-zero and keep sane lower bound
      "k = min(0.999999, max(0.1, k));\n" +
      "x = $T;\n" +
      "hi = x > k;\n" +
      "t = (x - k)/(1 - k);\n" +
      "t = min(1, max(0, t));\n" +
      "t2 = t*t;\n" +
      "t3 = t2*t;\n" +
      "h10 = (t3 - 2*t2 + t);\n" +
      "h01 = (-2*t3 + 3*t2);\n" +
      "h11 = (t3 - t2);\n" +
      "m1 = min(5, max(1, 1 + 4*a));\n" +
      "f = h10*1 + h01*1 + h11*m1;\n" +
      "y = k + (1 - k)*min(1, max(0, f));\n" +
      "iif(hi, y, x);";
}

function _hdrCompressExprColor(amount, knee) {
   var C = lumaCoeffs();              // uses SHOParameters.lumaMode
   var cr = C[0], cg = C[1], cb = C[2];

   return "" +
      "a = " + amount + ";\n" +
      "k = " + knee + ";\n" +
      "k = min(0.999999, max(0.1, k));\n" +
      "R = $T[0]; G = $T[1]; B = $T[2];\n" +
      "cr = " + cr + "; cg = " + cg + "; cb = " + cb + ";\n" +
      "Y = cr*R + cg*G + cb*B;\n" +
      "hi = Y > k;\n" +
      "t = (Y - k)/(1 - k);\n" +
      "t = min(1, max(0, t));\n" +
      "t2 = t*t;\n" +
      "t3 = t2*t;\n" +
      "h10 = (t3 - 2*t2 + t);\n" +
      "h01 = (-2*t3 + 3*t2);\n" +
      "h11 = (t3 - t2);\n" +
      "m1 = min(5, max(1, 1 + 4*a));\n" +
      "f = h10*1 + h01*1 + h11*m1;\n" +
      "Yc = k + (1 - k)*min(1, max(0, f));\n" +
      // ✅ CRITICAL: only scale above knee
      "s = iif(hi, iif(Y <= 1.0e-10, 1, Yc/Y), 1);\n" +
      "$T * s;";
}

function _addHdrCompressProcess(container, isColor) {
   var H = new PixelMath;
   H.useSingleExpression = true;

   H.symbols = isColor
      ? "a,k,x,hi,t,t2,t3,h10,h01,h11,m1,f,y,R,G,B,cr,cg,cb,Y,Yc,s"
      : "a,k,x,hi,t,t2,t3,h10,h01,h11,m1,f,y";

   H.expression = isColor
      ? _hdrCompressExprColor(SHOParameters.hdrAmount, SHOParameters.hdrKnee)
      : _hdrCompressExprMono(SHOParameters.hdrAmount, SHOParameters.hdrKnee);

   configurePixelMath(H);
   container.add(H);
}
// ============================================================================
// Final curve boost (Bill Blanshan curve variant)
// ============================================================================

function applyFinalCurve(targetView, targetMedian) {
   let P = new CurvesTransformation();
   P.Bt = CurvesTransformation.AkimaSubsplines;

   P.K = [
      [0.00000, 0.00000],
      [0.5 * SHOParameters.targetMedian, 0.5 * SHOParameters.targetMedian],
      [SHOParameters.targetMedian, SHOParameters.targetMedian],
      [(1/4*(1-SHOParameters.targetMedian)+SHOParameters.targetMedian),
       Math.pow((1/4*(1-SHOParameters.targetMedian)+SHOParameters.targetMedian), (1-SHOParameters.curvesBoost))],
      [(3/4*(1-SHOParameters.targetMedian)+SHOParameters.targetMedian),
       Math.pow(Math.pow((3/4*(1-SHOParameters.targetMedian)+SHOParameters.targetMedian), (1-SHOParameters.curvesBoost)), (1-SHOParameters.curvesBoost))],
      [1.00000, 1.00000]
   ];

   P.St = CurvesTransformation.AkimaSubsplines;
   P.executeOn(targetView);
   console.noteln("Final Sigma Curves applied successfully after all iterations.");
}

// ============================================================================
// Clip estimator (Blackpoint Sigma step)
// ============================================================================

function _imgStats(imgLive) {
   // Work on a clone so we never mutate the live view state
   var img = new Image(imgLive);

   var nchan = img.isColor ? 3 : 1;
   var median = new Array(nchan);
   var mad    = new Array(nchan);
   var minv   = new Array(nchan);

   var oldSel = img.selectedChannel;

   try {
      for (var c = 0; c < nchan; c++) {
         img.selectedChannel = c;
         median[c] = img.median();
         mad[c]    = img.MAD();
         minv[c]   = img.minimum();
      }
   } finally {
      // Restore on the clone (mostly irrelevant, but correct)
      img.selectedChannel = oldSel;
   }

   return { median: median, mad: mad, minimum: minv, isColor: img.isColor, nchan: nchan };
}

function _computeBP_thresholds(img) {
   // Returns { mode:"mono"|"linked"|"lumaOnly"|"unlinked", bp: number or [bpR,bpG,bpB] }
   var st = _imgStats(img);

   var sigma = 1.4826; // robust sigma from MAD
   var k = SHOParameters.blackpointSigma;
   var noClip = !!SHOParameters.noBlackClip;

   if (!img.isColor) {
      var Med = st.median[0];
      var Sig = sigma * st.mad[0];
      var BPraw = Med - k * Sig;
      var MinC = st.minimum[0];
      var BP = noClip ? MinC : (BPraw < MinC ? MinC : BPraw);
      return { mode: "mono", bp: BP };
   }

   // Color
   if (SHOParameters.linkedStretch || SHOParameters.lumaOnly) {
      // scalar BP based on chosen luma weights (matches your linked/luma-only Step 1)
      var C = lumaCoeffs();
      var cr = C[0], cg = C[1], cb = C[2];

      var Med = cr*st.median[0] + cg*st.median[1] + cb*st.median[2];
      var Sig = sigma * (cr*st.mad[0] + cg*st.mad[1] + cb*st.mad[2]);
      var MinC = Math.min(st.minimum[0], st.minimum[1], st.minimum[2]);
      var BPraw = Med - k * Sig;
      var BP = noClip ? MinC : (BPraw < MinC ? MinC : BPraw);

      return { mode: (SHOParameters.lumaOnly ? "lumaOnly" : "linked"), bp: BP };
   }

   // Unlinked: per-channel BP (matches your per-channel Step 1)
   var bp = [];
   for (var c = 0; c < 3; c++) {
      var Medc = st.median[c];
      var Sigc = sigma * st.mad[c];
      var BPrawc = Medc - k * Sigc;
      var Minc = st.minimum[c];
      var BPc = noClip ? Minc : (BPrawc < Minc ? Minc : BPrawc);
      bp.push(BPc);
   }
   return { mode: "unlinked", bp: bp };
}

function _estimateClippedPixels_Blackpoint(img, maxSamples) {
   // Returns { clippedEst:int, total:int, sampled:int, stride:int, bpInfo:{...} }
   // Uses grid sampling when needed (estimate), exact when stride==1.

   maxSamples = maxSamples || 1000000; // ~1e6 samples max

   var w = img.width, h = img.height;
   var total = w * h;

   // Pick stride so sampled pixels <= maxSamples
   var stride = 1;
   if (total > maxSamples) {
      stride = Math.max(1, Math.floor(Math.sqrt(total / maxSamples)));
   }

   var bpInfo = _computeBP_thresholds(img);
   var clipped = 0;
   var sampled = 0;

   if (!img.isColor) {
      var BP = bpInfo.bp;
      for (var y = 0; y < h; y += stride) {
         for (var x = 0; x < w; x += stride) {
            var v = img.sample(x, y);
            if (v < BP) clipped++;
            sampled++;
         }
      }
   } else {
      if (bpInfo.mode === "unlinked") {
         var bpr = bpInfo.bp[0], bpg = bpInfo.bp[1], bpb = bpInfo.bp[2];
         for (var y = 0; y < h; y += stride) {
            for (var x = 0; x < w; x += stride) {
               var r = img.sample(x, y, 0);
               var g = img.sample(x, y, 1);
               var b = img.sample(x, y, 2);
               if (r < bpr || g < bpg || b < bpb) clipped++;
               sampled++;
            }
         }
      } else {
         // scalar BP applied to all channels -> clip if any channel < BP
         var BPc = bpInfo.bp;
         for (var y = 0; y < h; y += stride) {
            for (var x = 0; x < w; x += stride) {
               var r = img.sample(x, y, 0);
               var g = img.sample(x, y, 1);
               var b = img.sample(x, y, 2);
               if (Math.min(r, g, b) < BPc) clipped++;
               sampled++;
            }
         }
      }
   }

   // Scale up if estimated
   var clippedEst = (stride === 1)
      ? clipped
      : Math.round(clipped * (total / sampled));

   return { clippedEst: clippedEst, total: total, sampled: sampled, stride: stride, bpInfo: bpInfo };
}

function _fmtInt(n) {
   // PixInsight JS is old-school; keep it simple
   return "" + Math.round(n);
}


// ============================================================================
// Stretch implementations
//   - Mono
//   - Color linked
//   - Color unlinked
//   - Optional HDR compress (HDRMultiscaleTransform, SASpro style)
//   - Optional Luma-only mode: stretch luma, rescale RGB to preserve chroma
// ============================================================================

function processMonoImage(targetView, targetMedian, iteration) {
   var P = new ProcessContainer;

   // Step 1: robust blackpoint / rescale
   var P001 = new PixelMath;
   P001.expression =
      "Med = med($T);\n" +
      "Sig = 1.4826*MAD($T);\n" +
      "BPraw = Med - " + SHOParameters.blackpointSigma + "*Sig;\n" +
      "BP = iif(" + (SHOParameters.noBlackClip ? "1" : "0") + ", min($T), iif(BPraw < min($T), min($T), BPraw));\n" +
      "Rescaled = ($T - BP) / (1 - BP);\n" +
      "Rescaled;";
   P001.useSingleExpression = true;
   P001.symbols = "Med, Sig, BPraw, BP, Rescaled";
   configurePixelMath(P001, false);
   P.add(P001);

   // Step 2: midtones-transfer closed form
   var P002 = new PixelMath;
   P002.expression =
      "((Med($T)-1)*" + targetMedian + "*$T)/(Med($T)*(" + targetMedian + "+$T-1)-" + targetMedian + "*$T)";
   P002.useSingleExpression = true;
   P002.symbols = "L, S";
   configurePixelMath(P002, false);
   P.add(P002);

   // Step 3: optional normalize
   var P003 = new PixelMath;
   P003.expression = SHOParameters.normalizeImageRange ? "$T/max($T)" : "$T;";
   P003.useSingleExpression = true;
   P003.symbols = "L, Mcolor, S";
   configurePixelMath(P003, true);
   P.add(P003);

   // Step 4: optional HDR compress (SASpro Hermite soft-knee)
   if (SHOParameters.hdrCompress && SHOParameters.hdrAmount > 0) {
      _addHdrCompressProcess(P, /*isColor=*/false);
   }

   P.executeOn(targetView);
   console.noteln("Mono Image Statistical Stretch completed successfully for iteration " + iteration + ".");
}

function processColorImage(targetView, targetMedian, iteration) {
   // Luma-only mode supports blending:
   // 0 = normal linked, 1 = pure luma-only
   if (SHOParameters.lumaOnly) {
      var b = Math.max(0, Math.min(1, SHOParameters.lumaBlend));
      if (b <= 0.000001) {
         // behave like normal linked stretch
         SHOParameters.lumaOnly = false;              // temporary bypass
         processColorImage(targetView, targetMedian, iteration);
         SHOParameters.lumaOnly = true;
      } else if (b >= 0.999999) {
         processColorImage_LumaOnly(targetView, targetMedian, iteration);
      } else {
         processColorImage_LumaBlend(targetView, targetMedian, iteration);
      }
      return;
   }
   var P = new ProcessContainer;

   // Step 1: robust blackpoint / rescale based on *luma-like* global stats
   // NOTE: PixelMath cannot do med(Y) where Y is a computed scalar.
   // Workaround: compute luma-median as weighted sum of channel medians.
   // Same for MAD (robust sigma).
   var P001 = new PixelMath;
   P001.expression =
      "cr=0.2126; cg=0.7152; cb=0.0722;\n" +
      "Med = cr*med($T[0]) + cg*med($T[1]) + cb*med($T[2]);\n" +
      "Sig = 1.4826*(cr*MAD($T[0]) + cg*MAD($T[1]) + cb*MAD($T[2]));\n" +
      "MinC = min(min($T[0]),min($T[1]),min($T[2]));\n" +
      "BPraw = Med - " + SHOParameters.blackpointSigma + "*Sig;\n" +
      "BP = iif(" + (SHOParameters.noBlackClip ? "1" : "0") + ", MinC, iif(BPraw < MinC, MinC, BPraw));\n" +
      "Rescaled = ($T - BP) / (1 - BP);\n" +
      "Rescaled;";
   P001.useSingleExpression = true;
   P001.symbols = "cr,cg,cb,Med,Sig,MinC,BPraw,BP,Rescaled";
   configurePixelMath(P001, false);
   P.add(P001);

   // Step 2: closed-form midtones mapping using average channel median
   var P002 = new PixelMath;
   P002.expression =
      "MedianColor = avg(Med($T[0]),Med($T[1]),Med($T[2]));\n" +
      "((MedianColor-1)*" + targetMedian + "*$T)/(MedianColor*(" + targetMedian + "+$T-1)-" + targetMedian + "*$T)";
   P002.useSingleExpression = true;
   P002.symbols = "L, MedianColor, S";
   configurePixelMath(P002, false);
   P.add(P002);

   // Step 3: optional normalize
   var P003 = new PixelMath;
   P003.expression = SHOParameters.normalizeImageRange
      ? "Mcolor=max(max($T[0]),max($T[1]),max($T[2]));\n$T/Mcolor;"
      : "$T;";
   P003.useSingleExpression = true;
   P003.symbols = "L, Mcolor, S";
   configurePixelMath(P003, true);
   P.add(P003);

   // Step 4: optional HDR compress (SASpro Hermite soft-knee)
   if (SHOParameters.hdrCompress && SHOParameters.hdrAmount > 0) {
      _addHdrCompressProcess(P, /*isColor=*/true);
   }

   P.executeOn(targetView);
   console.noteln("Color Image Statistical Stretch completed successfully for iteration " + iteration + ".");
}

function processColorImage_LumaBlend(targetView, targetMedian, iteration) {
   var P = new ProcessContainer;

   // Use chosen luma mode weights (rec709/601/2020)
   var C = lumaCoeffs();
   var cr = C[0], cg = C[1], cb = C[2];

   // Step 1: robust blackpoint / rescale using chosen luma weights
   var P001 = new PixelMath;
   P001.expression =
      "cr=" + cr + "; cg=" + cg + "; cb=" + cb + ";\n" +
      "Med = cr*med($T[0]) + cg*med($T[1]) + cb*med($T[2]);\n" +
      "Sig = 1.4826*(cr*MAD($T[0]) + cg*MAD($T[1]) + cb*MAD($T[2]));\n" +
      "MinC = min(min($T[0]),min($T[1]),min($T[2]));\n" +
      "BPraw = Med - " + SHOParameters.blackpointSigma + "*Sig;\n" +
      "BP = iif(" + (SHOParameters.noBlackClip ? "1" : "0") + ", MinC, iif(BPraw < MinC, MinC, BPraw));\n" +
      "Rescaled = ($T - BP) / (1 - BP);\n" +
      "Rescaled;";
   P001.useSingleExpression = true;
   P001.symbols = "cr,cg,cb,Med,Sig,MinC,BPraw,BP,Rescaled";
   configurePixelMath(P001, false);
   P.add(P001);

   // Step 2: compute Linked stretch + Luma-only stretch, then blend by b
   var b = Math.max(0, Math.min(1, SHOParameters.lumaBlend));

   var P002 = new PixelMath;
   P002.expression =
      "cr=" + cr + "; cg=" + cg + "; cb=" + cb + ";\n" +

      // Per-pixel luminance
      "Y = cr*$T[0] + cg*$T[1] + cb*$T[2];\n" +

      // Channel medians
      "mr = med($T[0]); mg = med($T[1]); mb = med($T[2]);\n" +

      // Normal linked statistical stretch (your existing linked step2)
      "MedianColor = avg(mr,mg,mb);\n" +
      "Linked = ((MedianColor-1)*" + targetMedian + "*$T)/(MedianColor*(" + targetMedian + "+$T-1)-" + targetMedian + "*$T);\n" +

      // Luma-only stretch: stretch Y -> Y' then scale RGB by Y'/Y
      "mY = cr*mr + cg*mg + cb*mb;\n" +
      "Yp = ((mY-1)*" + targetMedian + "*Y)/(mY*(" + targetMedian + "+Y-1)-" + targetMedian + "*Y);\n" +
      "f = iif(Y<=1.0e-10, 1, Yp/Y);\n" +
      "Luma = $T*f;\n" +

      // Blend: 0 = normal linked, 1 = pure luma-only
      "b=" + b + ";\n" +
      "((1-b)*Linked + b*Luma);";

   P002.useSingleExpression = true;
   P002.symbols = "cr,cg,cb,Y,mr,mg,mb,MedianColor,Linked,mY,Yp,f,Luma,b";
   configurePixelMath(P002, false);
   P.add(P002);

   // Step 3: optional normalize
   var P003 = new PixelMath;
   P003.expression = SHOParameters.normalizeImageRange
      ? "Mcolor=max(max($T[0]),max($T[1]),max($T[2]));\n$T/Mcolor;"
      : "$T;";
   P003.useSingleExpression = true;
   P003.symbols = "Mcolor";
   configurePixelMath(P003, true);
   P.add(P003);

   // Step 4: optional HDR compress
   if (SHOParameters.hdrCompress && SHOParameters.hdrAmount > 0) {
      _addHdrCompressProcess(P, /*isColor=*/true);
   }

   P.executeOn(targetView);
   console.noteln("Color (Luma Blend) Statistical Stretch completed successfully for iteration " + iteration + ".");
}


function processColorImage_LumaOnly(targetView, targetMedian, iteration) {
   var P = new ProcessContainer;

   var C = lumaCoeffs();
   var cr = C[0], cg = C[1], cb = C[2];

   // Step 1: robust blackpoint / rescale using chosen luma
   var P001 = new PixelMath;
   P001.expression =
      "cr=" + cr + "; cg=" + cg + "; cb=" + cb + ";\n" +
      "Med = cr*med($T[0]) + cg*med($T[1]) + cb*med($T[2]);\n" +
      "Sig = 1.4826*(cr*MAD($T[0]) + cg*MAD($T[1]) + cb*MAD($T[2]));\n" +
      "MinC = min(min($T[0]),min($T[1]),min($T[2]));\n" +
      "BPraw = Med - " + SHOParameters.blackpointSigma + "*Sig;\n" +
      "BP = iif(" + (SHOParameters.noBlackClip ? "1" : "0") + ", MinC, iif(BPraw < MinC, MinC, BPraw));\n" +
      "Rescaled = ($T - BP) / (1 - BP);\n" +
      "Rescaled;";
   P001.useSingleExpression = true;
   P001.symbols = "cr,cg,cb,Med,Sig,MinC,BPraw,BP,Rescaled";
   configurePixelMath(P001, false);
   P.add(P001);

   // Step 2: compute luma, compute luma-stretch, scale RGB by Y'/Y
   var P002 = new PixelMath;
   P002.expression =
      "cr=" + cr + "; cg=" + cg + "; cb=" + cb + ";\n" +
      // Build per-pixel luminance for scaling:
      "Y = cr*$T[0] + cg*$T[1] + cb*$T[2];\n" +
      // Global luma median approximation (PixelMath-safe):
      "m = cr*med($T[0]) + cg*med($T[1]) + cb*med($T[2]);\n" +
      "Yp = ((m-1)*" + targetMedian + "*Y)/(m*(" + targetMedian + "+Y-1)-" + targetMedian + "*Y);\n" +
      "f = iif(Y<=1.0e-10, 1, Yp/Y);\n" +
      "$T*f;";
   P002.useSingleExpression = true;
   P002.symbols = "cr,cg,cb,Y,m,Yp,f";
   configurePixelMath(P002, false);
   P.add(P002);
   // Step 3: optional normalize
   var P003 = new PixelMath;
   P003.expression = SHOParameters.normalizeImageRange
      ? "Mcolor=max(max($T[0]),max($T[1]),max($T[2]));\n$T/Mcolor;"
      : "$T;";
   P003.useSingleExpression = true;
   P003.symbols = "Mcolor";
   configurePixelMath(P003, true);
   P.add(P003);

   // Step 4: optional HDR compress (SASpro Hermite soft-knee)
   if (SHOParameters.hdrCompress && SHOParameters.hdrAmount > 0) {
      _addHdrCompressProcess(P, /*isColor=*/true);
   }

   P.executeOn(targetView);
   console.noteln("Color (Luma Only) Statistical Stretch completed successfully for iteration " + iteration + ".");
}

function processUnlinkedColorImage(targetView, targetMedian, iteration) {
   // If luma-only is enabled, unlinked makes no sense; force linked behavior.
   if (SHOParameters.lumaOnly) {
      // If blend is essentially 0, behave like normal linked stretch (fall through).
      if (SHOParameters.lumaBlend > 0.000001) {
         processColorImage_LumaOnly(targetView, targetMedian, iteration);
         return;
      }
      // else: fall through to normal linked/unlinked behavior below
   }
   var P = new ProcessContainer;

   // Step 1: robust blackpoint / rescale per channel
   var P001 = new PixelMath;
   P001.useSingleExpression = false;

   // IMPORTANT: In per-channel mode ($T is already the current channel).
   // Do NOT use $T[0]/$T[1]/$T[2] here.
   P001.expression =
      "Med = med($T);\n" +
      "Sig = 1.4826*MAD($T);\n" +
      "BPraw = Med - " + SHOParameters.blackpointSigma + "*Sig;\n" +
      "BP = iif(" + (SHOParameters.noBlackClip ? "1" : "0") + ", min($T), iif(BPraw < min($T), min($T), BPraw));\n" +
      "Rescaled = ($T - BP) / (1 - BP);\n" +
      "Rescaled;";

   P001.expression1 =
      "Med = med($T);\n" +
      "Sig = 1.4826*MAD($T);\n" +
      "BPraw = Med - " + SHOParameters.blackpointSigma + "*Sig;\n" +
      "BP = iif(" + (SHOParameters.noBlackClip ? "1" : "0") + ", min($T), iif(BPraw < min($T), min($T), BPraw));\n" +
      "Rescaled = ($T - BP) / (1 - BP);\n" +
      "Rescaled;";

   P001.expression2 =
      "Med = med($T);\n" +
      "Sig = 1.4826*MAD($T);\n" +
      "BPraw = Med - " + SHOParameters.blackpointSigma + "*Sig;\n" +
      "BP = iif(" + (SHOParameters.noBlackClip ? "1" : "0") + ", min($T), iif(BPraw < min($T), min($T), BPraw));\n" +
      "Rescaled = ($T - BP) / (1 - BP);\n" +
      "Rescaled;";

   P001.symbols = "Med,Sig,BPraw,BP,Rescaled";
   configurePixelMath(P001, false);
   P.add(P001);

   // Step 2: midtones mapping per channel
   var b = Math.max(0, Math.min(1, SHOParameters.lumaBlend));
   var C = lumaCoeffs();
   var cr = C[0], cg = C[1], cb = C[2];

   var P002 = new PixelMath;
   P002.expression =
      "cr=" + cr + "; cg=" + cg + "; cb=" + cb + ";\n" +

      // per-pixel luminance
      "Y = cr*$T[0] + cg*$T[1] + cb*$T[2];\n" +

      // global medians for linked stretch path
      "mr = med($T[0]); mg = med($T[1]); mb = med($T[2]);\n" +
      "MedianColor = avg(mr,mg,mb);\n" +

      // linked stretch result (same closed-form as your linked color step2)
      "Linked = ((MedianColor-1)*" + targetMedian + "*$T)/(MedianColor*(" + targetMedian + "+$T-1)-" + targetMedian + "*$T);\n" +

      // luma-only stretch result: compute Y' then scale RGB by Y'/Y
      "mY = cr*mr + cg*mg + cb*mb;\n" +
      "Yp = ((mY-1)*" + targetMedian + "*Y)/(mY*(" + targetMedian + "+Y-1)-" + targetMedian + "*Y);\n" +
      "f = iif(Y<=1.0e-10, 1, Yp/Y);\n" +
      "Luma = $T*f;\n" +

      // blend: 0=linked, 1=luma-only
      "b=" + b + ";\n" +
      "((1-b)*Linked + b*Luma);";

   P002.useSingleExpression = true;
   P002.symbols = "cr,cg,cb,Y,mr,mg,mb,MedianColor,Linked,mY,Yp,f,Luma,b";
   configurePixelMath(P002, false);
   P.add(P002);

   // Step 3: optional normalize per channel
   var P003 = new PixelMath;
   P003.useSingleExpression = false;

   P003.expression  = SHOParameters.normalizeImageRange ? "$T/max($T)" : "$T;";
   P003.expression1 = SHOParameters.normalizeImageRange ? "$T/max($T)" : "$T;";
   P003.expression2 = SHOParameters.normalizeImageRange ? "$T/max($T)" : "$T;";

   configurePixelMath(P003, true);
   P.add(P003);

   // Step 4: optional HDR compress (SASpro: compress luma then rescale RGB)
   if (SHOParameters.hdrCompress && SHOParameters.hdrAmount > 0) {
      _addHdrCompressProcess(P, /*isColor=*/true);
   }

   P.executeOn(targetView);
   console.noteln("Unlinked Color Image Stretch completed successfully for iteration " + (iteration || 1) + ".");
}


// ============================================================================
// Global parameters object (persisted)
// ============================================================================

var SHOParameters = {
   targetViewId: undefined,
   targetMedian: 0.25,
   curvesBoost: 0.00,
   numIterations: 1,
   normalizeImageRange: false,
   linkedStretch: true,
   openDialogbox: true,
   autoConvergence: false,

   blackpointSigma: 5.0,
   noBlackClip: false,

   hdrCompress: false,
   hdrAmount: 0.25,
   hdrKnee: 0.35,

   lumaOnly: false,
   lumaMode: "rec709",
   lumaBlend: 0.60,

   targetView: undefined,

   newInstance: function() {
      console.writeln("New instance created.");
   },

   save: function() {
      Parameters.set("targetViewId", this.targetViewId);
      Parameters.set("targetMedian", this.targetMedian);
      Parameters.set("curvesBoost", this.curvesBoost);
      Parameters.set("numIterations", this.numIterations);
      Parameters.set("normalizeImageRange", this.normalizeImageRange);
      Parameters.set("linkedStretch", this.linkedStretch);
      Parameters.set("openDialogbox", this.openDialogbox);
      Parameters.set("autoConvergence", this.autoConvergence);

      Parameters.set("blackpointSigma", this.blackpointSigma);
      Parameters.set("noBlackClip", this.noBlackClip);

      Parameters.set("hdrCompress", this.hdrCompress);
      Parameters.set("hdrAmount", this.hdrAmount);
      Parameters.set("hdrKnee", this.hdrKnee);

      Parameters.set("lumaOnly", this.lumaOnly);
      Parameters.set("lumaMode", this.lumaMode);
      Parameters.set("lumaBlend", this.lumaBlend);
   },

   load: function() {
      if (Parameters.has("targetViewId"))
         this.targetViewId = Parameters.getString("targetViewId");

      if (Parameters.has("targetMedian"))
         this.targetMedian = Parameters.getReal("targetMedian");
      if (Parameters.has("curvesBoost"))
         this.curvesBoost = Parameters.getReal("curvesBoost");
      if (Parameters.has("numIterations"))
         this.numIterations = Parameters.getInteger("numIterations");
      if (Parameters.has("normalizeImageRange"))
         this.normalizeImageRange = Parameters.getBoolean("normalizeImageRange");
      if (Parameters.has("linkedStretch"))
         this.linkedStretch = Parameters.getBoolean("linkedStretch");
      if (Parameters.has("openDialogbox"))
         this.openDialogbox = Parameters.getBoolean("openDialogbox");
      if (Parameters.has("autoConvergence"))
         this.autoConvergence = Parameters.getBoolean("autoConvergence");

      if (Parameters.has("blackpointSigma"))
         this.blackpointSigma = Parameters.getReal("blackpointSigma");
      if (Parameters.has("noBlackClip"))
         this.noBlackClip = Parameters.getBoolean("noBlackClip");

      if (Parameters.has("hdrCompress"))
         this.hdrCompress = Parameters.getBoolean("hdrCompress");
      if (Parameters.has("hdrAmount"))
         this.hdrAmount = Parameters.getReal("hdrAmount");
      if (Parameters.has("hdrKnee"))
         this.hdrKnee = Parameters.getReal("hdrKnee");

      if (Parameters.has("lumaOnly"))
         this.lumaOnly = Parameters.getBoolean("lumaOnly");
      if (Parameters.has("lumaMode"))
         this.lumaMode = Parameters.getString("lumaMode");
      if (Parameters.has("lumaBlend"))
         this.lumaBlend = Parameters.getReal("lumaBlend");

      // Resolve target view if possible
      this.targetView = undefined;
      if (this.targetViewId) {
         var w = ImageWindow.windowById(this.targetViewId);
         if (w && !w.isNull)
            this.targetView = w.mainView;
      }

      // If invoked as a view-targeted instance, prefer that
      if (Parameters.isViewTarget && Parameters.targetView)
         this.targetView = Parameters.targetView;
   }
};

// Load once at script start
SHOParameters.load();

// ============================================================================
// ScrollControl (preview widget)
// ============================================================================

class ScrollControl extends ScrollBox {
   constructor(parent) {
   super(parent);

   this.scrollPosition = new Point(0, 0);
   this.zoomFactor = 1.0;
   this.minZoomFactor = 0.1;
   this.maxZoomFactor = 10.0;
   this.autoScroll = true;
   this.tracking = true;
   this.displayImage = null;
   this.dragging = false;
   this.dragOrigin = new Point(0, 0);

   this.getImage = function () {
      return this.displayImage;
   };

   this.doUpdateImage = function (image) {
      if (image)
         this.displayImage = image;

      this.scrollPosition = new Point(0, 0);
      this.initScrollBars();
      this.viewport.update();
   };

   this.initScrollBars = function () {
      const image = this.getImage();
      if (!image || image.width <= 0 || image.height <= 0) {
         this.setHorizontalScrollRange(0, 0);
         this.setVerticalScrollRange(0, 0);
         this.scrollPosition = new Point(0, 0);
      } else {
         const zoomedWidth = image.width * this.zoomFactor;
         const zoomedHeight = image.height * this.zoomFactor;

         this.setHorizontalScrollRange(0, Math.max(0, zoomedWidth - this.viewport.width));
         this.setVerticalScrollRange(0, Math.max(0, zoomedHeight - this.viewport.height));

         this.scrollPosition = new Point(
            Math.min(this.scrollPosition.x, zoomedWidth - this.viewport.width),
            Math.min(this.scrollPosition.y, zoomedHeight - this.viewport.height)
         );
      }
      this.viewport.update();
   };

   this.viewport.onResize = function () {
      this.parent.initScrollBars();
   };

   this.onHorizontalScrollPosUpdated = function (x) {
      this.viewport.update();
   };

   this.onVerticalScrollPosUpdated = function (y) {
      this.viewport.update();
   };

   this.viewport.onMousePress = function (x, y, button, buttons, modifiers) {
      this.cursor = new Cursor(StdCursor_ClosedHand);
      this.parent.dragging = true;
      this.parent.dragOrigin = new Point(x, y);
   };

   this.viewport.onMouseMove = function(x, y, buttons, modifiers) {
      const image = this.parent.getImage();
      if (!image)
         return;

      var p = this.parent;
         if (p.dragging) {
            p.scrollPosition = new Point(p.scrollPosition)
               .translatedBy((p.dragOrigin.x - x), (p.dragOrigin.y - y));
            p.dragOrigin.x = x;
            p.dragOrigin.y = y;
         } else {
            var imageX = Math.floor((x / p.zoomFactor + p.scrollPosition.x));
            var imageY = Math.floor((y / p.zoomFactor + p.scrollPosition.y));

            if (image && imageX >= 0 && imageX < image.width && imageY >= 0 && imageY < image.height) {
               if (image.isColor) {
                  let pixelValue = [
                     image.sample(imageX, imageY, 0),
                     image.sample(imageX, imageY, 1),
                     image.sample(imageX, imageY, 2)
                  ];
                  p.parent.pixelValueLabel.text =
                     "RGB: R=" + pixelValue[0].toFixed(3) +
                     ", G=" + pixelValue[1].toFixed(3) +
                     ", B=" + pixelValue[2].toFixed(3);
               } else {
                  let v = image.sample(imageX, imageY);
                  p.parent.pixelValueLabel.text = "K Value: " + v.toFixed(3);
               }
            } else {
               p.parent.pixelValueLabel.text = "Pixel Value: Out of Bounds";
            }
         }
   };

   this.viewport.onMouseRelease = function (x, y, button, buttons, modifiers) {
      this.cursor = new Cursor(StdCursor_Arrow);
      this.parent.dragging = false;
   };

   this.viewport.onMouseWheel = function (x, y, delta) {
      const parent = this.parent;
      const oldZoomFactor = parent.zoomFactor;

      if (delta > 0)
         parent.zoomFactor = Math.min(parent.zoomFactor * 1.25, parent.maxZoomFactor);
      else if (delta < 0)
         parent.zoomFactor = Math.max(parent.zoomFactor * 0.8, parent.minZoomFactor);

      const zoomRatio = parent.zoomFactor / oldZoomFactor;

      parent.scrollPosition = new Point(
         (parent.scrollPosition.x + x) * zoomRatio - x,
         (parent.scrollPosition.y + y) * zoomRatio - y
      );

      parent.initScrollBars();
      this.update();
   };

   this.viewport.onPaint = function (x0, y0, x1, y1) {
      const g = new Graphics(this);
      const image = this.parent.getImage();
      const zoomFactor = this.parent.zoomFactor;

      if (!image) {
         g.fillRect(x0, y0, x1, y1, new Brush(0xff000000));
      } else {
         g.scaleTransformation(zoomFactor);
         g.translateTransformation(-this.parent.scrollPosition.x, -this.parent.scrollPosition.y);
         g.drawBitmap(0, 0, image.render());
      }
      g.end();
      gc();
   };

   this.initScrollBars();
}
}

// ============================================================================
// Dialog
// ============================================================================

class MyDialog extends Dialog {
   constructor() {
   super();

   var self = this;

   // ----------------------------
   // Instructions text + popup
   // ----------------------------
   this._instructionsText =
      "Select your image in the dropdown.\n\n" +
      "Target Median sets how bright the final stretch will be:\n" +
      "   0.10 is a good start for compact targets (galaxies / PN).\n" +
      "   0.25 is a good start for large nebula filling the frame.\n\n" +
      "Blackpoint Sigma controls how aggressively shadows are lifted:\n" +
      "   Higher values protect the background (darker result).\n" +
      "   Lower values lift more faint detail (brighter background).\n\n" +
      "No Black Clip prevents crushing true blacks:\n" +
      "   ON  = preserves the image minimum (safer for already-dark data).\n" +
      "   OFF = allows a computed blackpoint (more contrast, can clip if pushed).\n\n" +
      "HDR Compress tames bright cores/highlights after the stretch:\n" +
      "   HDR Amount controls strength (higher = more compression).\n" +
      "   HDR Knee sets where compression starts (lower = affects more of the image).\n\n" +
      "Luma Only (color images) stretches luminance and preserves chroma:\n" +
      "   Use Luma Mode to choose the luminance weighting (rec709 recommended).\n\n" +
      "   Luma Blend: 0 = normal linked stretch, 1 = pure luma-only.\n\n" +
      "Linked Stretch keeps RGB channels together (recommended for color balance).\n" +
      "Unlinked Stretch stretches each channel independently (can shift color).\n" +
      "Normalize scales the final result to fill the range [0,1].\n\n" +
      "Use Preview Refresh to update the preview.\n" +
      "MouseWheel or Zoom Buttons to zoom.";

   this._showInstructionsDialog = function () {

      class InstructionsDialog extends Dialog {
         constructor(parent, text) {
         super();

         this.windowTitle = TITLE + " - Instructions";

         this.sizer = new VerticalSizer;
         this.sizer.margin = 10;
         this.sizer.spacing = 6;

         // Use TextBox if available; fallback to Edit
         var box = null;
         try { box = new TextBox(this); } catch (e) { box = new Edit(this); }

         box.readOnly = true;
         box.wordWrapping = true;
         box.styleSheet = "font-size: 9pt; padding: 8px; background-color: #f7f7ff;";
         box.setMinSize(520, 500);
         box.text = text;

         // try to ensure top
         try { box.cursorPosition = 0; } catch (e) {}
         try { box.setSelection(0, 0); } catch (e) {}

         this.sizer.add(box, 100);

         var btnRow = new HorizontalSizer;
         btnRow.addStretch();

         var closeBtn = new PushButton(this);
         closeBtn.text = "Close";
         closeBtn.onClick = function () { this.dialog.ok(); };
         btnRow.add(closeBtn);

         this.sizer.add(btnRow);
         this.adjustToContents();
      }
      }

      var dlg = new InstructionsDialog(self, self._instructionsText);
      dlg.execute();
   };

   // ----------------------------
   // Preview control
   // ----------------------------
   this.previewControl = new ScrollControl(this);
   this.previewControl.setMinWidth(600);
   this.previewControl.setMinHeight(450);

   // ----------------------------
   // Utility: make temporary image at selected zoom
   // ----------------------------
   this.createTemporaryImage = function (selectedImage) {
      var window = new ImageWindow(
         selectedImage.width, selectedImage.height,
         selectedImage.numberOfChannels,
         selectedImage.bitsPerSample,
         selectedImage.isReal,
         selectedImage.isColor
      );

      window.mainView.beginProcess();
      window.mainView.image.assign(selectedImage);
      window.mainView.endProcess();

      var P = new IntegerResample;

      switch (self.zoomLevelComboBox.currentItem) {
         case 0: P.zoomFactor = -1; break;  // 1:1
         case 1: P.zoomFactor = -2; break;  // 1:2
         case 2: P.zoomFactor = -4; break;  // 1:4
         case 3: P.zoomFactor = -8; break;  // 1:8
         case 4: // Fit
            var previewWidth = self.previewControl.width;
            var widthScale = Math.floor(selectedImage.width / previewWidth);
            P.zoomFactor = -Math.max(widthScale, 1);
            break;
         default:
            P.zoomFactor = -2;
            break;
      }

      P.executeOn(window.mainView);

      var resizedImage = new Image(window.mainView.image);

      if (resizedImage.width > 0 && resizedImage.height > 0) {
         self.previewControl.displayImage = resizedImage;
         self.previewControl.doUpdateImage(resizedImage);
         self.previewControl.initScrollBars();
      } else {
         console.error("Resized image has invalid dimensions.");
      }

      window.forceClose();
      return resizedImage;
   };

   // ----------------------------
   // Preview processing (hidden window)
   // ----------------------------
   this.processPreview = function (selectedImage) {
      var processingWindow = new ImageWindow(
         selectedImage.width, selectedImage.height,
         selectedImage.numberOfChannels,
         selectedImage.bitsPerSample,
         selectedImage.isReal,
         selectedImage.isColor
      );

      if (!processingWindow || processingWindow.isNull) {
         console.writeln("Failed to create processing window.");
         return;
      }

      processingWindow.hide();
      processingWindow.mainView.beginProcess();
      processingWindow.mainView.image.assign(selectedImage);
      processingWindow.mainView.endProcess();

      var iterations = SHOParameters.autoConvergence ? 5 : SHOParameters.numIterations;
      iterations = Math.min(iterations, 5);

      for (var i = 0; i < iterations; i++) {
         if (processingWindow.mainView.image.isColor) {
            if (self.linkedStretchCheckbox.checked)
               processColorImage(processingWindow.mainView, SHOParameters.targetMedian, i + 1);
            else
               processUnlinkedColorImage(processingWindow.mainView, SHOParameters.targetMedian, i + 1);
         } else {
            processMonoImage(processingWindow.mainView, SHOParameters.targetMedian, i + 1);
         }

         if (SHOParameters.autoConvergence) {
            var currentMedian = calculate_image_median(processingWindow.mainView.image);
            if (Math.abs(currentMedian - SHOParameters.targetMedian) < 0.001)
               break;
         }
      }

      if (SHOParameters.curvesBoost > 0)
         applyFinalCurve(processingWindow.mainView, SHOParameters.targetMedian);

      var tempImage = self.createTemporaryImage(processingWindow.mainView.image);
      if (tempImage)
         self.previewControl.doUpdateImage(tempImage);

      processingWindow.forceClose();
   };

   // ----------------------------
   // Layout
   // ----------------------------
   this.mainSizer = new HorizontalSizer;
   this.mainSizer.spacing = 6;
   this.mainSizer.margin = 10;

   this.leftSizer = new VerticalSizer;
   this.leftSizer.spacing = 6;

// --- Title row (just the title)
this.titleRow = new HorizontalSizer;
this.titleRow.spacing = 6;

this.titleBox = new Label(this);
this.titleBox.text = "Statistical Stretch " + VERSION;
this.titleBox.textAlignment = TextAlign_Center;
this.titleBox.frameStyle = FrameStyle_Box;
this.titleBox.styleSheet = "font-weight: bold; font-size: 14pt; background-color: #f0f0f0;";
this.titleBox.setFixedHeight(30);

this.titleRow.add(this.titleBox, 100);
this.leftSizer.add(this.titleRow);

// --- Instructions row: [Instructions] [?]
this.instructionsRow = new HorizontalSizer;
this.instructionsRow.spacing = 6;

this.instructionsLabel = new Label(this);
this.instructionsLabel.text = "Instructions";
this.instructionsLabel.textAlignment = TextAlign_Left | TextAlign_VertCenter;
// optional: make it look like a subtle header
this.instructionsLabel.styleSheet = "font-size: 10pt; font-weight: bold;";

this.helpButton = new ToolButton(this);
this.helpButton.text = "?";
this.helpButton.toolTip = "Show Instructions";
this.helpButton.setFixedSize(30, 22); // slightly shorter than title row
this.helpButton.onClick = function () { self._showInstructionsDialog(); };

this.instructionsRow.add(this.instructionsLabel);
this.instructionsRow.add(this.helpButton);
this.instructionsRow.addStretch();

this.leftSizer.add(this.instructionsRow);

   // ----------------------------
   // Image selection
   // ----------------------------
   this.imageSizer = new HorizontalSizer;
   this.imageSizer.spacing = 6;

   this.imageLabel = new Label(this);
   this.imageLabel.text = "Select Image to Stretch:";
   this.imageLabel.textAlignment = TextAlign_Left | TextAlign_VertCenter;

   this.imageList = new ComboBox(this);
   this.imageList.addItem("Select an image");
   this.imageList.maxWidth = 450;

   var activeWindow = ImageWindow.activeWindow;
   var activeWindowId = activeWindow ? activeWindow.mainView.id : null;
   var foundActive = false;

   for (var iw = 0; iw < ImageWindow.windows.length; ++iw) {
      var id = ImageWindow.windows[iw].mainView.id;
      this.imageList.addItem(id);
      if (id === activeWindowId) {
         this.imageList.currentItem = iw + 1;
         foundActive = true;
      }
   }
   if (!foundActive)
      this.imageList.currentItem = 0;

   this.imageSizer.add(this.imageLabel);
   this.imageSizer.add(this.imageList, 1);
   this.leftSizer.add(this.imageSizer);

   // ----------------------------
   // Target median
   // ----------------------------
   this.targetMedianControl = new NumericControl(this);
   this.targetMedianControl.label.text = "Target Median:";
   this.targetMedianControl.setRange(0, 1);
   this.targetMedianControl.slider.setRange(0, 100);
   this.targetMedianControl.slider.scale = 0.01;
   this.targetMedianControl.setValue(SHOParameters.targetMedian);
   this.targetMedianControl.setPrecision(2);
   this.targetMedianControl.onValueUpdated = function (value) {
      SHOParameters.targetMedian = value;
   };
   this.leftSizer.add(this.targetMedianControl);

   // ----------------------------
   // Blackpoint Sigma
   // ----------------------------
   this.bpSigmaControl = new NumericControl(this);
   this.bpSigmaControl.label.text = "Blackpoint Sigma:";
   this.bpSigmaControl.setRange(0.0, 10.0);
   this.bpSigmaControl.slider.setRange(0, 1000);
   this.bpSigmaControl.slider.scale = 0.01;
   this.bpSigmaControl.setValue(SHOParameters.blackpointSigma);
   this.bpSigmaControl.setPrecision(2);
   this.bpSigmaControl.toolTip = "How many robust sigmas below median to set blackpoint.";
   this.bpSigmaControl.onValueUpdated = function (v) {
      SHOParameters.blackpointSigma = v;
      self.clippedPixelsLabel.text = "Clipped pixels: (not calculated)";
   };
   this.leftSizer.add(this.bpSigmaControl);

   // ----------------------------
   // Clipped pixels label + button
   // ----------------------------
   this.clippedPixelsLabel = new Label(this);
   this.clippedPixelsLabel.text = "Clipped pixels: (not calculated)";
   this.clippedPixelsLabel.textAlignment = TextAlign_Left;
   this.clippedPixelsLabel.styleSheet = "font-size: 9pt; padding: 6px; background-color: #f7f7ff;";
   this.leftSizer.add(this.clippedPixelsLabel);

   this.calcClippedButton = new PushButton(this);
   this.calcClippedButton.text = "Calculate Clipped Pixels";
   this.calcClippedButton.toolTip =
      "Estimates how many pixels fall below the Blackpoint Sigma threshold (Step 1).\n" +
      "Large images are sampled for speed; result is an estimate.";
   this.calcClippedButton.onClick = function () {
      if (self.imageList.currentItem <= 0) {
         new MessageBox("No image selected.", TITLE, StdIcon_Error, StdButton_Ok).execute();
         return;
      }

      var w = ImageWindow.windowById(self.imageList.itemText(self.imageList.currentItem));
      if (!w || w.isNull) {
         new MessageBox("Selected view is not available.", TITLE, StdIcon_Error, StdButton_Ok).execute();
         return;
      }

      SHOParameters.noBlackClip = self.noBlackClipCheckbox.checked;
      SHOParameters.linkedStretch = self.linkedStretchCheckbox.checked;
      SHOParameters.lumaOnly = self.lumaOnlyCheckbox.checked;
      SHOParameters.lumaMode = self.lumaModeCombo.itemText(self.lumaModeCombo.currentItem);
      SHOParameters.lumaBlend = self.lumaBlendControl.value;

      var img = new Image(w.mainView.image); // clone
      var r = _estimateClippedPixels_Blackpoint(img, 1000000);
      var pct = (r.total > 0) ? (100.0 * r.clippedEst / r.total) : 0.0;
      var estTag = (r.stride === 1) ? "Exact" : "Estimated";

      var bpText = "";
      if (r.bpInfo.mode === "unlinked") {
         bpText = "BP(R,G,B)=(" +
            r.bpInfo.bp[0].toFixed(6) + ", " +
            r.bpInfo.bp[1].toFixed(6) + ", " +
            r.bpInfo.bp[2].toFixed(6) + ")";
      } else {
         bpText = "BP=" + r.bpInfo.bp.toFixed(6);
      }

      self.clippedPixelsLabel.text =
         "Clipped pixels: " + _fmtInt(r.clippedEst) + " / " + _fmtInt(r.total) +
         "  (" + pct.toFixed(4) + "%) " + estTag + "  •  " + bpText;
   };
   this.leftSizer.add(this.calcClippedButton);

   // ----------------------------
   // No Black Clip
   // ----------------------------
   this.noBlackClipCheckbox = new CheckBox(this);
   this.noBlackClipCheckbox.text = "No Black Clip";
   this.noBlackClipCheckbox.checked = SHOParameters.noBlackClip;
   this.noBlackClipCheckbox.toolTip = "If enabled, preserves true blacks by keeping BP at min().";
   this.noBlackClipCheckbox.onCheck = function (checked) {
      SHOParameters.noBlackClip = checked;
      self.clippedPixelsLabel.text = "Clipped pixels: (not calculated)";
   };
   this.leftSizer.add(this.noBlackClipCheckbox);

   // ----------------------------
   // HDR controls
   // ----------------------------
   this.hdrCompressCheckbox = new CheckBox(this);
   this.hdrCompressCheckbox.text = "HDR Compress (SASpro style)";
   this.hdrCompressCheckbox.checked = SHOParameters.hdrCompress;
   this.leftSizer.add(this.hdrCompressCheckbox);

   this.hdrAmountControl = new NumericControl(this);
   this.hdrAmountControl.label.text = "HDR Amount:";
   this.hdrAmountControl.setRange(0.0, 1.0);
   this.hdrAmountControl.slider.setRange(0, 1000);
   this.hdrAmountControl.slider.scale = 0.001;
   this.hdrAmountControl.setValue(SHOParameters.hdrAmount);
   this.hdrAmountControl.setPrecision(2);
   this.hdrAmountControl.onValueUpdated = function (v) { SHOParameters.hdrAmount = v; };
   this.leftSizer.add(this.hdrAmountControl);

   this.hdrKneeControl = new NumericControl(this);
   this.hdrKneeControl.label.text = "HDR Knee:";
   this.hdrKneeControl.setRange(0.10, 1.00);
   this.hdrKneeControl.slider.setRange(10, 1000);
   this.hdrKneeControl.slider.scale = 0.001;
   this.hdrKneeControl.setValue(SHOParameters.hdrKnee);
   this.hdrKneeControl.setPrecision(2);
   this.hdrKneeControl.onValueUpdated = function (v) { SHOParameters.hdrKnee = v; };
   this.leftSizer.add(this.hdrKneeControl);

   // ----------------------------
   // Luma-only controls
   // ----------------------------
   this.lumaOnlyCheckbox = new CheckBox(this);
   this.lumaOnlyCheckbox.text = "Luma Only (preserve color)";
   this.lumaOnlyCheckbox.checked = SHOParameters.lumaOnly;
   this.lumaOnlyCheckbox.toolTip = "Stretches luminance only and rescales RGB to preserve chroma.";
   this.leftSizer.add(this.lumaOnlyCheckbox);

   this.lumaModeSizer = new HorizontalSizer;
   this.lumaModeSizer.spacing = 6;

   this.lumaModeLabel = new Label(this);
   this.lumaModeLabel.text = "Luma Mode:";
   this.lumaModeLabel.textAlignment = TextAlign_Left | TextAlign_VertCenter;

   this.lumaModeCombo = new ComboBox(this);
   this.lumaModeCombo.addItem("rec709");
   this.lumaModeCombo.addItem("rec601");
   this.lumaModeCombo.addItem("rec2020");
   this.lumaModeCombo.currentItem = Math.max(0, ["rec709","rec601","rec2020"].indexOf(SHOParameters.lumaMode || "rec709"));
   this.lumaModeCombo.onItemSelected = function (idx) {
      SHOParameters.lumaMode = self.lumaModeCombo.itemText(idx);
   };

   this.lumaModeSizer.add(this.lumaModeLabel);
   this.lumaModeSizer.add(this.lumaModeCombo, 1);
   this.leftSizer.add(this.lumaModeSizer);

   // ----------------------------
   // Luma Blend (only meaningful for luma-only)
   // ----------------------------
   this.lumaBlendControl = new NumericControl(this);
   this.lumaBlendControl.label.text = "Luma Blend:";
   this.lumaBlendControl.setRange(0.0, 1.0);
   this.lumaBlendControl.slider.setRange(0, 1000);
   this.lumaBlendControl.slider.scale = 0.001;
   this.lumaBlendControl.setValue(SHOParameters.lumaBlend);
   this.lumaBlendControl.setPrecision(2);
   this.lumaBlendControl.toolTip = "0 = normal linked stretch, 1 = pure luma-only stretch.";
   this.lumaBlendControl.onValueUpdated = function (v) {
      SHOParameters.lumaBlend = v;
   };
   this.leftSizer.add(this.lumaBlendControl);

   // ----------------------------
   // Normalize + Linked row
   // ----------------------------
   this.checkboxSizer = new HorizontalSizer;
   this.checkboxSizer.spacing = 6;

   this.normalizeImageRangeCheckbox = new CheckBox(this);
   this.normalizeImageRangeCheckbox.text = "Normalize Image Range to [0,1]";
   this.normalizeImageRangeCheckbox.checked = SHOParameters.normalizeImageRange;
   this.normalizeImageRangeCheckbox.onCheck = function (checked) {
      SHOParameters.normalizeImageRange = checked;
   };
   this.checkboxSizer.add(this.normalizeImageRangeCheckbox);

   this.checkboxSizer.addStretch();

   this.linkedStretchCheckbox = new CheckBox(this);
   this.linkedStretchCheckbox.text = "Linked Stretch";
   this.linkedStretchCheckbox.checked = SHOParameters.linkedStretch;
   this.linkedStretchCheckbox.toolTip = "Uncheck to perform Unlinked Stretch.";
   this.linkedStretchCheckbox.onCheck = function (checked) {
      SHOParameters.linkedStretch = checked;
   };
   this.checkboxSizer.add(this.linkedStretchCheckbox);

   this.leftSizer.add(this.checkboxSizer);

   // ----------------------------
   // Curves boost
   // ----------------------------
   this.curvesBoostSlider = new NumericControl(this);
   this.curvesBoostSlider.label.text = "Curves Boost:";
   this.curvesBoostSlider.setRange(0.00, 0.50);
   this.curvesBoostSlider.slider.setRange(0, 500);
   this.curvesBoostSlider.slider.scale = 0.001;
   this.curvesBoostSlider.setValue(SHOParameters.curvesBoost);
   this.curvesBoostSlider.setPrecision(2);
   this.curvesBoostSlider.onValueUpdated = function (value) {
      SHOParameters.curvesBoost = value;
   };
   this.leftSizer.add(this.curvesBoostSlider);

   // ----------------------------
   // Helpers to enable/disable HDR + enforce luma-only rules
   // ----------------------------
   this._updateHdrUiEnabled = function () {
      var en = !!SHOParameters.hdrCompress;
      self.hdrAmountControl.enabled = en;
      self.hdrKneeControl.enabled = en;
   };

   this._enforceLumaOnlyRules = function () {
      if (SHOParameters.lumaOnly) {
         self.linkedStretchCheckbox.checked = true;
         SHOParameters.linkedStretch = true;
         self.linkedStretchCheckbox.enabled = false;
      } else {
         self.linkedStretchCheckbox.enabled = true;
      }
   };

   this.hdrCompressCheckbox.onCheck = function (checked) {
      SHOParameters.hdrCompress = checked;
      self._updateHdrUiEnabled();
   };

   this.lumaOnlyCheckbox.onCheck = function (checked) {
      SHOParameters.lumaOnly = checked;
      self.lumaModeCombo.enabled = checked;
      self.lumaBlendControl.enabled = checked;   // ✅ add this
      self._enforceLumaOnlyRules();
      self._updateLumaUiEnabled();
   };

   this._updateHdrUiEnabled();
   this._enforceLumaOnlyRules();

   // ----------------------------
   // Pixel readout label
   // ----------------------------
   this.pixelValueLabel = new Label(this);
   this.pixelValueLabel.text = "Pixel Value: ";
   this.pixelValueLabel.styleSheet = "font-size: 10pt; padding: 5px; background-color: #e6e6fa;";
   this.pixelValueLabel.textAlignment = TextAlign_Left;
   this.leftSizer.add(this.pixelValueLabel);

   // ----------------------------
   // Footer
   // ----------------------------
   this.authorshipLabel = new Label(this);
   this.authorshipLabel.text = "Written by Franklin Marek";
   this.authorshipLabel.textAlignment = TextAlign_Center;
   this.leftSizer.add(this.authorshipLabel);

   this.websiteLabel = new Label(this);
   this.websiteLabel.text = "www.setiastro.com";
   this.websiteLabel.textAlignment = TextAlign_Center;
   this.leftSizer.add(this.websiteLabel);

   // ----------------------------
   // Buttons row (single row, no duplicates)
   // ----------------------------
   this.buttonSizer = new HorizontalSizer;
   this.buttonSizer.spacing = 6;

   // New Instance button
   this.newInstanceButton = new ToolButton(this);
   this.newInstanceButton.icon = this.scaledResource(":/process-interface/new-instance.png");
   this.newInstanceButton.setScaledFixedSize(24, 24);
   this.newInstanceButton.toolTip = "New Instance";
   this.newInstanceButton.onMousePress = function () {
      SHOParameters.save();
      self.newInstance();
   };
   this.buttonSizer.add(this.newInstanceButton);

   this.buttonSizer.addStretch();

   // Zoom dropdown (preview resample)
   this.zoomSizer = new HorizontalSizer;
   this.zoomSizer.spacing = 4;

   this.zoomLabel = new Label(this);
   this.zoomLabel.text = "Preview Zoom Level: ";
   this.zoomLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   this.zoomSizer.add(this.zoomLabel);

   this.zoomLevelComboBox = new ComboBox(this);
   this.zoomLevelComboBox.addItem("1:1");
   this.zoomLevelComboBox.addItem("1:2");
   this.zoomLevelComboBox.addItem("1:4");
   this.zoomLevelComboBox.addItem("1:8");
   this.zoomLevelComboBox.addItem("Fit to Preview");
   this.zoomLevelComboBox.currentItem = 4;

   this.zoomLevelComboBox.onItemSelected = function (index) {
      if (self.imageList.currentItem > 0) {
         var w = ImageWindow.windowById(self.imageList.itemText(self.imageList.currentItem));
         if (w && !w.isNull) {
            var selectedImage = w.mainView.image;
            if (selectedImage)
               self.processPreview(selectedImage);
         }
      }
   };

   this.zoomSizer.add(this.zoomLevelComboBox, 1);
   this.buttonSizer.add(this.zoomSizer);

   this.buttonSizer.addStretch();

   // Execute button
   this.executeButton = new PushButton(this);
   this.executeButton.text = "Execute";
   this.executeButton.onClick = function () {
      self.executeAlgorithm(SHOParameters.numIterations);
   };
   this.buttonSizer.add(this.executeButton);

   this.leftSizer.add(this.buttonSizer);

   // Preview refresh button
   this.previewButton = new PushButton(this);
   this.previewButton.text = "Preview Refresh";
   this.previewButton.onClick = function () {
      if (self.imageList.currentItem > 0) {
         var w = ImageWindow.windowById(self.imageList.itemText(self.imageList.currentItem));
         if (w && !w.isNull) {
            var selectedImage = w.mainView.image;
            if (selectedImage)
               self.processPreview(selectedImage);
         }
      } else {
         console.writeln("No image selected for preview!");
      }
   };
   this.leftSizer.add(this.previewButton);

   // Add left side to main sizer
   this.mainSizer.add(this.leftSizer);

   // ----------------------------
   // Right side: zoom buttons + preview
   // ----------------------------
   this.previewSizer = new VerticalSizer(this);
   this.previewSizer.spacing = 6;
   this.previewSizer.margin = 0;

   this.zoomButtonSizer = new HorizontalSizer(this);
   this.zoomButtonSizer.spacing = 6;
   this.zoomButtonSizer.margin = 0;

   this.zoomInButton = new PushButton(this);
   this.zoomInButton.text = "Zoom In";
   this.zoomInButton.onClick = function () {
      self.previewControl.zoomFactor = Math.min(self.previewControl.zoomFactor * 1.25, self.previewControl.maxZoomFactor);
      self.previewControl.initScrollBars();
      self.previewControl.viewport.update();
   };
   this.zoomButtonSizer.add(this.zoomInButton);

   this.zoomOutButton = new PushButton(this);
   this.zoomOutButton.text = "Zoom Out";
   this.zoomOutButton.onClick = function () {
      self.previewControl.zoomFactor = Math.max(self.previewControl.zoomFactor * 0.8, self.previewControl.minZoomFactor);
      self.previewControl.initScrollBars();
      self.previewControl.viewport.update();
   };
   this.zoomButtonSizer.add(this.zoomOutButton);

   this.previewSizer.add(this.zoomButtonSizer);
   this.previewSizer.add(this.previewControl, 1, Align_Expand);

   this.mainSizer.add(this.previewSizer, 1);

   // Final dialog settings
   this.sizer = this.mainSizer;
   this.windowTitle = TITLE;
   this.adjustToContents();

   // ----------------------------
   // When image selected
   // ----------------------------
   this.imageList.onItemSelected = function (index) {
      if (index <= 0)
         return;

      var w = ImageWindow.windowById(self.imageList.itemText(index));
      if (!w || w.isNull)
         return;

      var selectedImage = w.mainView.image;
      if (!selectedImage)
         return;

      SHOParameters.targetViewId = w.mainView.id;
      SHOParameters.targetView = w.mainView;
      SHOParameters.save();

      // enable/disable luma-only UI depending on color
      self._updateLumaUiEnabled();
      self._enforceLumaOnlyRules();

      // show initial image + run preview process
      var tmpImage = self.createTemporaryImage(selectedImage);
      self.previewControl.displayImage = tmpImage;
      self.previewControl.initScrollBars();
      self.previewControl.viewport.update();

      self.processPreview(selectedImage);
   };

   this._updateLumaUiEnabled = function () {
      // Determine current image color state
      var isColor = false;

      if (self.imageList.currentItem > 0) {
         var w = ImageWindow.windowById(self.imageList.itemText(self.imageList.currentItem));
         if (w && !w.isNull && w.mainView && w.mainView.image)
            isColor = !!w.mainView.image.isColor;
      }

      // Checkbox itself only makes sense for color images
      self.lumaOnlyCheckbox.enabled = isColor;

      // If not color, force off
      if (!isColor) {
         self.lumaOnlyCheckbox.checked = false;
         SHOParameters.lumaOnly = false;
      }

      // Dependent controls ONLY when color + lumaOnly checked
      var en = isColor && !!SHOParameters.lumaOnly;
      self.lumaModeCombo.enabled = en;
      self.lumaBlendControl.enabled = en;  // NumericControl has .enabled
   };


   // ----------------------------
   // On show: show preview only, no forced processing
   // ----------------------------
   this.onShow = function () {
      if (self.imageList.currentItem > 0) {
         var w = ImageWindow.windowById(self.imageList.itemText(self.imageList.currentItem));
         if (w && !w.isNull) {
            var selectedImage = w.mainView.image;
            if (selectedImage) {
               var tmpImage = self.createTemporaryImage(selectedImage);
               self.previewControl.displayImage = tmpImage;
               self.previewControl.initScrollBars();
               self.previewControl.viewport.update();

               self._updateLumaUiEnabled();
               self._enforceLumaOnlyRules();
            }
         }
      }
   };
}

// ============================================================================
// Execute algorithm (from dialog context, using current UI values)
// ============================================================================

executeAlgorithm(numIterations) {
   if (this.imageList.currentItem <= 0) {
      new MessageBox("No image selected for processing.", TITLE, StdIcon_Error, StdButton_Ok).execute();
      return;
   }

   var window = ImageWindow.windowById(this.imageList.itemText(this.imageList.currentItem));
   if (!window || window.isNull) {
      new MessageBox("Selected view is not available.", TITLE, StdIcon_Error, StdButton_Ok).execute();
      return;
   }

   let targetView = window.mainView;

   // Sync params from UI (important!)
   SHOParameters.linkedStretch = this.linkedStretchCheckbox.checked;
   SHOParameters.normalizeImageRange = this.normalizeImageRangeCheckbox.checked;
   SHOParameters.lumaOnly = this.lumaOnlyCheckbox.checked;
   SHOParameters.lumaMode = this.lumaModeCombo.itemText(this.lumaModeCombo.currentItem);
   SHOParameters.lumaBlend = this.lumaBlendControl.value;
   SHOParameters.save();

   let iterations = SHOParameters.autoConvergence ? 5 : (numIterations !== undefined ? numIterations : SHOParameters.numIterations);
   iterations = Math.min(iterations, 5);
   let converged = false;

   for (let i = 0; i < iterations; i++) {
      if (targetView.image.isColor) {
         if (SHOParameters.linkedStretch)
            processColorImage(targetView, SHOParameters.targetMedian, i + 1);
         else
            processUnlinkedColorImage(targetView, SHOParameters.targetMedian, i + 1);
      } else {
         processMonoImage(targetView, SHOParameters.targetMedian, i + 1);
      }

      let currentMedian = calculate_image_median(targetView.image);
      let difference = Math.abs(currentMedian - SHOParameters.targetMedian);

      if (difference < 0.001) {
         converged = true;
         break;
      }
   }

   if (!converged)
      console.noteln("Convergence not achieved within " + iterations + " iterations.");

   if (SHOParameters.curvesBoost > 0)
      applyFinalCurve(targetView, SHOParameters.targetMedian);
   else
      console.writeln("Curves boost is set to zero, skipping final curve application.");

   disableSTF(targetView);
}
}

// ============================================================================
// Main entry
// ============================================================================

function main() {
   CoreApplication.ensureMinimumVersion(1, 9, 4);
   Console.show();
   Console.criticalln("   ____    __  _   ___       __         \n  / __/__ / /_(_) / _ | ___ / /_______ ");
   Console.warningln(" _\\ \\/ -_) __/ / / __ |(_-</ __/ __/ _ \\ \n/___/\\__/\\__/_/ /_/ |_/__/\\__/_/  \\___/ \n                                         ");

   SHOParameters.load();

   if (Parameters.isGlobalTarget) {
      Console.criticalln("This script cannot run in a global context.");
      return;
   }

// If run as a view-targeted instance...
if (Parameters.isViewTarget && Parameters.targetView) {

   // Always remember the target view
   SHOParameters.targetView   = Parameters.targetView;
   SHOParameters.targetViewId = Parameters.targetView.id;
   SHOParameters.save();

   // ✅ If user wants dialog, show it (preselect the view) instead of autorun
   if (SHOParameters.openDialogbox) {
      let dlg = new MyDialog();

      // Preselect the target view in the combo box
      // item 0 = "Select an image", so start at 1
      for (var i = 1; i < dlg.imageList.numberOfItems; ++i) {
         if (dlg.imageList.itemText(i) === SHOParameters.targetViewId) {
            dlg.imageList.currentItem = i;
            break;
         }
      }

      dlg.execute();  // user can hit Execute or close
      return;
   }

   // ✅ Otherwise, autorun on the view target (your current behavior)
   let iterations = SHOParameters.autoConvergence ? 5 : SHOParameters.numIterations;
   iterations = Math.min(iterations, 5);

   for (let i = 0; i < iterations; i++) {
      if (SHOParameters.targetView.image.isColor) {
         if (SHOParameters.linkedStretch)
            processColorImage(SHOParameters.targetView, SHOParameters.targetMedian, i + 1);
         else
            processUnlinkedColorImage(SHOParameters.targetView, SHOParameters.targetMedian, i + 1);
      } else {
         processMonoImage(SHOParameters.targetView, SHOParameters.targetMedian, i + 1);
      }

      let currentMedian = calculate_image_median(SHOParameters.targetView.image);
      if (Math.abs(currentMedian - SHOParameters.targetMedian) < 0.001)
         break;
   }

   if (SHOParameters.curvesBoost > 0)
      applyFinalCurve(SHOParameters.targetView, SHOParameters.targetMedian);

   disableSTF(SHOParameters.targetView);
   return;
}


   // Normal: open dialog
   let dlg = new MyDialog();
   if (dlg.execute()) {
      dlg.executeAlgorithm(SHOParameters.numIterations);
   } else {
      console.noteln("Statistical Stretch Dialog Closed.");
   }
}

main();
