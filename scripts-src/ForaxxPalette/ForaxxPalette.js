#engine v8
/*
 ****************************************************************************
 * Foraxx Palette Utility
 *
 * ForaxxPalette.js
 * Copyright (C) 2024, Paul Hancock
 *
 * This script provides an environment within which to create a Foraxx Palette
 * image. The script expects stretched starless images along with stretched
 * images of the stars.
 *
 * If you have gathered Sii, Ha and Oiii data then simply provide the script
 * with the corresponding stretched starless and star images in the drop
 * down menus.
 *
 * If you have only gathered Ha and Oiii (eihter via mono imaging or OSC with
 * a dual narrowband filter), then provide the script with the starless Ha and Oiii
 * along with the corresponding starless images, leaving the Sii drop down menus
 * blank.
 *
 * The script will produce the relevant dynamic pixelmath intermediary images. It will
 * then run the appropriate Foraxx expressions depending on the number of filters used.
 *
 * Once Complete, you will have a final Foraxx image along with the colour stars image,
 * named Foraxx and Foraxx_stars respectively.
 *
 * This product is based on software from the PixInsight project, developed
 * by Pleiades Astrophoto and its contributors (https://pixinsight.com/).
 *
 * Version history
 * 1.0     2023-01-13 first release v1 (Didn't go so well).
 * 1.01    2023-01-14 Hopefully fixed the web host bugs.
 * 1.15    2023-08-19 PI 1.8.9-2 ready.
 * 1.16    2024-12-23 PI 1.9 ready.

 ****************************************************************************
 */

#feature-id    ForaxxPalette : Pixinsight-Fixes > ForaxxPaletteUtility

#feature-info  This script provides an environment within which to create a Foraxx Palette \
image. The script expects stretched starless SHO images along with stretched images of the stars.<br/>\
Copyright &copy; 2024 Paul Hancock.

#define TITLE "Foraxx Palette Utility"
#define VERSION "1.15"
#define BUILD "202412230651"

// #include <pjsr/Sizer.jsh>        // native in V8
// #include <pjsr/NumericControl.jsh> // native in V8
#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>

#include "lib/DialogForaxxMain.js"
#include "lib/CheckForExistingDynamicExpressions.js"
#include "lib/CheckForCompleteness.js"


/*******************************************************************************
 *******************************************************************************
 *
 * Global Parameters for the Foraxx Script
 *
 * *****************************************************************************
 * ****************************************************************************/

var ForaxxParameters = {
   siiView: undefined,
   siiStarsView: undefined,
   haView: undefined,
   haStarsView: undefined,
   oiiiView: undefined,
   oiiiStarsView: undefined,
   oFactorView: "o",
   hoFactorView: "ho",
   foraxxView: "Foraxx",
   twoChannels: false,
   onlyForaxx: false,
   buttonLogic: undefined,
   okToRun: false
}

/*******************************************************************************
 * *****************************************************************************
 *
 * FUNCTION MAIN
 *
 * Script entry point
 *
 * *****************************************************************************
 *******************************************************************************/

function main() {

   // hide the console
   Console.hide();

/*******************************************************************************
 * View context
 *******************************************************************************/
   if (Parameters.isViewTarget) {
      let warnMessage = "Script cannot execute in View context";
      let msgReturn = (new MessageBox( warnMessage, "Warning", StdIcon_Warning, StdButton_Ok )).execute();
      return;
   }

/*******************************************************************************
 * Global context
 *******************************************************************************/
   if (Parameters.isGlobalTarget) {
      let warnMessage = "Script cannot execute in global context";
      let msgReturn = (new MessageBox( warnMessage, "Warning", StdIcon_Warning, StdButton_Ok )).execute();
      return;
   }

/*******************************************************************************
 * Direct context
 *******************************************************************************/
   jsAutoGC = true;  // let PJSR handle automatic garbage collection - small performance hit is worth it as there could be lots of garbage produced by this script!
   let dialog = new ForaxxDialog;
   let dialogReturn = dialog.execute();

   if (dialogReturn == 1) {
      checkForCompleteness();
      if (ForaxxParameters.okToRun == true)
      {
         //Perform the Foraxx Palette Construction
         updateFileNames();
         ImageConstruction();
         //ImageConstructor(ForaxxParameters.siiView,ForaxxParameters.haView,ForaxxParameters.oiiiView);
      }
   } else {
      //The Dialog was cancelled
   }

   //dialog.previewTimer.stop();   //belt and braces - should be stopped in the dialog onHide event handler but no harm to catch here as well

   Console.writeln("Goodbye from ForaxxPalette");
  //Console.hide();
}

main();
