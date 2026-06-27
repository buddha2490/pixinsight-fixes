/*
 * *****************************************************************************
 *
 * PixelMath Expressions to create Foraxx Image
 * This dialog forms part of the ForaxxPalette.js
 * Version 1.0
 *
 * Copyright (C) 2023 Paul Hancock
 *
 * *****************************************************************************
 */

function PixelMathConstructor(baseimage,newid,type,r,g,b) {
   var P = new PixelMath;
   P.expression = r;
   P.expression1 = g;
   P.expression2 = b;
   P.expression3 = "";
   P.symbols = "";
   P.clearImageCacheAndExit = false;
   P.cacheGeneratedImages = false;
   P.generateOutput = true;
   P.singleThreaded = false;
   P.optimization = true;
   P.use64BitWorkingImage = false;
   P.rescale = false;
   P.rescaleLower = 0;
   P.rescaleUpper = 1;
   P.truncate = true;
   P.truncateLower = 0;
   P.truncateUpper = 1;
   P.createNewImage = true;
   P.showNewImage = true;
   P.newImageId = newid;
   P.newImageWidth = 0;
   P.newImageHeight = 0;
   P.newImageAlpha = false;
   if (type == "rgb") {
       P.newImageColorSpace = PixelMath.RGB;
       P.useSingleExpression = false;
   } else {
       P.newImageColorSpace = PixelMath.Gray;
       P.useSingleExpression = true;
   }
   P.newImageSampleFormat = PixelMath.SameAsTarget;
   P.executeOn(baseimage);
}
