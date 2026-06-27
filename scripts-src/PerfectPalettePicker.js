#engine v8
#feature-id PerfectPalettePicker : Pixinsight-Fixes > Perfect Palette Picker
#feature-icon  palettepicker.svg
#feature-info Script to combine images into various palettes.



/******************************************************************************
 *######################################################################
 *#        ___     __      ___       __                                #
 *#       / __/___/ /__   / _ | ___ / /________                        #
 *#      _\ \/ -_) _ _   / __ |(_-</ __/ __/ _ \                       #
 *#     /___/\__/_//_/  /_/ |_/___/\__/_/  \___/                       #
 *#                                                                    #
 *######################################################################
 * Perfect Palette Picker
 * Version: 1.2
 * Author: Franklin Marek
 * Website: www.setiastro.com
 *
 * This script facilitates the creation of 12 popular narrowband (NB) palettes
 * such as SHO, HOO, HSO, etc., derived from Ha/OIII/SII or extracted OSC channels.
 * Key functionalities include:
 * - Gathering Ha, OIII, SII, or OSC images from the user
 * - Downsampling and stretching each channel to a target median of ~0.25
 * - Generating 12 palette previews for user selection
 * - Allowing users to click on a palette preview to create a final combined image
 *
 * This work is licensed under a Creative Commons Attribution-NonCommercial 4.0 International License.
 * To view a copy of this license, visit http://creativecommons.org/licenses/by-nc/4.0/
 *
 * You are free to:
 * 1. Share — copy and redistribute the material in any medium or format
 * 2. Adapt — remix, transform, and build upon the material
 *
 * Under the following terms:
 * 1. Attribution — You must give appropriate credit, provide a link to the license,
 *    and indicate if changes were made. You may do so in any reasonable manner,
 *    but not in any way that suggests the licensor endorses you or your use.
 * 2. NonCommercial — You may not use the material for commercial purposes.
 *
 * @license CC BY-NC 4.0 (http://creativecommons.org/licenses/by-nc/4.0/)
 *
 * COPYRIGHT © 2025 Franklin Marek. ALL RIGHTS RESERVED.
 ******************************************************************************/

// #include <pjsr/Sizer.jsh>        // native in V8
#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>
// #include <pjsr/NumericControl.jsh> // native in V8
#include <pjsr/UndoFlag.jsh>
#include <pjsr/FrameStyle.jsh>
#include <pjsr/TextAlign.jsh>

#define VERSION "1.2"

/* ---------------------------------------------------------------------------
 *                PixelMath-based: Stretch channel to target median=0.25
 * --------------------------------------------------------------------------- */
function processMonoImage( targetView, targetMedian, iteration )
{
   // For demonstration, we’ll call iteration for logging, but you can do multi-pass.
   console.writeln( "processMonoImage(", targetView.id,
                    ") iteration #", iteration,
                    " => targetMedian=", targetMedian );

   var P = new ProcessContainer;

   // Step 1) BlackPoint offset + initial rescale
   var P001 = new PixelMath;
   P001.expression =
      "BlackPoint = iif((med($T) - 2.7*sdev($T))<min($T), min($T), med($T) - 2.7*sdev($T));\n" +
      "Rescaled   = ($T - BlackPoint) / (1 - BlackPoint);";
   P001.useSingleExpression      = true;
   P001.symbols = "BlackPoint, Rescaled, CurrentMedian, DesiredMedian, Alpha";
   P001.clearImageCacheAndExit   = false;
   P001.cacheGeneratedImages     = false;
   P001.generateOutput           = true;
   P001.singleThreaded           = false;
   P001.optimization             = true;
   P001.use64BitWorkingImage     = true;
   P001.rescale                  = false;
   P001.truncate                 = true;
   P001.truncateLower            = 0;
   P001.truncateUpper            = 1;
   P001.createNewImage           = false;
   P001.showNewImage             = true;
   P.add(P001);

   // Step 2) Attempt to bring median => targetMedian
   var P002 = new PixelMath;
   P002.expression =
      "((Med($T)-1)*" + targetMedian + "*$T)/" +
      "(Med($T)*(" + targetMedian + "+$T-1)-" + targetMedian + "*$T)";
   P002.useSingleExpression      = true;
   P002.clearImageCacheAndExit   = false;
   P002.cacheGeneratedImages     = false;
   P002.generateOutput           = true;
   P002.singleThreaded           = false;
   P002.optimization             = true;
   P002.use64BitWorkingImage     = true;
   P002.symbols = "L, S";
   P002.rescale                  = false;
   P002.truncate                 = true;
   P002.truncateLower            = 0;
   P002.truncateUpper            = 1;
   P002.createNewImage           = false;
   P002.showNewImage             = true;
   P.add(P002);

   // Execute the ProcessContainer steps
   P.executeOn( targetView );
}

/* ---------------------------------------------------------------------------
 *      Helper: Downsample a View by 4× using IntegerResample
 * --------------------------------------------------------------------------- */
function downsample4x( view )
{
   console.writeln("Downsampling: ", view.id, " by 4× ...");
   let P = new IntegerResample;
   P.zoomFactor = -4;
   P.downsamplingMode = IntegerResample.Average;
   P.xResolution = 72.000;
   P.yResolution = 72.000;
   P.metric = false;
   P.forceResolution = false;
   P.gammaCorrection = false;
   P.noGUIMessages = true;
   P.executeOn( view );
}

function extractOSCchannels( mainView )
{
   // 1) Verify we have at least 3 channels
   if (mainView.image.numberOfChannels < 3)
   {
      console.warningln("[!] The image has fewer than 3 channels—skipping extraction.");
      return [];
   }

   // 2) Configure ChannelExtraction
   let P = new ChannelExtraction;
   // We want to extract an RGB color space
   P.colorSpace = ChannelExtraction.RGB;


   // For each channel, set "enabled"=true and supply a postfix or prefix for the output ID
   // e.g. we’ll name them _pppR, _pppG, _pppB
    P.channels = [
        [ true, "" + mainView.id + "_pppR" ], // Red channel with postfix 'R'
        [ true,  "" + mainView.id + "_pppG"], // Green channel with postfix 'G'
        [ true,  "" + mainView.id + "_pppB"]  // Blue channel with postfix 'B'
    ];

   // We can inherit the same sample format as the source
   P.sampleFormat = ChannelExtraction.SameAsSource;
   // Optionally preserve astrometric solution if the image has it
   P.inheritAstrometricSolution = true;

   // Optionally set prefix/suffix if you want to rename the extracted windows, e.g.:
   // P.outputPrefix = "Extracted_";
   // or P.outputPostfix = "_Ch";
   // If left empty, the script uses the channel postfix from P.channels above.

   // 3) Execute on the source mainView
   P.executeOn( mainView );

   // 4) At this point, PixInsight has created up to 3 new ImageWindows:
   //    [ originalId + "_pppR", originalId + "_pppG", originalId + "_pppB" ]
   let baseId = mainView.id;    // e.g. "M101" => "M101_pppR", "M101_pppG", "M101_pppB"
   let Rwin = ImageWindow.windowById( baseId + "_pppR" );
   let Gwin = ImageWindow.windowById( baseId + "_pppG" );
   let Bwin = ImageWindow.windowById( baseId + "_pppB" );

   // 5) Verify we got all three
   if (!Rwin || !Gwin || !Bwin)
   {
      console.warningln("[!] ChannelExtraction: some channel windows not found for base ID:", baseId);
      return [];
   }
       // 6) Hide the extracted channel windows to prevent them from showing to the user
    Rwin.hide();
    Gwin.hide();
    Bwin.hide();

   // 7) Return their mainViews in [R, G, B] order
   return [ Rwin.mainView, Gwin.mainView, Bwin.mainView ];
}



