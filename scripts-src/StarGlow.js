// ============================================================================
// StarGlow.js — progressive Gaussian "shine" for stars (PixInsight PJSR)
//
// Replicates the Photoshop technique:
//   1. Isolate the brightest stars
//   2. Make N copies, each blurred with double the previous sigma
//   3. Screen all of them together onto the original stars
//
// Run on a NONLINEAR (stretched) stars-only image.
// Install: Script > Feature Scripts... > Add (point at this file's folder),
//          then find it under Script > Utilities > StarGlow.
// Or just: Script > Run Script File... and pick this file.
// ============================================================================

#feature-id    Pixinsight-Fixes > StarGlow
#feature-info  Progressive Gaussian glow for bright stars, screen-combined.

#include <pjsr/Sizer.jsh>
#include <pjsr/NumericControl.jsh>
#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/UndoFlag.jsh>

var P = {
   levels:     8,     // number of blurred layers
   sigma0:     4.0,   // sigma (px) of the first layer
   factor:     2.0,   // sigma multiplier per layer (2 = doubling)
   threshold:  0.65,  // luminance at which a pixel counts as "bright star"
   softness:   0.10,  // ramp width below threshold (avoids hard edges)
   strength:   0.35,  // opacity of the first layer when screening
   decay:      0.75,  // per-layer opacity multiplier (e.g. 0.8 tames outer halos)
   maxStep:    50,    // largest single Convolution sigma; bigger blurs are chained
   keepLayers: false  // leave each blurred layer open for inspection
};

// ---------------------------------------------------------------------------
function uniqueId( base )
{
   var id = base, n = 1;
   // Handle both PI behaviors: viewById() may return null, or a null-view
   // object whose .isNull is true, when no matching view exists.
   for ( var v = View.viewById( id ); v != null && !v.isNull; v = View.viewById( id ) )
      id = base + "_" + (n++);
   return id;
}

function cloneView( view, id )
{
   var img = view.image;
   var w = new ImageWindow( img.width, img.height, img.numberOfChannels,
                            32, true, img.isColor, id );
   w.mainView.beginProcess( UndoFlag_NoSwapFile );
   w.mainView.image.assign( img );
   w.mainView.endProcess();
   return w;
}

function runPixelMath( view, expr, symbols )
{
   var PM = new PixelMath;
   PM.expression = expr;
   PM.useSingleExpression = true;
   PM.symbols = symbols || "";
   PM.createNewImage = false;
   PM.rescale = false;
   PM.truncate = true;
   PM.executeOn( view, false );
}

// Gaussian blur via Convolution. Large sigmas are split into n passes of
// sigma/sqrt(n), since successive Gaussians add in quadrature.
function gaussianBlur( view, sigma )
{
   if ( sigma <= 0 )
      return;
   var n = Math.max( 1, Math.ceil( sigma / P.maxStep ) );
   var s = sigma / Math.sqrt( n );
   for ( var i = 0; i < n; ++i )
   {
      var C = new Convolution;
      C.mode = Convolution.prototype.Parametric;
      C.sigma = s;
      C.shape = 2;          // 2 = true Gaussian
      C.aspectRatio = 1;
      C.rotationAngle = 0;
      C.executeOn( view, false );
   }
}

// ---------------------------------------------------------------------------
function starGlow( target )
{
   var isColor = target.image.numberOfChannels >= 3;
   var lum = isColor ? "0.2126*$T[0] + 0.7152*$T[1] + 0.0722*$T[2]" : "$T";
   var soft = Math.max( 1e-4, P.softness );
   var lo = P.threshold - soft;

   // 1. Bright-star base: keep pixels by a soft luminance ramp, preserving colour
   var baseWin = cloneView( target, uniqueId( "SG_base" ) );
   runPixelMath( baseWin.mainView,
      "L = " + lum + "; $T * min( 1, max( 0, (L - " + lo.toFixed( 6 ) + ")/" + soft.toFixed( 6 ) + " ) )",
      "L" );

   // 2. Result starts as the untouched original stars
   var resultWin = cloneView( target, uniqueId( target.id + "_glow" ) );
   var baseId = baseWin.mainView.id;

   // 3. The "glow" is the screen we iteratively blur. It starts as the bright-
   //    star seed and, after each blur, the sharp star cores are screened back
   //    in. The next blur therefore spreads the already-grown glow (stars +
   //    accumulated halo) rather than just the isolated star light, so the
   //    halo compounds outward — larger, smoother, longer reach (the Photoshop
   //    "blur the screen, then blur that screen" behaviour).
   var glowWin = cloneView( baseWin.mainView, uniqueId( "SG_glow" ) );
   var glowId = glowWin.mainView.id;

   var prev = 0, k = P.strength;
   for ( var i = 0; i < P.levels; ++i )
   {
      var s = P.sigma0 * Math.pow( P.factor, i );
      var inc = Math.sqrt( Math.max( 0, s*s - prev*prev ) );
      console.writeln( format( "<end><cbr>StarGlow: layer %d/%d, sigma %.1f px, opacity %.3f",
                               i+1, P.levels, s, k ) );
      processEvents();

      // Blur the accumulated glow further, then screen it onto the result.
      gaussianBlur( glowWin.mainView, inc );
      prev = s;

      // Screen: 1 - (1-a)(1-k*b)
      runPixelMath( resultWin.mainView,
                    "~( ~$T * ~(" + k.toFixed( 6 ) + "*" + glowId + ") )" );

      // Feed the sharp star cores back into the glow so the next blur
      // compounds on top of this layer's halo.
      runPixelMath( glowWin.mainView, "~( ~$T * ~" + baseId + " )" );

      if ( P.keepLayers )
      {
         var lw = cloneView( glowWin.mainView, uniqueId( "SG_layer_" + (i+1) ) );
         lw.show();
      }
      k *= P.decay;
   }

   glowWin.forceClose();
   baseWin.forceClose();
   resultWin.show();
   resultWin.zoomToOptimalFit();
   console.writeln( "<end><cbr>StarGlow: done -> " + resultWin.mainView.id );
}

