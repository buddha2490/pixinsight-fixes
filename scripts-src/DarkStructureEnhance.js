#engine v8
/*
   DarkStructureEnhance v1.1

   A script for enhancement of dark structures.

   Copyright (C) 2009 Carlos Sonnenstein (PTeam) & Oriol Lehmkuhl (PTeam)

   This program is free software: you can redistribute it and/or modify it
   under the terms of the GNU General Public License as published by the
   Free Software Foundation, version 3 of the License.

   This program is distributed in the hope that it will be useful, but WITHOUT
   ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
   FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License for
   more details.

   You should have received a copy of the GNU General Public License along with
   this program.  If not, see <http://www.gnu.org/licenses/>.
*/

// #include <pjsr/Sizer.jsh>        // native in V8
#include <pjsr/FrameStyle.jsh>
#include <pjsr/TextAlign.jsh>
#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/UndoFlag.jsh>
#include <pjsr/ColorSpace.jsh>
// #include <pjsr/NumericControl.jsh> // native in V8

#feature-id    Pixinsight-Fixes > DarkStructureEnhance

#feature-info  A script for enhancement of dark structures.<br/>\
   <br/>\
   Based on an original algorithm created by Carlos Sonnenstein (PTeam). \
   JavaScript/PixInsight implementation by Oriol Lehmkuhl (PTeam).<br/> \
   <br/> \
   Copyright &copy; 2009 Carlos Sonnenstein (PTeam) & Oriol Lehmkuhl (PTeam)

#feature-icon  DarkStructureEnhance.xpm

#define nStarMask 6

#define VERSION "1.1"

#define TITLE "DarkStructureEnhance Script"

function ScalingFunction( kernel, name , size )
{
    this.kernel = kernel;
    this.name = name;
    this.size = size;
}

var window = ImageWindow.activeWindow;

var scalingFunctions = new Array;

scalingFunctions[0] = new ScalingFunction(
   [ 0.29289322, 0.5, 0.29289322,
     0.5,        1.0, 0.5,
     0.29289322, 0.5, 0.29289322 ],
   "3x3 Linear Interpolation", 3 );

scalingFunctions[1] = new ScalingFunction(
   [ 1/256, 1/64, 3/128, 1/64, 1/256,
     1/64,  1/16, 3/32,  1/16, 1/64,
     3/128, 3/32, 9/64,  3/32, 3/128,
     1/64,  1/16, 3/32,  1/16, 1/64,
     1/256, 1/64, 3/128, 1/64, 1/256 ],
   "5x5 B3 Spline", 5 );

function doAuxiliarImage(data) {

    var view = data.targetView;
    var mask = new ImageWindow(view.image.width,
            view.image.height,
            view.image.numberOfChannels,
            window.bitsPerSample,
            window.isFloatSample,
            view.image.colorSpace != ColorSpace_Gray,
            "Mask");
    var maskView = mask.mainView;

    // copy data
    maskView.beginProcess(UndoFlag_NoSwapFile);
    maskView.image.apply(view.image);
    maskView.endProcess();

    // do awt

    var auxLayers = new Array(nStarMask);
    for(var i=0;i<nStarMask;++i) {
        auxLayers[i] = [true, true, 1.00, 3.00, 0.000, false, 0, 0.50, 2, 5, false, true, 1.0, 0.02000];
    }
    auxLayers[nStarMask] = [false, true, 1.00, 3.00, 0.000, false, 0, 0.50, 2, 5, false, false, 0.50, 0.02000];

    var wavlets = new ATrousWaveletTransformV1;
    wavlets.version = 257;
    wavlets.layers = auxLayers;
    wavlets.scaleDelta = 0;
    wavlets.scalingFunctionData = scalingFunctions[data.scalingFunction].kernel;
    wavlets.scalingFunctionKernelSize = scalingFunctions[data.scalingFunction].size;
    wavlets.scalingFunctionName = scalingFunctions[data.scalingFunction].name;
    wavlets.largeScaleFunction = ATrousWaveletTransformV1.NoFunction;
    wavlets.curveBreakPoint = 0.75;
    wavlets.noiseThresholdingAmount = 0.00;
    wavlets.noiseThreshold = 3.00;
    wavlets.lowRange = 0.000;
    wavlets.highRange = 0.000;
    wavlets.previewMode = ATrousWaveletTransformV1.Disabled;
    wavlets.previewLayer = 0;
    wavlets.toLuminance = true;
    wavlets.toChrominance = true;
    wavlets.linear = false;
    wavlets.executeOn(maskView, false/*swapFile*/ );

    return mask;
}