/*
 * Helper: Combine 3 mono channel Views => single color ImageWindow
 * via PixelMath.  chViews is [ Rview, Gview, Bview ], each possibly null.
 */
function combineChannelsToColor( chViews, outputId )
{
   // chViews is [ Rview, Gview, Bview ], each possibly null.
   // We'll create a new 3-channel color ImageWindow, then use PixelMath in
   // multi-expression mode with expression=chViews[0].id, expression1=..., etc.

   // Find a non-null reference view for dimensions/bit depth
   let referenceView = chViews[0] || chViews[1] || chViews[2];
   if ( !referenceView )
   {
      console.warningln("No valid channels to combine—aborting.");
      return null;
   }

   // Create a new empty 3-channel color ImageWindow
   let width  = referenceView.image.width;
   let height = referenceView.image.height;
   let bits   = referenceView.image.bitsPerSample;
   let real   = referenceView.image.isReal;

   let targetWin = new ImageWindow( width, height, 3, bits, real, /*isColor=*/true, outputId );
   targetWin.mainView.beginProcess();
   targetWin.mainView.image.fill( 0 );  // Initialize to black
   targetWin.mainView.endProcess();

   // Build the PixelMath expressions for each channel:
   //   If chViews[c] is non-null, use its .id; otherwise "0"
   let exprR = chViews[0] ? chViews[0].id : "0";
   let exprG = chViews[1] ? chViews[1].id : "0";
   let exprB = chViews[2] ? chViews[2].id : "0";

   // Configure PixelMath in multiple-expressions mode
   let PM = new PixelMath;
   PM.useSingleExpression = false;
   PM.expression  = exprR;  // Red channel
   PM.expression1 = exprG;  // Green channel
   PM.expression2 = exprB;  // Blue channel
   PM.expression3 = "";     // No alpha

   // We already created the target image window, so do NOT create new image in PM
   PM.createNewImage         = false;
   PM.showNewImage           = false;
   PM.clearImageCacheAndExit = false;
   PM.cacheGeneratedImages   = false;
   PM.generateOutput         = true;
   PM.singleThreaded         = false;
   PM.optimization           = true;
   PM.use64BitWorkingImage   = false; // or true, if you prefer
   PM.rescale               = false;
   PM.truncate              = true;
   PM.truncateLower         = 0;
   PM.truncateUpper         = 1;

   // Apply PixelMath on the new 3-channel color view
   PM.executeOn( targetWin.mainView );

   // Return the final color View for further use
   return targetWin.mainView;
}

/**
 * combineChannelsToColorExpressions( outId, exprR, exprG, exprB ):
 *  1) Create a new 3-channel color ImageWindow of the same size as one of your preview images
 *  2) Runs PixelMath multi-expressions (exprR, exprG, exprB) on it
 *  3) Returns the new mainView
 */


/* ---------------------------------------------------------------------------
 *      Helper: Map palette name => [R, G, B] channel
 * --------------------------------------------------------------------------- */
function mapChannels(paletteName, Ha, OIII, SII) {
    // Determine usedHa and usedSII based on availability
    let usedHa = (Ha !== null && Ha !== undefined) ? Ha : SII;
    let usedSII = (SII !== null && SII !== undefined) ? SII : Ha;

    // If both Ha and SII are missing, set usedHa and usedSII to null
    if ((Ha === null || Ha === undefined) && (SII === null || SII === undefined)) {
        usedHa = null;
        usedSII = null;
    }

    switch (paletteName) {
        case "SHO":
            return [usedSII, usedHa, OIII];
        case "HOO":
            return [usedHa, OIII, OIII];
        case "HSO":
            return [usedHa, usedSII, OIII];
        case "HOS":
            return [usedHa, OIII, usedSII];
        case "OSS":
            return [OIII, usedSII, usedSII];
        case "OHH":
            return [OIII, usedHa, usedHa];
        case "OSH":
            return [OIII, usedSII, usedHa];
        case "OHS":
            return [OIII, usedHa, usedSII];
        case "HSS":
            return [usedHa, usedSII, usedSII];
        // Add more cases as needed
        default:
            // Fallback: Assign available channels, use "0" for missing ones
            return [
                usedSII ? usedSII.id : "0",
                usedHa ? usedHa.id : "0",
                OIII ? OIII.id : "0"
            ];
    }
}



