/*
 * *****************************************************************************
 *
 * Constructor for the Foraxx Image
 * This dialog forms part of the ForaxxPalette.js
 * Version 1.0
 *
 * Copyright (C) 2023 Paul Hancock
 *
 * *****************************************************************************
 */

function ImageConstruction()
{
   if (ForaxxParameters.buttonLogic == "0" || ForaxxParameters.buttonLogic == "1")
   {

      var ha = ForaxxParameters.haView.id;
      var oiii = ForaxxParameters.oiiiView.id;
      var hoString = "(" + ha + "*" + oiii + ")^~(" + ha + "*" + oiii + ")";
      var rString = ha;
      var gString = "";
      var bString = oiii;
      var rString_stars = "";
      var gString_stars = "";
      var bString_stars = "";

      Console.writeln("Creating the 'HO' Dynamic PixelMath Factor ...");
      PixelMathConstructor(ForaxxParameters.haView, ForaxxParameters.hoFactorView, "gray", hoString, gString, bString);
      Console.noteln("'HO' Dynamic PixelMath Factor created...");

      if (ForaxxParameters.buttonLogic == "1")
      {
         gString = "(" + hoString + ")" + "*" + ha + "+ ~(" + hoString + ")" + "*" + oiii;
         Console.writeln("Creating the Foraxx Image ...");
         PixelMathConstructor(ForaxxParameters.haView, ForaxxParameters.foraxxView, "rgb", rString, gString, bString);
         Console.noteln("Foraxx Image created...")
         Console.writeln("Completing Curves Adjustments ...")
         CurvesAdjustments1();
         CurvesAdjustments2();
         SelectiveSaturationBoost();
         SelectiveSaturationBoost();
         Console.noteln("Curves Adjustments Complete...")
      }

      if (ForaxxParameters.buttonLogic == "0")
      {
         gString = "(" + hoString + ")" + "*" + ha + "+ ~(" + hoString + ")" + "*" + oiii;
         var ha_stars = ForaxxParameters.haStarsView.id;
         var oiii_stars = ForaxxParameters.oiiiStarsView.id;
         rString_stars = ha_stars;
         gString_stars = "(" + hoString + ")" + "*" + ha_stars + "+ ~(" + hoString + ")" + "*" + oiii_stars;
         bString_stars = oiii_stars;
         Console.writeln("Creating the Foraxx Image ...");
         PixelMathConstructor(ForaxxParameters.haView, ForaxxParameters.foraxxView, "rgb", rString, gString, bString);
         Console.noteln("Foraxx Image created...")
         Console.writeln("Completing Curves Adjustments ...")
         CurvesAdjustments1();
         CurvesAdjustments2();
         SelectiveSaturationBoost();
         SelectiveSaturationBoost();
         Console.noteln("Curves Adjustments Complete...")
         Console.writeln("Creating the Foraxx Stars ...");
         PixelMathConstructor(ForaxxParameters.haView, ForaxxParameters.foraxxView+"_stars", "rgb", rString_stars, gString_stars, bString_stars);
         Console.writeln("Completing Curves Adjustments on the Stars...")
         StarAdjustments();
      }

      Console.noteln("Script Complete ...");

   }
   else if (ForaxxParameters.buttonLogic == "2" || ForaxxParameters.buttonLogic == "3")
   {

      var ha = ForaxxParameters.haView.id;
      var oiii = ForaxxParameters.oiiiView.id;
      var sii = ForaxxParameters.siiView.id;

      var oString =  oiii + "^~" + oiii;
      var hoString = "(" + ha + "*" + oiii + ")^~(" + ha + "*" + oiii + ")";
      rString = "";
      gString = "";
      bString = oiii;
      var rString_stars = "";
      var gString_stars = "";
      var bString_stars = "";

      Console.writeln("Creating the 'O' Dynamic PixelMath Factor ...");
      PixelMathConstructor(ForaxxParameters.haView, ForaxxParameters.oFactorView, "gray", oString, gString, bString);
      Console.noteln("'O' Dynamic PixelMath Factor created...");
      Console.writeln("Creating the 'HO' Dynamic PixelMath Factor ...");
      PixelMathConstructor(ForaxxParameters.haView, ForaxxParameters.hoFactorView, "gray", hoString, gString, bString);
      Console.noteln("'HO' Dynamic PixelMath Factor created...");

      if (ForaxxParameters.buttonLogic == "3")
      {
         rString = "(" + oString + ")" + "*" + sii + "+ ~(" + oString + ")" + "*" + ha;
         gString = "(" + hoString + ")" + "*" + ha + "+ ~(" + hoString + ")" + "*" + oiii;
         Console.writeln("Creating the Foraxx Image ...");
         PixelMathConstructor(ForaxxParameters.haView, ForaxxParameters.foraxxView, "rgb", rString, gString, bString);
         Console.noteln("Foraxx Image created...")
         Console.writeln("Completing Curves Adjustments ...")
         CurvesAdjustments1();
         CurvesAdjustments2();
         SelectiveSaturationBoost();
         SelectiveSaturationBoost();
         Console.noteln("Curves Adjustments Complete...")
      }

      if (ForaxxParameters.buttonLogic == "2")
      {
         rString = "(" + oString + ")" + "*" + sii + "+ ~(" + oString + ")" + "*" + ha;
         gString = "(" + hoString + ")" + "*" + ha + "+ ~(" + hoString + ")" + "*" + oiii;
         var ha_stars = ForaxxParameters.haStarsView.id;
         var oiii_stars = ForaxxParameters.oiiiStarsView.id;
         var sii_stars = ForaxxParameters.siiStarsView.id;
         rString_stars = "(" + oString + ")" + "*" + sii_stars + "+ ~(" + oString + ")" + "*" + ha_stars;
         gString_stars = "(" + hoString + ")" + "*" + ha_stars + "+ ~(" + hoString + ")" + "*" + oiii_stars;
         bString_stars = oiii_stars;
         Console.writeln("Creating the Foraxx Image ...");
         PixelMathConstructor(ForaxxParameters.haView, ForaxxParameters.foraxxView, "rgb", rString, gString, bString);
         Console.noteln("Foraxx Image created...")
         Console.writeln("Completing Curves Adjustments ...")
         CurvesAdjustments1();
         CurvesAdjustments2();
         SelectiveSaturationBoost();
         SelectiveSaturationBoost();
         Console.noteln("Curves Adjustments Complete...")
         Console.writeln("Creating the Foraxx Stars ...");
         PixelMathConstructor(ForaxxParameters.haView, ForaxxParameters.foraxxView+"_stars", "rgb", rString_stars, gString_stars, bString_stars);
         Console.writeln("Completing Curves Adjustments on the Stars...")
         StarAdjustments();
      }
      Console.noteln("Script Complete ...");
   }
}