function doMask( data ) {
    var view = data.targetView;
    var mask = new ImageWindow(view.image.width,
            view.image.height,
            view.image.numberOfChannels,
            window.bitsPerSample,
            window.isFloatSample,
            view.image.colorSpace != ColorSpace_Gray,
            "Mask");
    var maskView = mask.mainView;

    // copy data
    maskView.beginProcess(UndoFlag_NoSwapFile);
    maskView.image.apply(view.image);
    maskView.endProcess();

    // RBGWorking space

    var rgb = new RGBWorkingSpace;
    rgb.channels = [
        [0.333333, 0.648431, 0.330856],
        [0.333333, 0.321152, 0.597871],
        [0.333333, 0.155886, 0.066044]];
    rgb.gamma = 2.20;
    rgb.sRGBGamma = true;
    rgb.applyGlobalRGBWS = false;
    rgb.executeOn(maskView, false/*swapFile*/ );

    // Anti deringing: Carlos Paranoia :D

    var auxMask = doAuxiliarImage(data);

    var pm = new PixelMath;

    var id = auxMask.mainView.id;

    pm.expression = "$T -"+id;
    pm.useSingleExpression = true;
    pm.use64BitWorkingImage = false;
    pm.rescale = false;
    pm.rescaleLower = 0.0000000000;
    pm.rescaleUpper = 1.0000000000;
    pm.truncate = true;
    pm.truncateLower = 0.0000000000;
    pm.truncateUpper = 1.0000000000;
    pm.createNewImage = false;

    pm.executeOn( maskView, false/*swapFile*/ );

    //auxMask.show();

    auxMask.forceClose();

    // wavlets

    var auxLayers = new Array(data.numberOfLayers);
    for(var i=0;i<data.numberOfLayers;++i) {
        auxLayers[i] = [false, true, 1.00, 3.00, 0.000, false, 0, 0.50, 2, 5, false, false, 0.50, 0.02000];
    }
    auxLayers[data.numberOfLayers] = [true, true, 1.00, 3.00, 0.000, false, 0, 0.50, 2, 5, false, false, 0.50, 0.02000];

    var wavlets = new ATrousWaveletTransformV1;
    wavlets.version = 257;
    wavlets.layers = auxLayers;
    wavlets.scaleDelta = 0;
    wavlets.scalingFunctionData = scalingFunctions[data.scalingFunction].kernel;
    wavlets.scalingFunctionKernelSize = scalingFunctions[data.scalingFunction].size;
    wavlets.scalingFunctionName = scalingFunctions[data.scalingFunction].name;
    wavlets.largeScaleFunction = ATrousWaveletTransformV1.NoFunction;
    wavlets.curveBreakPoint = 0.75;
    wavlets.noiseThresholdingAmount = 0.00;
    wavlets.noiseThreshold = 3.00;
    wavlets.lowRange = 0.000;
    wavlets.highRange = 0.000;
    wavlets.previewMode = ATrousWaveletTransformV1.Disabled;
    wavlets.previewLayer = 0;
    wavlets.toLuminance = true;
    wavlets.toChrominance = true;
    wavlets.linear = false;
    wavlets.executeOn( maskView, false/*swapFile*/ );

    // Pixel Math

    var pm = new PixelMath;
    pm.expression = maskView.id+"-"+view.id;
    pm.expression1 = "";
    pm.expression2 = "";
    pm.useSingleExpression = true;
    pm.symbols = "";
    pm.use64BitWorkingImage = false;
    pm.rescale = false;
    pm.rescaleLower = 0.0000000000;
    pm.rescaleUpper = 1.0000000000;
    pm.truncate = true;
    pm.truncateLower = 0.0000000000;
    pm.truncateUpper = 1.0000000000;
    pm.createNewImage = false;
    pm.newImageId = "";
    pm.newImageWidth = 0;
    pm.newImageHeight = 0;
    pm.newImageColorSpace = PixelMath.SameAsTarget;
    pm.newImageSampleFormat = PixelMath.SameAsTarget;
    pm.executeOn( maskView, false/*swapFile*/ );

    // Convert to gray

    if(view.image.colorSpace != ColorSpace_Gray) {
        var toGray = new ConvertToGrayscale;
        toGray.executeOn( maskView, false/*swapFile*/ );
    }

    // Rescale

    var rescale = new Rescale;
    rescale.mode = Rescale.RGBK;
    rescale.executeOn( maskView, false/*swapFile*/ );

    // Noise reduction

    var nr = new ATrousWaveletTransformV1;
    var Recursive = ATrousWaveletTransformV1.Recursive;
    nr.version = 257;
    nr.layers = [
        [false, true, 1.00, 3.00, 0.000, false, Recursive, 1.00, 5, 5, false, false, 0.50, 0.02000],
        [true, true, 1.00, 3.00, 0.000, true, Recursive, 1.00, 5, 5, false, false, 0.50, 0.02000],
        [true, true, 1.00, 3.00, 0.000, false, Recursive, 0.50, 2, 5, false, false, 0.50, 0.02000]];
    nr.scaleDelta = 0;
    nr.scalingFunctionData = [
        0.292893,0.5,0.292893,
        0.5,1,0.5,
        0.292893,0.5,0.292893];
    nr.scalingFunctionKernelSize = 3;
    nr.scalingFunctionName = "3x3 Linear Interpolation";
    nr.largeScaleFunction = ATrousWaveletTransformV1.NoFunction;
    nr.toLuminance = true;
    nr.toChrominance = false;
    nr.linear = false;
    nr.executeOn( maskView, false/*swapFile*/ );

    return mask;
}