class PerfectPalettePickerDialog extends Dialog {
   constructor() {
   super();



   /************************************************************
    * 1) Left panel as a pinned Control
    ************************************************************/
   this.leftPanel = new Control( this );
   // This is where we attach a vertical sizer
   this.leftPanel.sizer = new VerticalSizer;
   this.leftPanel.sizer.margin = 4;
   this.leftPanel.sizer.spacing = 4;

   // Fix the width:
   this.leftPanel.setFixedWidth( 300 );

   // Title label
   this.titleLabel = new Label( this.leftPanel );
   this.titleLabel.text = "Perfect Palette Picker v" + VERSION +"";
   this.titleLabel.textAlignment = TextAlign_Center;
   this.titleLabel.styleSheet = "font-size:14pt; font-weight:bold;";

this.instructionLabel = new Label(this.leftPanel);
this.instructionLabel.text =
    "Instructions:\n" +
    "1. Add narrowband images or OSC camera\n images.You can use both OSC dropdowns\n if you have 2 dual filters\n" +
    "2. Check the 'Linear Data' checkbox if the\n images are linear.\n" +
    "3. Click 'Create Palettes' to generate the\n palettes.\n" +
    "4. Use the Zoom buttons to zoom in and out.\n" +
    "5. Resize the UI by dragging the lower right\n corner.\n" +
    "6. Click on a palette from the preview\n selection to generate that palette. \n\nMultiple palettes can be generated.";

this.instructionLabel.textAlignment = TextAlign_Left;

this.instructionLabel.styleSheet = "font-size: 8pt; padding: 10px; background-color: #e6e6fa;"; // Sets font size, padding, and background color
this.instructionLabel.setFixedHeight(230); // Sets a fixed height; adjust as needed


   // “Linear Input Data” checkbox
   this.linearCheckbox = new CheckBox( this.leftPanel );
   this.linearCheckbox.text = "Linear Input Data";
   this.linearCheckbox.checked = true;
   this.linearCheckbox.toolTip =
      "<p>When checked, we apply the 0.25 stretch for previews/final images.</p>";

   // Ha / OIII / SII / OSC labels/combos
   this.labelHa  = new Label( this.leftPanel );
   this.labelHa.text  = "Ha:";
   this.comboHa  = new ComboBox( this.leftPanel );
   this.comboHa.addItem(" — None — ");

   this.labelOIII= new Label( this.leftPanel );
   this.labelOIII.text= "OIII:";
   this.comboOIII= new ComboBox( this.leftPanel );
   this.comboOIII.addItem(" — None — ");

   this.labelSII = new Label( this.leftPanel );
   this.labelSII.text = "SII:";
   this.comboSII = new ComboBox( this.leftPanel );
   this.comboSII.addItem(" — None — ");

   // Existing OSC dropdown
   this.labelOSC = new Label( this.leftPanel );
   this.labelOSC.text = "OSC HaO3 Dual:";
   this.comboOSC = new ComboBox( this.leftPanel );
   this.comboOSC.addItem(" — None — ");

   // ** New Second OSC Dropdown **
   this.labelOSC2 = new Label( this.leftPanel );
   this.labelOSC2.text = "OSC S2O3 Dual:";
   this.comboOSC2 = new ComboBox( this.leftPanel );
   this.comboOSC2.addItem(" — None — ");
   // End of New OSC Dropdown

   // Populate combos with open windows
   let wList = ImageWindow.windows;
   for ( let i = 0; i < wList.length; i++ ) {
      let wId = wList[i].mainView.id;
      this.comboHa.addItem(wId);
      this.comboOIII.addItem(wId);
      this.comboSII.addItem(wId);
      this.comboOSC.addItem(wId);
      this.comboOSC2.addItem(wId); // Populate the second OSC dropdown
   }

   // We'll arrange these combos in a small vertical sizer
   this.comboSizer = new VerticalSizer;
   this.comboSizer.margin = 0;
   this.comboSizer.spacing = 4;

   let rowHa = new HorizontalSizer;
   rowHa.add( this.labelHa );
   rowHa.add( this.comboHa, 1 );

   let rowO3 = new HorizontalSizer;
   rowO3.add( this.labelOIII );
   rowO3.add( this.comboOIII, 1 );

   let rowS2 = new HorizontalSizer;
   rowS2.add( this.labelSII );
   rowS2.add( this.comboSII, 1 );

   let rowOSC= new HorizontalSizer;
   rowOSC.add( this.labelOSC );
   rowOSC.add( this.comboOSC, 1 );

   // ** New Row for Second OSC Dropdown **
   let rowOSC2= new HorizontalSizer;
   rowOSC2.add( this.labelOSC2 );
   rowOSC2.add( this.comboOSC2, 1 );
   // End of New Row

   this.comboSizer.add( rowHa );
   this.comboSizer.add( rowO3 );
   this.comboSizer.add( rowS2 );
   this.comboSizer.add( rowOSC );
   this.comboSizer.add( rowOSC2 ); // Add the second OSC row
   // End of Combo Sizer Arrangement

   // Add the combos + linearCheckbox into the leftPanel
   this.leftPanel.sizer.add( this.titleLabel );
   this.leftPanel.sizer.addSpacing( 6 );
   this.leftPanel.sizer.add(this.instructionLabel);
   this.leftPanel.sizer.addStretch();
   this.leftPanel.sizer.add( this.comboSizer );
   this.leftPanel.sizer.addSpacing( 6 );
   this.leftPanel.sizer.add( this.linearCheckbox );
   this.leftPanel.sizer.addSpacing( 6 );

   /************************************************************
    * "Create Palettes" button
    ************************************************************/
   this.btnCreatePalettes = new PushButton( this.leftPanel );
   this.btnCreatePalettes.text = "Create Palettes";
   this.btnCreatePalettes.onClick = function() {
      this.dialog.preparePreviewPalettes();
   }.bind(this);
   this.leftPanel.sizer.add( this.btnCreatePalettes );
   this.leftPanel.sizer.addStretch();
   this.leftPanel.sizer.addSpacing( 6 );

       // Authorship label
    this.authorship_Lbl = new Label(this);
    this.authorship_Lbl.frameStyle = FrameStyle_Box;
    this.authorship_Lbl.margin = 6;
    this.authorship_Lbl.useRichText = true;
    this.authorship_Lbl.text = "Written by Franklin Marek<br>Website: <a href=\"http://www.setiastro.com\">www.setiastro.com</a>";
    this.authorship_Lbl.textAlignment = TextAlign_Center;
    this.authorship_Lbl.onMousePress = () => {
    Dialog.openBrowser("http://www.setiastro.com");
      };
    this.leftPanel.sizer.add(this.authorship_Lbl);

   /************************************************************
    * OK / Cancel
    ************************************************************/
   this.buttonsSizer = new HorizontalSizer;
   this.buttonsSizer.spacing = 6;


   // 1) The new instance button
   this.newInstanceButton = new ToolButton( this.leftPanel );
   this.newInstanceButton.icon = this.scaledResource(":/process-interface/new-instance.png");
   this.newInstanceButton.setScaledFixedSize(24, 24);
   this.newInstanceButton.toolTip = "New Instance";
   this.newInstanceButton.onMousePress = () => {
      // If you have no global parameters to save, do nothing or a pass
      // or call some hypothetical parameters object if needed
      // e.g. MyParameters.save();
      this.newInstance();
   };
   this.buttonsSizer.add( this.newInstanceButton );
   this.buttonsSizer.addSpacing( 12 );

   // 2) Stretch to push OK/Cancel to the right
   this.buttonsSizer.addStretch();




   this.cancelButton = new PushButton( this.leftPanel );
   this.cancelButton.text = "Exit";
   this.cancelButton.onClick = function(){ this.dialog.cancel(); }.bind(this);
   this.buttonsSizer.add( this.cancelButton );

   this.leftPanel.sizer.add( this.buttonsSizer );
   this.leftPanel.sizer.addSpacing( 6 );


/****************************************************************************
 * 1) We define two buttons: "Zoom In" and "Zoom Out" above the thumbsBox.
 *    We store a global scale factor in the dialog, e.g. this.previewScale = 1.0
 ****************************************************************************/
this.previewScale = 1.0;  // Start at no scaling
this.zoomButtonsSizer = new HorizontalSizer;
this.zoomButtonsSizer.spacing = 6;

// Zoom In button
this.zoomInButton = new PushButton( this );
this.zoomInButton.text = "Zoom In";
this.zoomInButton.toolTip = "Scale up the preview images by +25%";
this.zoomInButton.onClick = function()
{
   this.dialog.previewScale += 0.25;  // Increase scale
   this.dialog.updateAllTilePreviews(); // refresh all tiles
}.bind(this);

this.zoomOutButton = new PushButton( this );
this.zoomOutButton.text = "Zoom Out";
this.zoomOutButton.toolTip = "Scale down the preview images by 25%";
this.zoomOutButton.onClick = function()
{
   // Keep it above some minimum, say 0.25
   this.dialog.previewScale = Math.max(0.25, this.dialog.previewScale - 0.25);
   this.dialog.updateAllTilePreviews();
}.bind(this);

this.zoomButtonsSizer.add( this.zoomInButton );
this.zoomButtonsSizer.addSpacing( 8 );
this.zoomButtonsSizer.add( this.zoomOutButton );
// If you want them left-aligned, remove the stretch
this.zoomButtonsSizer.addStretch();

/****************************************************************************
 * 2) Create a vertical sizer that has the zoomButtons on top, and the grid below
 ****************************************************************************/
this.rightSizer = new VerticalSizer;
this.rightSizer.margin = 0;
this.rightSizer.spacing = 8;

// Add the zoom buttons on top
this.rightSizer.add( this.zoomButtonsSizer );

// Now build the 3×4 grid as before
this.thumbsBox = new VerticalSizer;
this.thumbsBox.margin = 0;
this.thumbsBox.spacing = 6;

// We'll hold references to the tile controls in an array
this.thumbnailArray = [];

   this.paletteNames = [
      "SHO","HOO","HSO","HOS",
      "OSS","OHH","OSH","OHS",
      "HSS","Realistic1","Realistic2","Foraxx"
   ];

   this.thumbsBox = new VerticalSizer;
   this.thumbsBox.margin = 0;
   this.thumbsBox.spacing = 6;

   // We'll hold references to the thumbnail controls in an array
   this.thumbnailArray = [];

   let index = 0;
   for ( let row = 0; row < 3; row++ )
   {
      let rowSizer = new HorizontalSizer;
      rowSizer.spacing = 6;

      for ( let col = 0; col < 4; col++ )
      {
         let pName = this.paletteNames[index++];

         let ctrl = new Control( this );
         ctrl.setMinSize( 200, 130 );  // each preview tile size
         ctrl.paletteName   = pName;
         ctrl.selected      = false;
         ctrl.previewBitmap = null;

         ctrl.refreshMe = function() {
            this.update();
         };

      ctrl.onPaint = function()
      {
         let g = new Graphics(this);
         // Fill background
         g.fillRect( 0, 0, this.width, this.height, new Brush(0xFF202020) );

         // If we have a preview image
         if ( this.previewBitmap )
         {
            // Let's retrieve the scale factor from the dialog
            let scale = this.dialog.previewScale;

            // We'll scale the entire coordinate system around the origin (0,0)
            g.scaleTransformation( scale );

            // The *unscaled* width/height of the bitmap
            let bmpW = this.previewBitmap.width;
            let bmpH = this.previewBitmap.height;

            // The *scaled* width/height
            let scaledW = bmpW * scale;
            let scaledH = bmpH * scale;

            // We want the scaled image centered in the tile
            // But after scaling, coordinates are effectively smaller by “scale,”
            // so we do something like:
            let centerX = (this.width  - scaledW) / 2;
            let centerY = (this.height - scaledH) / 2;

            // Because we already did g.scaleTransformation(...),
            // we must transform the center coords by 1/scale:
            let drawX = centerX / scale;
            let drawY = centerY / scale;

            // Now draw the original-size bitmap at (drawX, drawY)
            g.drawBitmap( drawX, drawY, this.previewBitmap );

            // Reset transformations if we wish
            g.resetTransformation();
         }

         // Always draw the text label
         g.font = new Font("Helvetica", 12);
         let textColor = this.selected ? 0xFF00FF00 : 0xFFFFFFFF;
         g.pen = new Pen( textColor );

         // We want to draw text in the bottom-left corner *outside* the scaled region,
         // so we do it AFTER g.resetTransformation():
         let textX = 5;
         let textY = this.height - 5;
         g.drawText( textX, textY, this.paletteName );

         g.end();
      };

      ctrl.onMousePress = function()
      {
         // Unselect all
         for ( let t = 0; t < this.dialog.thumbnailArray.length; t++ )
         {
            this.dialog.thumbnailArray[t].selected = false;
            this.dialog.thumbnailArray[t].refreshMe();
         }
         this.selected = true;
         this.refreshMe();

         // Generate the final big image for this palette
         this.dialog.generateFinalPaletteImage( this.paletteName );
      }.bind(ctrl);

      rowSizer.add( ctrl, 1 );
      this.thumbnailArray.push(ctrl);
   }
   this.thumbsBox.add( rowSizer );
}

// Finally add thumbsBox to rightSizer
this.rightSizer.add( this.thumbsBox, 1 );

   /************************************************************
    * 3) Main Horizontal Sizer
    ************************************************************/
   this.mainSizer = new HorizontalSizer;
   this.mainSizer.margin = 6;
   this.mainSizer.spacing = 8;

   // Add leftPanel (fixed at 300 px)
   this.mainSizer.add( this.leftPanel );
      this.adjustToContents();

   // Some spacing
   this.mainSizer.addSpacing( 8 );

   // Add the rightSizer sizer with stretch factor => it expands on resizing
   this.mainSizer.add( this.rightSizer, 1 );

   this.sizer = this.mainSizer;

   this.windowTitle = "Perfect Palette Picker v" +VERSION;

this.updateAllTilePreviews = function()
{
   for ( let i = 0; i < this.thumbnailArray.length; i++ )
      this.thumbnailArray[i].refreshMe();
};

/* ------------------------------------------------------------------------
 * We keep references to the "preview" channels so the user sees the effect
 * in the thumbnails. In a minimal version, we’re not painting actual color
 * previews, but you can extend it to do so if you want (via custom painting).
 * ------------------------------------------------------------------------*/
this.previewHa    = null;
this.previewOIII  = null;
this.previewSII   = null;
this.previewR     = null; // Extracted from OSC
this.previewG     = null;
this.previewB     = null;

// New variables for final channels
this.finalHa      = null;
this.finalOIII    = null;
this.finalSII     = null;

/* ------------------------------------------------------------------------
 * makeFinalCopy( inView, newId ) => return a new ImageView
 * with the same data but new ID. We can apply stretching on it if needed.
 * ------------------------------------------------------------------------*/
this.makeFinalCopy = function( inView, newId )
{
    let w = new ImageWindow(
        inView.image.width,
        inView.image.height,
        inView.image.numberOfChannels,
        inView.image.bitsPerSample,
        inView.image.isReal,
        inView.image.isColor,
        newId
    );
    w.mainView.beginProcess();
    w.mainView.image.assign( inView.image );
    w.mainView.endProcess();
    return w.mainView;
};


/* ------------------------------------------------------------------------
 * preparePreviewPalettes():
 *   1. Check combos for Ha/OIII/SII and OSC dropdowns
 *   2. Map channels based on which dropdowns are populated
 *   3. Stretch final channels if linearCheckbox is checked
 *   4. Downsample stretched final channels for previews
 * ------------------------------------------------------------------------*/
this.preparePreviewPalettes = function () {
    // Retrieve selected items from combo boxes
    let selHa = this.comboHa.currentItem;
    let selOIII = this.comboOIII.currentItem;
    let selSII = this.comboSII.currentItem;
    let selOSC1 = this.comboOSC.currentItem;
    let selOSC2 = this.comboOSC2.currentItem;

    // Get window IDs based on selections
    let haId = (selHa > 0) ? this.comboHa.itemText(selHa) : "";
    let oiiiId = (selOIII > 0) ? this.comboOIII.itemText(selOIII) : "";
    let siiId = (selSII > 0) ? this.comboSII.itemText(selSII) : "";
    let osc1Id = (selOSC1 > 0) ? this.comboOSC.itemText(selOSC1) : "";
    let osc2Id = (selOSC2 > 0) ? this.comboOSC2.itemText(selOSC2) : "";

    let haveHa = (haId.length > 0);
    let haveOIII = (oiiiId.length > 0);
    let haveSII = (siiId.length > 0);
    let haveOSC1 = (osc1Id.length > 0);
    let haveOSC2 = (osc2Id.length > 0);

    console.writeln("preparePreviewPalettes() => Ha:", haId,
        "  OIII:", oiiiId, "  SII:", siiId,
        "  OSC1:", osc1Id, "  OSC2:", osc2Id);

    // Clean up any previous preview and final windows
    this.cleanupPreviewWindows();

    // Initialize final channels
    this.finalHa = null;
    this.finalOIII = null;
    this.finalSII = null;

    // Initialize preview channels
    this.previewHa = null;
    this.previewOIII = null;
    this.previewSII = null;

    // -------------------------
    // Process OSC1 (Ha and OIII)
    // -------------------------
    if (haveOSC1) {
        let W1 = ImageWindow.windowById(osc1Id);
        if (!W1) {
            console.warningln("[!] OSC1 window not found: ", osc1Id);
        } else {
            let channels1 = extractOSCchannels(W1.mainView);
            if (channels1.length < 3) {
                console.warningln("[!] OSC1 could not extract 3 channels!");
            } else {
                // Map OSC1 Red channel to Ha
                this.finalHa = this.makeFinalCopy(channels1[0], "Ha_OSC1_final");
                console.writeln("[OSC1] Assigned Ha:", this.finalHa.id);
                if (this.linearCheckbox.checked) {
                    processMonoImage(this.finalHa, 0.25, 1);
                    console.writeln("[OSC1] Processed Ha with stretch.");
                }

                // Average OSC1 Green and Blue channels to get OIII
                this.finalOIII = this.averageChannels(channels1[1], channels1[2], "OIII_OSC1_final");
                console.writeln("[OSC1] Assigned OIII:", this.finalOIII.id);
                if (this.linearCheckbox.checked) {
                    processMonoImage(this.finalOIII, 0.25, 1);
                    console.writeln("[OSC1] Processed OIII with stretch.");
                }

                // **Create Preview Channels for OSC1**
                // Preview for Ha
                let previewHaOSC1 = this.makePreviewCopy(this.finalHa, "Ha_OSC1_preview");
                downsample4x(previewHaOSC1);
                this.previewHa = previewHaOSC1;
                console.writeln("[OSC1] Created preview Ha:", previewHaOSC1.id);

                // Preview for OIII
                let previewOIIIOSC1 = this.makePreviewCopy(this.finalOIII, "OIII_OSC1_preview");
                downsample4x(previewOIIIOSC1);
                this.previewOIII = previewOIIIOSC1;
                console.writeln("[OSC1] Created preview OIII:", previewOIIIOSC1.id);
            }
        }
    }

    // -------------------------
    // Process OSC2 (SII and OIII)
    // -------------------------
    if (haveOSC2) {
        let W2 = ImageWindow.windowById(osc2Id);
        if (!W2) {
            console.warningln("[!] OSC2 window not found: ", osc2Id);
        } else {
            let channels2 = extractOSCchannels(W2.mainView);
            if (channels2.length < 3) {
                console.warningln("[!] OSC2 could not extract 3 channels!");
            } else {
                // Map OSC2 Red channel to SII
                this.finalSII = this.makeFinalCopy(channels2[0], "SII_OSC2_final");
                console.writeln("[OSC2] Assigned SII:", this.finalSII.id);
                if (this.linearCheckbox.checked) {
                    processMonoImage(this.finalSII, 0.25, 1);
                    console.writeln("[OSC2] Processed SII with stretch.");
                }

                // Average OSC2 Green and Blue channels to get OIII
                let oiiiOSC2 = this.averageChannels(channels2[1], channels2[2], "OIII_OSC2_final");
                console.writeln("[OSC2] Assigned OIII:", oiiiOSC2.id);
                if (this.linearCheckbox.checked) {
                    processMonoImage(oiiiOSC2, 0.25, 1);
                    console.writeln("[OSC2] Processed OIII with stretch.");
                }

                // If OSC1 provided OIII, average it with OSC2's OIII
                if (this.finalOIII && oiiiOSC2) {
                    this.finalOIII = this.averageChannels(this.finalOIII, oiiiOSC2, "OIII_combined_final");
                    console.writeln("[OSC2] Averaged OSC1 and OSC2 OIII into:", this.finalOIII.id);
                    if (this.linearCheckbox.checked) {
                        processMonoImage(this.finalOIII, 0.25, 2);
                        console.writeln("[OSC2] Processed combined OIII with stretch.");
                    }

                    // **Create Preview for Combined OIII**
                    let previewOIIICombined = this.makePreviewCopy(this.finalOIII, "OIII_combined_preview");
                    downsample4x(previewOIIICombined);
                    this.previewOIII = previewOIIICombined;
                    console.writeln("[OSC2] Created preview combined OIII:", previewOIIICombined.id);
                } else if (oiiiOSC2) {
                    this.finalOIII = oiiiOSC2;
                    console.writeln("[OSC2] Assigned final OIII:", this.finalOIII.id);

                    // **Create Preview for OIII_OSC2_final**
                    let previewOIIIOSC2 = this.makePreviewCopy(this.finalOIII, "OIII_OSC2_preview");
                    downsample4x(previewOIIIOSC2);
                    this.previewOIII = previewOIIIOSC2;
                    console.writeln("[OSC2] Created preview OIII:", previewOIIIOSC2.id);
                }

                // **Create Preview for SII_OSC2_final**
                if (this.finalSII) {
                    let previewSIIOSC2 = this.makePreviewCopy(this.finalSII, "SII_OSC2_preview");
                    downsample4x(previewSIIOSC2);
                    this.previewSII = previewSIIOSC2;
                    console.writeln("[OSC2] Created preview SII:", previewSIIOSC2.id);
                }
            }
        }
    }

    // -------------------------
    // Process Individual Ha/OIII/SII (Non-OSC)
    // -------------------------
    if (haveHa || haveOIII || haveSII) {
        if (haveHa) {
            let W = ImageWindow.windowById(haId);
            if (!W) {
                console.warningln("[!] Ha window not found: ", haId);
            } else {
                if (this.linearCheckbox.checked) {
                    let finalHaCopy = this.makeFinalCopy(W.mainView, "Ha_final");
                    processMonoImage(finalHaCopy, 0.25, 1);
                    this.finalHa = finalHaCopy;
                    console.writeln("[Ha] Assigned and processed final Ha:", this.finalHa.id);
                } else {
                    this.finalHa = W.mainView;
                    console.writeln("[Ha] Assigned final Ha:", this.finalHa.id);
                }

                let previewHa = this.makePreviewCopy(this.finalHa, "Ha_preview");
                downsample4x(previewHa);
                this.previewHa = previewHa;
                console.writeln("[Ha] Created preview Ha:", previewHa.id);
            }
        }

        if (haveOIII) {
            let W = ImageWindow.windowById(oiiiId);
            if (!W) {
                console.warningln("[!] OIII window not found: ", oiiiId);
            } else {
                if (this.linearCheckbox.checked) {
                    let finalOIIICopy = this.makeFinalCopy(W.mainView, "OIII_final");
                    processMonoImage(finalOIIICopy, 0.25, 1);
                    this.finalOIII = finalOIIICopy;
                    console.writeln("[OIII] Assigned and processed final OIII:", this.finalOIII.id);
                } else {
                    this.finalOIII = W.mainView;
                    console.writeln("[OIII] Assigned final OIII:", this.finalOIII.id);
                }

                let previewOIII = this.makePreviewCopy(this.finalOIII, "OIII_preview");
                downsample4x(previewOIII);
                this.previewOIII = previewOIII;
                console.writeln("[OIII] Created preview OIII:", previewOIII.id);
            }
        }

        if (haveSII) {
            let W = ImageWindow.windowById(siiId);
            if (!W) {
                console.warningln("[!] SII window not found: ", siiId);
            } else {
                if (this.linearCheckbox.checked) {
                    let finalSICopy = this.makeFinalCopy(W.mainView, "SII_final");
                    processMonoImage(finalSICopy, 0.25, 1);
                    this.finalSII = finalSICopy;
                    console.writeln("[SII] Assigned and processed final SII:", this.finalSII.id);
                } else {
                    this.finalSII = W.mainView;
                    console.writeln("[SII] Assigned final SII:", this.finalSII.id);
                }

                let previewSII = this.makePreviewCopy(this.finalSII, "SII_preview");
                downsample4x(previewSII);
                this.previewSII = previewSII;
                console.writeln("[SII] Created preview SII:", previewSII.id);
            }
        }
    }

    // -------------------------
    // Create Mini-Previews for Each Palette
    // -------------------------
    console.writeln("[*] Now building each palette’s mini-preview...");
    for (let i = 0; i < this.thumbnailArray.length; i++) {
        let paletteName = this.thumbnailArray[i].paletteName;

        // Combine the preview channels to produce a small color preview image
        let miniView = this.createMiniPalettePreview(paletteName);

        if (miniView) {
            // Convert miniView.mainView.image => a Bitmap
            let bmp = miniView.image.render(); // returns a Bitmap
            // Store in the thumbnail’s previewBitmap
            this.thumbnailArray[i].previewBitmap = bmp;
            this.thumbnailArray[i].refreshMe(); // repaint
            // Optionally close miniView’s window
            miniView.window.forceClose();
            console.writeln("[Palette: " + paletteName + "] Created mini-preview:", bmp);
        }
        else {
            this.thumbnailArray[i].previewBitmap = null;
            console.warningln("[Palette: " + paletteName + "] Failed to create mini-preview.");
        }
    }
    console.writeln("[*] Palette mini-previews done.");
};




/**
 * averageChannels(view1, view2, outName):
 *   Averages two channels and returns the resulting mainView.
 *
 * @param {View} view1 - First channel view
 * @param {View} view2 - Second channel view
 * @param {string} outName - Output image ID
 * @returns {View} - Averaged channel mainView
 */
this.averageChannels = function(view1, view2, outName) {
    // Create a new image window for the averaged channel
    let width = view1.image.width;
    let height = view1.image.height;
    let bits = view1.image.bitsPerSample;
    let real = view1.image.isReal;

    let targetWin = new ImageWindow(width, height, 1, bits, real, /*isColor=*/false, outName);
    targetWin.mainView.beginProcess();
    targetWin.mainView.image.fill(0);  // Initialize to black
    targetWin.mainView.endProcess();

    // Use PixelMath to average the two channels
    let P = new PixelMath;
    P.useSingleExpression = true;
    P.expression = "(" + view1.id + " + " + view2.id + ") / 2";
    P.clearImageCacheAndExit = false;
    P.cacheGeneratedImages = false;
    P.generateOutput = true;
    P.singleThreaded = false;
    P.optimization = true;
    P.use64BitWorkingImage = true;
    P.rescale = false;
    P.truncate = true;
    P.truncateLower = 0;
    P.truncateUpper = 1;
    P.createNewImage = false; // Apply to existing image
    P.showNewImage = false;

    P.executeOn(targetWin.mainView);

    return targetWin.mainView;
};


/**
 * createMiniPalettePreview(paletteName):
 *   Creates a mini-preview image for the given palette, based on the
 *   already downsampled, optionally stretched "preview" channels
 *   (this.previewHa, this.previewOIII, this.previewSII).
 *
 *   Returns an ImageWindow's mainView, or null on failure.
 */
this.createMiniPalettePreview = function (paletteName) {
    console.writeln("createMiniPalettePreview(", paletteName, ")");

    let finalR = null, finalG = null, finalB = null;

    // We'll produce an output ID like "Preview_SHO"
    let outName = "Preview_" + paletteName;

    // Assign usedHa and usedSII based on availability
    let usedHa = this.previewHa || this.previewSII; // Substitute SII for Ha if Ha is missing
    let usedSII = this.previewSII || this.previewHa; // Substitute Ha for SII if SII is missing

    // Ensure at least one of Ha or SII is present along with OIII
    if (!usedHa && !this.previewOIII) {
        console.warningln("[!] Missing both Ha/SII and OIII channels for palette:", paletteName);
        return null;
    }

    // Assign views based on substitution
    let HaView = usedHa;         // Either previewHa or previewSII
    let OIIIView = this.previewOIII;   // OIII is mandatory
    let SIIView = usedSII;       // Either previewSII or previewHa

    // Now, apply the same palette logic regardless of OSC or non-OSC
    switch (paletteName) {
        // =======================
        // Standard older palettes: SHO, HOO, etc.
        // =======================
        case "SHO": case "HOO": case "HSO": case "HOS":
        case "OSS": case "OHH": case "OSH": case "OHS":
        case "HSS":
        {
            // Re-use mapChannels just like the final code
            let mapped = mapChannels(paletteName, HaView, OIIIView, SIIView);
            finalR = mapped[0];
            finalG = mapped[1];
            finalB = mapped[2];
            // Combine them => new color image
            let colorView = combineChannelsToColor([finalR, finalG, finalB], outName);
            return colorView;
        }

        // =======================
        // Realistic1 partial merges
        // =======================
        case "Realistic1":
        {
            // Redchannel = (Ha + SII)/2 if SII present, else just Ha
            let exprR = (HaView && SIIView)
                ? "(" + HaView.id + " + " + SIIView.id + ") / 2"
                : (HaView ? HaView.id : "0");

            // Greenchannel = 0.3*Ha + 0.7*OIII
            let exprG = (HaView ? "0.3*" + HaView.id : "0")
                + (OIIIView ? " + 0.7*" + OIIIView.id : "");

            // BlueChannel = 0.9*OIII + 0.1*Ha
            let exprB = (OIIIView ? "0.9*" + OIIIView.id : "0")
                + (HaView ? " + 0.1*" + HaView.id : "");

            let colorView = this.combineChannelsToColorExpressionsMini(outName, exprR, exprG, exprB);
            return colorView;
        }

        // =======================
        // Realistic2 partial merges
        // =======================
        case "Realistic2":
        {
            // Red = 0.7*Ha + 0.3*SII (if SII missing => just Ha)
            let exprR;
            if (HaView && SIIView)
                exprR = "0.7*" + HaView.id + " + 0.3*" + SIIView.id;
            else if (HaView)
                exprR = HaView.id;
            else
                exprR = "0";

            // Green = 0.3*SII + 0.7*OIII
            let exprG;
            if (SIIView && OIIIView)
                exprG = "0.3*" + SIIView.id + " + 0.7*" + OIIIView.id;
            else if (OIIIView)
                exprG = OIIIView.id;
            else
                exprG = "0";

            // Blue = OIII
            let exprB = (OIIIView ? OIIIView.id : "0");

            let colorView = this.combineChannelsToColorExpressionsMini(outName, exprR, exprG, exprB);
            return colorView;
        }

        // =======================
        // Foraxx
        // =======================
        case "Foraxx":
        {
            if (HaView && OIIIView && !SIIView) {
                // Red => Ha
                let exprR = HaView.id;

                // Green => ((Ha*OIII)^(~(Ha*OIII)))*Ha + ~((Ha*OIII)^(~(Ha*OIII)))*OIII
                let ho = "(" + HaView.id + "*" + OIIIView.id + ")";
                let exprG = "(" + ho + " ^ ~" + ho + ") * " + HaView.id
                    + " + ~(" + ho + " ^ ~" + ho + ") * " + OIIIView.id;

                // Blue => OIII
                let exprB = OIIIView.id;

                let colorView = this.combineChannelsToColorExpressionsMini(outName, exprR, exprG, exprB);
                return colorView;
            }
            else if (HaView && OIIIView && SIIView) {
                // Red => (OIII^~OIII)*SII + ~(OIII^~OIII)*Ha
                let o = OIIIView.id;
                let exprR = "(" + o + " ^ ~" + o + ") * " + SIIView.id
                    + " + ~(" + o + " ^ ~" + o + ") * " + HaView.id;

                // Green => ((Ha*OIII)^(~(Ha*OIII)))*Ha + ~((Ha*OIII)^(~(Ha*OIII)))*OIII
                let ho = "(" + HaView.id + "*" + OIIIView.id + ")";
                let exprG = "(" + ho + " ^ ~" + ho + ") * " + HaView.id
                    + " + ~(" + ho + " ^ ~" + ho + ") * " + OIIIView.id;

                // Blue => OIII
                let exprB = OIIIView.id;

                let colorView = this.combineChannelsToColorExpressionsMini(outName, exprR, exprG, exprB);
                return colorView;
            }
            else {
                console.warningln("Foraxx: not enough channels to do advanced merges. Using fallback.");
                // Fallback => just do SHO or similar
                let mapped = mapChannels("SHO", HaView, OIIIView, SIIView);
                finalR = mapped[0];
                finalG = mapped[1];
                finalB = mapped[2];
                let colorView = combineChannelsToColor([finalR, finalG, finalB], outName);
                return colorView;
            }
        }

        default:
        {
            // Fallback => SHO
            let mapped = mapChannels("SHO", HaView, OIIIView, SIIView);
            finalR = mapped[0];
            finalG = mapped[1];
            finalB = mapped[2];
            let colorView = combineChannelsToColor([finalR, finalG, finalB], outName);
            return colorView;
        }
    }
};



/**
 * combineChannelsToColorExpressions( outId, exprR, exprG, exprB ):
 *   1) Create a new 3-channel color ImageWindow of the same size as one of your preview images
 *   2) Runs PixelMath multi-expressions (exprR, exprG, exprB) on it
 *   3) Returns the new mainView
 */
this.combineChannelsToColorExpressions = function( outId, exprR, exprG, exprB )
{
   let refView = null;
   if (this.finalHa) {
       refView = this.finalHa;
   } else if (this.finalOIII) {
       refView = this.finalOIII;
   } else if (this.finalSII) {
       refView = this.finalSII;
   } else if (this.previewR) { // Fallback to preview if necessary
       refView = this.previewR;
   }

   if (!refView) {
       console.warningln("No reference final channel available for image dimensions. Cannot build partial merges.");
       return null;
   }

   let w    = refView.image.width;
   let h    = refView.image.height;
   let bits = refView.image.bitsPerSample;
   let real = refView.image.isReal;

   // 1) Make a brand-new color image
   let targetWin = new ImageWindow( w, h, 3, bits, real, /*isColor=*/true, outId );
   targetWin.mainView.beginProcess();
   targetWin.mainView.image.fill( 0 );
   targetWin.mainView.endProcess();

   // 2) Setup PixelMath in multi-expression mode
   let PM = new PixelMath;
   PM.useSingleExpression = false;
   PM.expression  = exprR;
   PM.expression1 = exprG;
   PM.expression2 = exprB;
   PM.expression3 = "";

   PM.clearImageCacheAndExit = false;
   PM.cacheGeneratedImages   = false;
   PM.generateOutput         = true;
   PM.singleThreaded         = false;
   PM.optimization           = true;
   PM.use64BitWorkingImage   = false;
   PM.rescale               = false;
   PM.truncate              = true;
   PM.truncateLower         = 0;
   PM.truncateUpper         = 1;

   // We do NOT create a new image => apply onto our target
   PM.createNewImage = false;
   PM.showNewImage   = false;

   PM.executeOn( targetWin.mainView );

   return targetWin.mainView;
};

this.combineChannelsToColorExpressionsMini = function( outId, exprR, exprG, exprB )
{
   // We'll pick any existing "preview" reference for dimension/bit-depth
   let refId = "";
   if (this.previewHa)   refId = this.previewHa.id;
   else if (this.previewOIII) refId = this.previewOIII.id;
   else if (this.previewSII)  refId = this.previewSII.id;
   else if (this.previewR)    refId = this.previewR.id;
   // if still no ref => fallback or error
   if ( refId === "" )
   {
      console.warningln("No reference preview for dimension—cannot build partial merges.");
      return null;
   }

   let refWin = ImageWindow.windowById(refId);
   if ( !refWin || refWin.isNull )
   {
      console.warningln("Ref window not found for ID=", refId);
      return null;
   }

   let w    = refWin.mainView.image.width;
   let h    = refWin.mainView.image.height;
   let bits = refWin.mainView.image.bitsPerSample;
   let real = refWin.mainView.image.isReal;

   // 1) Make a brand-new color image
   let targetWin = new ImageWindow( w, h, 3, bits, real, /*isColor=*/true, outId );
   targetWin.mainView.beginProcess();
   targetWin.mainView.image.fill( 0 );
   targetWin.mainView.endProcess();

   // 2) Setup PixelMath in multi-expression mode
   let PM = new PixelMath;
   PM.useSingleExpression = false;
   PM.expression  = exprR;
   PM.expression1 = exprG;
   PM.expression2 = exprB;
   PM.expression3 = "";

   PM.clearImageCacheAndExit = false;
   PM.cacheGeneratedImages   = false;
   PM.generateOutput         = true;
   PM.singleThreaded         = false;
   PM.optimization           = true;
   PM.use64BitWorkingImage   = false;
   PM.rescale               = false;
   PM.truncate              = true;
   PM.truncateLower         = 0;
   PM.truncateUpper         = 1;

   // We do NOT create a new image => apply onto our target
   PM.createNewImage = false;
   PM.showNewImage   = false;

   PM.executeOn( targetWin.mainView );

   return targetWin.mainView;
};

/* ------------------------------------------------------------------------
 * generateFinalPaletteImage(paletteName):
 *   - Use already extracted and processed finalHa, finalOIII, finalSII
 *   - For standard SHO/HOO/etc., call mapChannels() + combineChannelsToColor().
 *   - For Realistic1, Realistic2, Foraxx, build PixelMath expressions
 *     and call combineChannelsToColorExpressions().
 * ------------------------------------------------------------------------*/
this.generateFinalPaletteImage = function (paletteName) {
    console.writeln("generateFinalPaletteImage(", paletteName, ")");

    // Retrieve the already extracted and processed final channels
    let HaView = this.finalHa;         // Full-res Ha channel (from individual or OSC)
    let OIIIView = this.finalOIII;     // Full-res OIII channel (from individual or OSC)
    let SIIView = this.finalSII;       // Full-res SII channel (from individual or OSC)

    // Check if at least Ha or OIII is available
    if (!HaView && !OIIIView) {
        console.warningln("[!] Missing both Ha and OIII channels. Cannot generate final palette image for:", paletteName);
        return;
    }

    // Prepare the final palette name
    let outName = "Final_" + paletteName;

    // Initialize final channels
    let finalR = null, finalG = null, finalB = null;

    switch (paletteName) {
        // =======================
        // Standard older palettes: SHO, HOO, etc.
        // =======================
        case "SHO": case "HOO": case "HSO": case "HOS":
        case "OSS": case "OHH": case "OSH": case "OHS":
        case "HSS":
        {
            // Re-use mapChannels just like the final code
            let mapped = mapChannels(paletteName, HaView, OIIIView, SIIView);
            finalR = mapped[0];
            finalG = mapped[1];
            finalB = mapped[2];
            // Combine them => new color image
            let colorView = combineChannelsToColor([finalR, finalG, finalB], outName);
            if (colorView) {
                colorView.window.show();
                colorView.window.bringToFront();
                console.writeln("   => Created final image: ", colorView.id);
            }
            else
                console.warningln("   [!] Could not combine channels for palette=", paletteName);

            break;
        }

        // =======================
        // Realistic1 partial merges
        // =======================
        case "Realistic1":
        {
            // Redchannel = (Ha + SII)/2 if SII present, else just Ha
            let exprR = (HaView && SIIView)
                ? "(" + HaView.id + " + " + SIIView.id + ") / 2"
                : (HaView ? HaView.id : "0");

            // Greenchannel = 0.3*Ha + 0.7*OIII
            let exprG = (HaView ? "0.3*" + HaView.id : "0")
                + (OIIIView ? " + 0.7*" + OIIIView.id : "");

            // BlueChannel = 0.9*OIII + 0.1*Ha
            let exprB = (OIIIView ? "0.9*" + OIIIView.id : "0")
                + (HaView ? " + 0.1*" + HaView.id : "");

            let colorView = this.combineChannelsToColorExpressions(outName, exprR, exprG, exprB);
            if (colorView) {
                colorView.window.show();
                colorView.window.bringToFront();
                console.writeln("   => Created final Realistic1 image: ", colorView.id);
            }
            break;
        }

        // =======================
        // Realistic2 partial merges
        // =======================
        case "Realistic2":
        {
            // Red = 0.7*Ha + 0.3*SII (if SII missing => just Ha)
            let exprR;
            if (HaView && SIIView)
                exprR = "0.7*" + HaView.id + " + 0.3*" + SIIView.id;
            else if (HaView)
                exprR = HaView.id;
            else
                exprR = "0";

            // Green = 0.3*SII + 0.7*OIII
            let exprG;
            if (SIIView && OIIIView)
                exprG = "0.3*" + SIIView.id + " + 0.7*" + OIIIView.id;
            else if (OIIIView)
                exprG = OIIIView.id;
            else
                exprG = "0";

            // Blue = OIII
            let exprB = (OIIIView ? OIIIView.id : "0");

            let colorView = this.combineChannelsToColorExpressions(outName, exprR, exprG, exprB);
            if (colorView) {
                colorView.window.show();
                colorView.window.bringToFront();
                console.writeln("   => Created final Realistic2 image: ", colorView.id);
            }
            break;
        }

        // =======================
        // Foraxx
        // =======================
        case "Foraxx":
        {
            if (HaView && OIIIView && !SIIView) {
                // Red => Ha
                let exprR = HaView.id;

                // Green => ((Ha*OIII)^(~(Ha*OIII)))*Ha + ~((Ha*OIII)^(~(Ha*OIII)))*OIII
                let ho = "(" + HaView.id + "*" + OIIIView.id + ")";
                let exprG = "(" + ho + " ^ ~" + ho + ") * " + HaView.id
                    + " + ~(" + ho + " ^ ~" + ho + ") * " + OIIIView.id;

                // Blue => OIII
                let exprB = OIIIView.id;

                let colorView = this.combineChannelsToColorExpressions(outName, exprR, exprG, exprB);
                if (colorView) {
                    colorView.window.show();
                    colorView.window.bringToFront();
                    console.writeln("   => Created final Foraxx(Ha/OIII) image: ", colorView.id);
                }
            }
            else if (HaView && OIIIView && SIIView) {
                // Red => (OIII^~OIII)*SII + ~(OIII^~OIII)*Ha
                let o = OIIIView.id;
                let exprR = "(" + o + " ^ ~" + o + ") * " + SIIView.id
                    + " + ~(" + o + " ^ ~" + o + ") * " + HaView.id;

                // Green => ((Ha*OIII)^(~(Ha*OIII)))*Ha + ~((Ha*OIII)^(~(Ha*OIII)))*OIII
                let ho = "(" + HaView.id + "*" + OIIIView.id + ")";
                let exprG = "(" + ho + " ^ ~" + ho + ") * " + HaView.id
                    + " + ~(" + ho + " ^ ~" + ho + ") * " + OIIIView.id;

                // Blue => OIII
                let exprB = OIIIView.id;

                let colorView = this.combineChannelsToColorExpressions(outName, exprR, exprG, exprB);
                if (colorView) {
                    colorView.window.show();
                    colorView.window.bringToFront();
                    console.writeln("   => Created final Foraxx(S,H,O) image: ", colorView.id);
                }
            }
            else {
                console.warningln("Foraxx: not enough channels to do advanced merges. Using fallback.");
                // Fallback => just do SHO or similar
                let mapped = mapChannels("SHO", HaView, OIIIView, SIIView);
                finalR = mapped[0];
                finalG = mapped[1];
                finalB = mapped[2];
                let colorView = combineChannelsToColor([finalR, finalG, finalB], outName);
                if (colorView) {
                    colorView.window.show();
                    colorView.window.bringToFront();
                    console.writeln("   => Created final fallback Foraxx image: ", colorView.id);
                }
            }
            break;
        }

        default:
        {
            // Fallback => SHO
            let mapped = mapChannels("SHO", HaView, OIIIView, SIIView);
            finalR = mapped[0];
            finalG = mapped[1];
            finalB = mapped[2];
            let colorView = combineChannelsToColor([finalR, finalG, finalB], outName);
            if (colorView) {
                colorView.window.show();
                colorView.window.bringToFront();
                console.writeln("   => Created final fallback image: ", colorView.id);
            }
            break;
        }
    }
};



/* ------------------------------------------------------------------------
 * makePreviewCopy( inView, newId ) => return a new ImageView
 * with the same data but new ID. We can do the stretch on it.
 * ------------------------------------------------------------------------*/
this.makePreviewCopy = function( inView, newId )
{
   let w = new ImageWindow(
      inView.image.width,
      inView.image.height,
      inView.image.numberOfChannels,
      inView.image.bitsPerSample,
      inView.image.isReal,
      inView.image.isColor,
      newId
   );
   w.mainView.beginProcess();
   w.mainView.image.assign( inView.image );
   w.mainView.endProcess();
   return w.mainView;
};



/* ------------------------------------------------------------------------
 * cleanupPreviewWindows():
 *   Closes temporary "_preview", "_final", and "_pppR", "_pppG", "_pppB" images
 *   without any other conditions.
 * ------------------------------------------------------------------------*/
this.cleanupPreviewWindows = function()
{
    let allW = ImageWindow.windows;

    // Define all suffixes that need to be closed
    const suffixesToClose = ["_preview", "_final", "_pppR", "_pppG", "_pppB"];

    // Iterate backwards to safely remove windows during iteration
    for (let i = allW.length - 1; i >= 0; i--)
    {
        let id = allW[i].mainView.id;

        // Check if the id ends with any of the specified suffixes
        let shouldClose = suffixesToClose.some(suffix => id.endsWith(suffix));

        // If it should be closed, force close the window
        if (shouldClose)
        {
            allW[i].forceClose();
            console.writeln("Closed temporary window: " + id);
        }
    }

    // Reset preview references
    this.previewHa   = null;
    this.previewOIII = null;
    this.previewSII  = null;
    this.previewR    = null;
    this.previewG    = null;
    this.previewB    = null;

    // Reset final channels references
    this.finalHa = null;
    this.finalOIII = null;
    this.finalSII = null;
}


/**
 * hasSuffix(id, suffixes):
 *   Checks if the given id ends with any of the provided suffixes.
 *
 * @param {string} id - The image ID to check.
 * @param {Array} suffixes - Array of suffix strings to check against.
 * @returns {boolean} - True if any suffix matches, else false.
 */
function hasSuffix(id, suffixes) {
    for (let i = 0; i < suffixes.length; i++) {
        if (id.substring(id.length - suffixes[i].length) === suffixes[i]) {
            return true;
        }
    }
    return false;
}

}

onHide() {
   this.cleanupPreviewWindows();
   super.onHide();
}
}



/****************************************************************************
 * MAIN
 ****************************************************************************/
function main()
{
   CoreApplication.ensureMinimumVersion(1, 9, 4);
   Console.show();
   Console.criticalln("   ____    __  _   ___       __         \n  / __/__ / /_(_) / _ | ___ / /_______ ");
   Console.warningln(" _\\ \\/ -_) __/ / / __ |(_-</ __/ __/ _ \\ \n/___/\\__/\\__/_/ /_/ |_/__/\\__/_/  \\___/ \n                                         ");

   console.writeln(" Perfect Palette Picker by Franklin Marek");


   let D = new PerfectPalettePickerDialog();
   D.execute();  // Blocks until user closes the dialog (OK, Cancel, or X)

   // The dialog has been closed at this point.
   D.cleanupPreviewWindows(); // <--- Perform your cleanup now
}

main();
