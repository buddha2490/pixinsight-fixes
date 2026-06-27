/* *****************************************************************************
 *
 * Curves Adjustments on the Foraxx Image
 * This dialog forms part of the ForaxxPalette.js
 * Version 1.0
 *
 * Copyright (C) 2023 Paul Hancock
 *
 * *****************************************************************************
 */

function CurvesAdjustments1() {
   var P = new CurvesTransformation;

   P.ct = CurvesTransformation.AkimaSubsplines;
   P.H = [ // x, y
      [0.00000, 0.00000],
      [0.02517, 0.05952],
      [0.07323, 0.08571],
      [0.11442, 0.13810],
      [0.62014, 0.67619],
      [1.00000, 1.00000]
   ];
   P.Ht = CurvesTransformation.AkimaSubsplines;
   P.S = [ // x, y
      [0.00000, 0.00000],
      [0.50801, 0.61667],
      [1.00000, 1.00000]
   ];
   P.St = CurvesTransformation.AkimaSubsplines;

   P.executeOn(View.viewById(ForaxxParameters.foraxxView));
}

function CurvesAdjustments2() {
   var P = new CurvesTransformation;

   P.H = [ // x, y
      [0.00000, 0.00000],
      [0.05034, 0.03571],
      [0.08238, 0.10238],
      [0.24943, 0.25000],
      [1.00000, 1.00000]
   ];
   P.Ht = CurvesTransformation.AkimaSubsplines;

   P.executeOn(View.viewById(ForaxxParameters.foraxxView));
}

function SelectiveSaturationBoost() {
   var P = new ColorSaturation;
   P.HS = [ // x, y
      [0.00000, 0.00000],
      [0.04910, 0.00909],
      [0.07235, 0.00909],
      [0.10594, 0.15455],
      [0.19380, 0.00909],
      [0.37726, 0.00000],
      [0.52972, 0.00909],
      [0.60465, 0.13636],
      [0.68475, -0.00909],
      [0.84496, 0.00000], // row 10
      [1.00000, 0.00000]
   ];
   P.HSt = ColorSaturation.AkimaSubsplines;
   P.hueShift = 0.000;
   P.executeOn(View.viewById(ForaxxParameters.foraxxView));
}

function StarAdjustments() {
   var P = new CurvesTransformation;

   P.H = [ // x, y
      [0.00000, 0.05476],
      [0.12815, 0.12857],
      [0.24943, 0.24524],
      [0.37300, 0.37857],
      [0.49886, 0.60000],
      [0.62471, 0.62619],
      [0.75057, 0.74048],
      [0.87872, 0.87381],
      [1.00000, 1.00000]
      ];
      P.Ht = CurvesTransformation.AkimaSubsplines;

      P.executeOn(View.viewById(ForaxxParameters.foraxxView+"_stars"));
}