// ---------------------------------------------------------------------------
function StarGlowDialog()
{
   this.__base__ = Dialog;
   this.__base__();
   var self = this;
   var labelW = this.font.width( "Opacity decay / layer:" ) + 8;

   function numeric( label, min, max, prec, value, tip, setter )
   {
      var c = new NumericControl( self );
      c.label.text = label;
      c.label.minWidth = labelW;
      c.setRange( min, max );
      c.setPrecision( prec );
      c.slider.setRange( 0, 1000 );
      c.slider.minWidth = 220;
      c.setValue( value );
      c.toolTip = tip;
      c.onValueUpdated = setter;
      return c;
   }

   this.helpLabel = new Label( this );
   this.helpLabel.wordWrapping = true;
   this.helpLabel.useRichText = true;
   this.helpLabel.text = "<b>StarGlow</b> — progressive Gaussian glow, screen-combined. " +
                         "Use on a stretched, stars-only image.";

   this.levelsSpin = new SpinBox( this );
   this.levelsSpin.setRange( 1, 16 );
   this.levelsSpin.value = P.levels;
   this.levelsSpin.onValueUpdated = function( v ) { P.levels = v; };
   this.levelsLabel = new Label( this );
   this.levelsLabel.text = "Layers:";
   this.levelsLabel.minWidth = labelW;
   this.levelsLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   this.levelsSizer = new HorizontalSizer;
   this.levelsSizer.spacing = 4;
   this.levelsSizer.add( this.levelsLabel );
   this.levelsSizer.add( this.levelsSpin );
   this.levelsSizer.addStretch();

   this.sigmaCtl  = numeric( "First sigma (px):", 0.3, 10, 2, P.sigma0,
                             "Blur radius of the first (tightest) layer.",
                             function( v ) { P.sigma0 = v; } );
   this.factorCtl = numeric( "Sigma multiplier:", 1.1, 3, 2, P.factor,
                             "2.0 = each layer doubles the blur, as in the Photoshop method.",
                             function( v ) { P.factor = v; } );
   this.threshCtl = numeric( "Bright threshold:", 0, 1, 3, P.threshold,
                             "Luminance above which a star contributes fully to the glow.",
                             function( v ) { P.threshold = v; } );
   this.softCtl   = numeric( "Threshold softness:", 0.001, 0.5, 3, P.softness,
                             "Width of the ramp below the threshold.",
                             function( v ) { P.softness = v; } );
   this.strCtl    = numeric( "Layer opacity:", 0, 1, 3, P.strength,
                             "Opacity of the first layer when screened.",
                             function( v ) { P.strength = v; } );
   this.decayCtl  = numeric( "Opacity decay / layer:", 0.3, 1, 3, P.decay,
                             "Multiply opacity by this each layer. 1.0 = all layers equal.",
                             function( v ) { P.decay = v; } );

   this.keepCheck = new CheckBox( this );
   this.keepCheck.text = "Keep individual layers open";
   this.keepCheck.checked = P.keepLayers;
   this.keepCheck.onCheck = function( c ) { P.keepLayers = c; };

   this.okButton = new PushButton( this );
   this.okButton.text = "OK";
   this.okButton.icon = this.scaledResource( ":/icons/ok.png" );
   this.okButton.onClick = function() { self.ok(); };
   this.cancelButton = new PushButton( this );
   this.cancelButton.text = "Cancel";
   this.cancelButton.icon = this.scaledResource( ":/icons/cancel.png" );
   this.cancelButton.onClick = function() { self.cancel(); };
   this.buttons = new HorizontalSizer;
   this.buttons.spacing = 6;
   this.buttons.addStretch();
   this.buttons.add( this.okButton );
   this.buttons.add( this.cancelButton );

   this.sizer = new VerticalSizer;
   this.sizer.margin = 8;
   this.sizer.spacing = 6;
   this.sizer.add( this.helpLabel );
   this.sizer.add( this.levelsSizer );
   this.sizer.add( this.sigmaCtl );
   this.sizer.add( this.factorCtl );
   this.sizer.add( this.threshCtl );
   this.sizer.add( this.softCtl );
   this.sizer.add( this.strCtl );
   this.sizer.add( this.decayCtl );
   this.sizer.add( this.keepCheck );
   this.sizer.addSpacing( 6 );
   this.sizer.add( this.buttons );

   this.windowTitle = "StarGlow";
   this.adjustToContents();
}
StarGlowDialog.prototype = new Dialog;

// ---------------------------------------------------------------------------
function main()
{
   var w = ImageWindow.activeWindow;
   if ( w.isNull )
   {
      new MessageBox( "Open and select a stars-only image first.", "StarGlow",
                      StdIcon_Error, StdButton_Ok ).execute();
      return;
   }
   var dlg = new StarGlowDialog;
   if ( !dlg.execute() )
      return;

   console.show();
   console.abortEnabled = true;
   var t0 = Date.now();
   try
   {
      starGlow( w.mainView );
   }
   catch ( e )
   {
      console.criticalln( "StarGlow failed: " + e );
   }
   console.writeln( format( "StarGlow: %.1f s", (Date.now() - t0)/1000 ) );
}

main();