function doDark(data) {
    var hist = new HistogramTransformation;

    hist.H = [
        [0, 0.5,        1, 0, 1], // R
        [0, 0.5,        1, 0, 1], // G
        [0, 0.5,        1, 0, 1], // B
        [0, data.median,1, 0, 1], // RGB
        [0, 0.5,        1, 0, 1], // Alpha
        ];

    var mask = doMask(data);

    var pc = new ProcessContainer;

    for(var i=0;i<data.iterations;++i) {
        pc.add(hist);
        pc.setMask(i,mask,false/*invert*/);
    }

    data.targetView.beginProcess();
    pc.executeOn( data.targetView, false/*swapFile*/ );
    data.targetView.endProcess();

   mask.removeMaskReferences();

   if ( data.viewMask )
      mask.show();
   else
      mask.forceClose();
}

function DarkMaskLayersData()
{
    this.targetView = window.currentView;
    this.numberOfLayers = 8;
    this.scalingFunction = 1;
    this.extractResidual = true;
    this.toLumi = false;
    this.median = 0.7;
    this.iterations = 1;
    this.viewMask = false;
}

var data = new DarkMaskLayersData;

class DarkMaskLayersDialog extends Dialog {
   constructor() {
   super();

   var emWidth = this.font.width( 'M' );
   var labelWidth1 = this.font.width( "Layers to remove:" + 'T' );

   //

   this.helpLabel = new Label( this );
   this.helpLabel.frameStyle = FrameStyle_Box;
   this.helpLabel.margin = 4;
   this.helpLabel.wordWrapping = true;
   this.helpLabel.useRichText = true;
   this.helpLabel.text =
      "<p><b>DarkStructureEnhance v" + VERSION + "</b> &mdash; A script for "
      + "enhancement of dark image structures.</p>"
      + "<p>The script can also provide the mask used in the DSE process. To include "
      + "larger structures in the mask, increase the number of layers to remove. "
      + "To increase enhancement of dark structures, increase the value of the "
      + "<i>Amount</i> parameter.</p>"
      + "<p>Copyright &copy; 2009 Carlos Sonnenstein and Oriol Lehmkuhl (Pteam)</p>";

   this.targetImage_Label = new Label( this );
   this.targetImage_Label.minWidth = labelWidth1 + this.logicalPixelsToPhysical( 6+1 ); // align with labels inside group boxes below
   this.targetImage_Label.text = "Target image:";
   this.targetImage_Label.textAlignment = TextAlign_Right|TextAlign_VertCenter;

   this.targetImage_ViewList = new ViewList( this );
   this.targetImage_ViewList.scaledMinWidth = 200;
   this.targetImage_ViewList.getAll(); // include main views as well as previews
   this.targetImage_ViewList.currentView = data.targetView;
   this.targetImage_ViewList.toolTip = "Select the image to perform the Dark Structure Enhancement.";
   this.targetImage_ViewList.onViewSelected = function( view )
   {
      data.targetView = view;
   };

   this.targetImage_Sizer = new HorizontalSizer;
   this.targetImage_Sizer.spacing = 4;
   this.targetImage_Sizer.add( this.targetImage_Label );
   this.targetImage_Sizer.add( this.targetImage_ViewList, 100 );

   // Dark Mask parameters
   this.numberOfLayers_Label = new Label( this );
   this.numberOfLayers_Label.minWidth = labelWidth1;
   this.numberOfLayers_Label.text = "Layers to remove:";
   this.numberOfLayers_Label.textAlignment = TextAlign_Right|TextAlign_VertCenter;

   this.numberOfLayers_SpinBox = new SpinBox( this );
   this.numberOfLayers_SpinBox.minValue = 7;
   this.numberOfLayers_SpinBox.maxValue = 12;
   this.numberOfLayers_SpinBox.value = data.numberOfLayers;
   this.numberOfLayers_SpinBox.toolTip = this.numberOfLayers_Label.toolTip =
      "<b>Number of wavelet layers that will be removed to build an enhancement mask.</b>";
   this.numberOfLayers_SpinBox.onValueUpdated = function( value )
   {
      data.numberOfLayers = value;
   };

   this.extractResidual_CheckBox = new CheckBox( this );
   this.extractResidual_CheckBox.text = "Extract mask";
   this.extractResidual_CheckBox.checked = data.viewMask;
   this.extractResidual_CheckBox.toolTip =
      "<p>If this option is selected, the script will create an image window "
      + "with the mask used to perform dark structure enhancement.</p>";
   this.extractResidual_CheckBox.onCheck = function( checked )
   {
      data.viewMask = checked;
   };

   this.numberOfLayers_Sizer = new HorizontalSizer;
   this.numberOfLayers_Sizer.spacing = 4;
   this.numberOfLayers_Sizer.add( this.numberOfLayers_Label );
   this.numberOfLayers_Sizer.add( this.numberOfLayers_SpinBox );
   this.numberOfLayers_Sizer.addSpacing( 12 );
   this.numberOfLayers_Sizer.add( this.extractResidual_CheckBox );
   this.numberOfLayers_Sizer.addStretch();

   this.scalingFunction_Label = new Label( this );
   this.scalingFunction_Label.minWidth = labelWidth1;
   this.scalingFunction_Label.text = "Scaling function:";
   this.scalingFunction_Label.textAlignment = TextAlign_Right|TextAlign_VertCenter;

   this.scalingFunction_ComboBox = new ComboBox( this );
   for ( var i = 0; i < scalingFunctions.length; ++i )
      this.scalingFunction_ComboBox.addItem( scalingFunctions[i].name );
   this.scalingFunction_ComboBox.currentItem = data.scalingFunction;
   this.scalingFunction_ComboBox.toolTip = this.scalingFunction_Label.toolTip =
      "<p>Select a scaling function to perform the wavelet decomposition.</p>";
   this.scalingFunction_ComboBox.onItemSelected = function( index )
   {
      data.scalingFunction = index;
   };

   this.scalingFunction_Sizer = new HorizontalSizer;
   this.scalingFunction_Sizer.spacing = 4;
   this.scalingFunction_Sizer.add( this.scalingFunction_Label );
   this.scalingFunction_Sizer.add( this.scalingFunction_ComboBox );
   this.scalingFunction_Sizer.addStretch();

   this.dmParGroupBox = new GroupBox( this );
   this.dmParGroupBox.title = "Mask Parameters";
   this.dmParGroupBox.sizer = new VerticalSizer;
   this.dmParGroupBox.sizer.margin = 6;
   this.dmParGroupBox.sizer.spacing = 4;
   this.dmParGroupBox.sizer.add( this.numberOfLayers_Sizer );
   this.dmParGroupBox.sizer.add( this.scalingFunction_Sizer );

   // DSE parameters
   this.median_NC = new NumericControl (this);
   this.median_NC.label.text = "Amount:";
   this.median_NC.label.minWidth = labelWidth1;
   this.median_NC.setRange (0.0, 0.99);
   this.median_NC.slider.setRange (0, 1000);
   this.median_NC.slider.scaledMinWidth = 250;
   this.median_NC.setPrecision (2);
   this.median_NC.setValue ((data.median-0.5)*2);
   this.median_NC.toolTip = "<p>DSE intensity for each iteration.</p>";
   this.median_NC.onValueUpdated = function (value) { data.median = (0.5*value)+0.5; };

   this.iter_Label = new Label( this );
   this.iter_Label.minWidth = labelWidth1;
   this.iter_Label.text = "Iterations:";
   this.iter_Label.textAlignment = TextAlign_Right|TextAlign_VertCenter;

   this.iter_SpinBox = new SpinBox( this );
   this.iter_SpinBox.minValue = 1;
   this.iter_SpinBox.maxValue = 10;
   this.iter_SpinBox.value = data.iterations;
   this.iter_SpinBox.toolTip = "<p>Number of midtones balance transformations.</p>";
   this.iter_SpinBox.onValueUpdated = function( value )
   {
      data.iterations = value;
   };

   this.iter_Sizer = new HorizontalSizer;
   this.iter_Sizer.spacing = 4;
   this.iter_Sizer.add( this.iter_Label );
   this.iter_Sizer.add( this.iter_SpinBox );
   this.iter_Sizer.addStretch();

   this.dseParGroupBox = new GroupBox( this );
   this.dseParGroupBox.title = "DSE Parameters";
   this.dseParGroupBox.sizer = new VerticalSizer;
   this.dseParGroupBox.sizer.margin = 6;
   this.dseParGroupBox.sizer.spacing = 4;
   this.dseParGroupBox.sizer.add( this.median_NC );
   this.dseParGroupBox.sizer.add( this.iter_Sizer );

    // usual control buttons
    this.ok_Button = new PushButton( this );
    this.ok_Button.text = "OK";
    this.ok_Button.icon = this.scaledResource( ":/icons/ok.png" );
    this.ok_Button.onClick = function()
    {
        this.dialog.ok();
    };

    this.cancel_Button = new PushButton( this );
    this.cancel_Button.text = "Cancel";
    this.cancel_Button.icon = this.scaledResource( ":/icons/cancel.png" );
    this.cancel_Button.onClick = function()
    {
        this.dialog.cancel();
    };

    this.buttons_Sizer = new HorizontalSizer;
    this.buttons_Sizer.spacing = 4;
    this.buttons_Sizer.addStretch();
    this.buttons_Sizer.add( this.ok_Button );
    this.buttons_Sizer.add( this.cancel_Button );

    this.sizer = new VerticalSizer;
    this.sizer.margin = 8;
    this.sizer.spacing = 6;
    this.sizer.add( this.helpLabel );
    this.sizer.addSpacing( 4 );
    this.sizer.add( this.targetImage_Sizer );
    this.sizer.add( this.dmParGroupBox);
    this.sizer.add( this.dseParGroupBox);
    this.sizer.addSpacing( 4 );
    this.sizer.add( this.buttons_Sizer );

    this.windowTitle = TITLE;
    this.adjustToContents();
    this.setFixedSize();
}
}

/*
 * Script entry point.
 */
function main()
{
   console.hide();

   if ( !data.targetView )
   {
      var msg = new MessageBox( "There is no active image window!",
                                "DarkMaskLayers Script",
                                StdIcon_Error, StdButton_Ok );
      msg.execute();
      return;
   }

   var dialog = new DarkMaskLayersDialog();
   for ( ;; )
   {
      if ( !dialog.execute() )
         break;

      // A view must be selected.
      if ( data.targetView.isNull )
      {
         var msg = new MessageBox( "You must select a view to apply this script.",
                                   "DarkMaskLayers Script", StdIcon_Error, StdButton_Ok );
         msg.execute();
         continue;
      }

      console.show();
      doDark( data );
      break;
   }
}

main();