//function ImageConstructor(sii, ha, oiii) {
function ImageConstructor() {
   ha = ForaxxParameters.haView.id;
   oiii = ForaxxParameters.oiiiView.id;
   var oString =  oiii + "^~" + oiii;
   var hoString = "(" + ha + "*" + oiii + ")^~(" + ha + "*" + oiii + ")";
   var rString = "";
   var gString = "";
   var bString = "";
   var rString_stars = "";
   var gString_stars = "";
   var bString_stars = "";
   //var combine_string = "~(~" + View.viewById("Foraxx") + "*" + View.viewById("Foraxx_stars") + ") - " + View.viewById("Foraxx") + "*" + View.viewById("Foraxx_stars");

   if (ForaxxParameters.twoChannels == true)
   {
      rString = ha;
      gString = "(" + hoString + ")" + "*" + ha + "+ ~(" + hoString + ")" + "*" + oiii;
      bString = oiii;
      if (!ForaxxParameters.onlyForaxx)
      {
         ha_stars = ForaxxParameters.haStarsView.id;
         oiii_stars = ForaxxParameters.oiiiStarsView.id;
         rString_stars = ha_stars;
         gString_stars = "(" + hoString + ")" + "*" + ha_stars + "+ ~(" + hoString + ")" + "*" + oiii_stars;
         bString_stars = oiii_stars;
      }
   }
   else
   {
      sii = ForaxxParameters.siiView.id;
      rString = "(" + oString + ")" + "*" + sii + "+ ~(" + oString + ")" + "*" + ha;
      gString = "(" + hoString + ")" + "*" + ha + "+ ~(" + hoString + ")" + "*" + oiii;
      bString = oiii;
      if (!ForaxxParameters.onlyForaxx)
      {
         ha_stars = ForaxxParameters.haStarsView.id;
         oiii_stars = ForaxxParameters.oiiiStarsView.id;
         sii_stars = ForaxxParameters.siiStarsView.id;
         rString_stars = "(" + oString + ")" + "*" + sii_stars + "+ ~(" + oString + ")" + "*" + ha_stars;
         gString_stars = "(" + hoString + ")" + "*" + ha_stars + "+ ~(" + hoString + ")" + "*" + oiii_stars;
         bString_stars = oiii_stars;
      }
      Console.writeln("Creating the 'O' Dynamic PixelMath Factor ...");
      PixelMathConstructor(ForaxxParameters.haView, ForaxxParameters.oFactorView, "gray", oString, gString, bString);
      Console.noteln("'O' Dynamic PixelMath Factor created...");
   }
   Console.writeln("Creating the 'HO' Dynamic PixelMath Factor ...");
   PixelMathConstructor(ForaxxParameters.haView, ForaxxParameters.hoFactorView, "gray", hoString, gString, bString);
   gString = "(" + hoString + ")" + "*" + ha + "+ ~(" + hoString + ")" + "*" + oiii;
   if (!ForaxxParameters.onlyForaxx)
   {
      gString_stars = "(" + hoString + ")" + "*" + ha_stars + "+ ~(" + hoString + ")" + "*" + oiii_stars;
   }
   Console.noteln("'HO' Dynamic PixelMath Factor created...");
   Console.writeln("Creating the Foraxx Image ...");
   PixelMathConstructor(ForaxxParameters.haView, ForaxxParameters.foraxxView, "rgb", rString, gString, bString);
   Console.noteln("Foraxx Image created...")
   Console.writeln("Completing Curves Adjustments ...")
   CurvesAdjustments1();
   CurvesAdjustments2();
   SelectiveSaturationBoost();
   SelectiveSaturationBoost();
   Console.noteln("Curves Adjustments Complete...")
   if (!ForaxxParameters.onlyForaxx)
   {
      Console.writeln("Creating the Foraxx Stars ...");
      PixelMathConstructor(ForaxxParameters.haView, ForaxxParameters.foraxxView+"_stars", "rgb", rString_stars, gString_stars, bString_stars);
      Console.writeln("Completing Curves Adjustments on the Stars...")
      StarAdjustments();
   }
   Console.noteln("Script Complete ...");
}
