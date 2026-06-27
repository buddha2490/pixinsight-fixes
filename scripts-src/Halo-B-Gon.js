#engine v8
#feature-id Halo-B-Gon : Pixinsight-Fixes > Halo-B-Gon
#feature-icon  halo.svg
#feature-info This script is used to reduce the halo around stars.

/******************************************************************************
 *######################################################################
 *#        ___     __      ___       __                                #
 *#       / __/___/ /__   / _ | ___ / /________                        #
 *#      _\ \/ -_) _ _   / __ |(_-</ __/ __/ _ \                       #
 *#     /___/\__/_//_/  /_/ |_/___/\__/_/  \___/                       #
 *#                                                                    #
 *######################################################################
 *
 * Halo-B-Gon
 * Version: 2.1
 * Author: Franklin Marek
 * Website: www.setiastro.com
 *
 * This script is used to reduce the halo around stars.
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
 * COPYRIGHT © 2024 Franklin Marek. ALL RIGHTS RESERVED.
 ******************************************************************************/
// #include <pjsr/Sizer.jsh>        // native in V8
#include <pjsr/FrameStyle.jsh>
#include <pjsr/TextAlign.jsh>
#include <pjsr/UndoFlag.jsh>
#include <pjsr/ImageOp.jsh>

#define TITLE "Halo-B-Gon"
#define VERSION "2.1"
let WIDTH = 500;

var scriptParameters = {
    newInstance: function() {
        console.writeln("New instance created.");
    }
};

// Create lightness mask from the image using ConvertToGrayscale
function createLightnessMask(selectedImage) {
    try {
        let lightnessMask = new ImageWindow(selectedImage.mainView.image.width, selectedImage.mainView.image.height, 1, 32, true, false);
        lightnessMask.mainView.beginProcess(UndoFlag_NoSwapFile);
        lightnessMask.mainView.image.assign(selectedImage.mainView.image);
        lightnessMask.mainView.endProcess();

        // Check if the image is grayscale
        if (selectedImage.mainView.image.numberOfChannels > 1) {
            var P = new ConvertToGrayscale;
            P.executeOn(lightnessMask.mainView);
        }

        // Apply Unsharp Mask to the lightness mask
        var P = new UnsharpMask;
        P.sigma = 2.00;
        P.amount = 0.66;
        P.useLuminance = true;
        P.linear = false;
        P.deringing = false;
        P.deringingDark = 0.1000;
        P.deringingBright = 0.0000;
        P.outputDeringingMaps = false;
        P.rangeLow = 0.0000000;
        P.rangeHigh = 0.0000000;
        P.executeOn(lightnessMask.mainView);

        return lightnessMask;
    } catch (e) {
        console.criticalln("Error while creating lightness mask: " + e.message);
        console.flush();
        return null;
    }
}

// Duplicate an image
function createDuplicateImage(original) {
    try {
        let duplicateMask = new ImageWindow(original.mainView.image.width, original.mainView.image.height, 1, 32, true, false);
        duplicateMask.mainView.beginProcess(UndoFlag_NoSwapFile);
        duplicateMask.mainView.image.assign(original.mainView.image);
        duplicateMask.mainView.endProcess();
        return duplicateMask;
    } catch (e) {
        console.criticalln("Error while duplicating image: " + e.message);
        console.flush();
        return null;
    }
}

// Apply MultiscaleMedianTransformation to the image
function applyMMT(image) {
    try {
        var P = new MultiscaleMedianTransform;
        P.layers = [ // enabled, biasEnabled, bias, noiseReductionEnabled, noiseReductionThreshold, noiseReductionAmount, noiseReductionAdaptive
            [true, true, 0.000, false, 1.0000, 1.00, 0.0000],
            [true, true, 0.000, false, 1.0000, 1.00, 0.0000],
            [true, true, 0.000, false, 1.0000, 1.00, 0.0000],
            [false, true, 0.000, false, 1.0000, 1.00, 0.0000],
            [false, true, 0.000, false, 1.0000, 1.00, 0.0000],
            [false, true, 0.000, false, 1.0000, 1.00, 0.0000],
            [false, true, 0.000, false, 1.0000, 1.00, 0.0000]
        ];
        P.transform = MultiscaleMedianTransform.MultiscaleMedianTransform;
        P.medianWaveletThreshold = 5.00;
        P.scaleDelta = 0;
        P.linearMask = false;
        P.linearMaskAmpFactor = 100;
        P.linearMaskSmoothness = 1.00;
        P.linearMaskInverted = true;
        P.linearMaskPreview = false;
        P.lowRange = 0.0000;
        P.highRange = 0.0000;
        P.previewMode = MultiscaleMedianTransform.Disabled;
        P.previewLayer = 0;
        P.toLuminance = true;
        P.toChrominance = true;
        P.linear = false;
        P.executeOn(image.mainView);
    } catch (e) {
        console.criticalln("Error while applying MMT to image: " + e.message);
        console.flush();
    }
}

// Invert the lightness mask
function invertMask(mask) {
    try {
        var P = new Invert;
        P.executeOn(mask.mainView);
    } catch (e) {
        console.criticalln("Error while inverting mask: " + e.message);
        console.flush();
    }
}

// Apply the final mask to the selected image
function applyMaskToImage(selectedImage, finalMask) {
    try {
        // Select the mask for the image
        selectedImage.mask = finalMask;
        selectedImage.maskVisible = true;
        selectedImage.maskInverted = false;
    } catch (e) {
        console.criticalln("Error while applying mask to image: " + e.message);
        console.flush();
    }
}

// Function to apply the curves transformation to the image
function applyCurvesToImage(image, reductionAmount) {
    try {
        var P = new CurvesTransformation;

        if (reductionAmount === 0) { // Extra Low setting
            P.K = [ // x, y
                [0.00000, 0.00000],
                [0.75000, 0.57500],
                [1.00000, 1.00000]
            ];
        } else {
            P.K = [ // x, y
                [0.00000, 0.00000],
                [0.75000, 0.40000],
                [1.00000, 1.00000]
            ];
        }

        P.Kt = CurvesTransformation.AkimaSubsplines;

        // Apply curves transformation
        if (reductionAmount === 0) {
            P.executeOn(image.mainView);  // Apply once for "Extra Low"
        } else {
            for (let i = 0; i < reductionAmount; i++) {
                P.executeOn(image.mainView);
            }
        }
    } catch (e) {
        console.criticalln("Error while applying CurvesTransformation to image: " + e.message);
        console.flush();
    }
}


class HaloBGonDialog extends Dialog {
    constructor() {
    super();

    console.noteln("Ready to Remove those Halos!");
    console.flush();

    // Create a title label
    this.titleLabel = new Label(this);
    this.titleLabel.frameStyle = FrameStyle_Box;
    this.titleLabel.margin = 10;
    this.titleLabel.wordWrapping = true;
    this.titleLabel.useRichText = true;
    this.titleLabel.text = "<p style='text-align: center; font-size: 16px;'>" +
        "<b>" + TITLE + "</b> - Version " + VERSION + "<br>" +
        "<i>Reduce Those Unwanted Halos</i>" +
        "</p>";
    this.titleLabel.setMinWidth(300); // Set minimum width to 400 pixels

    this.targetImageLabel = new Label(this);
    this.targetImageLabel.text = "Select stars-only image:";
    this.targetImageLabel.textAlignment = TextAlign_Left | TextAlign_VertCenter;

    this.targetImageComboBox = new ComboBox(this);
    this.targetImageComboBox.editEnabled = false;

    // Populate the dropdown with the available image windows
    let windowList = ImageWindow.windows;
    let activeWindowIndex = -1;
    for (let i = 0; i < windowList.length; i++) {
        this.targetImageComboBox.addItem(windowList[i].mainView.id);
        if (ImageWindow.activeWindow.mainView.id === windowList[i].mainView.id) {
            activeWindowIndex = i;
        }
    }

    // Set the default selection to the active window if available
    if (activeWindowIndex !== -1) {
        this.targetImageComboBox.currentItem = activeWindowIndex;
    }

    this.reductionLabel = new Label(this);
    this.reductionLabel.text = "Reduction Amount:";
    this.reductionLabel.textAlignment = TextAlign_Left | TextAlign_VertCenter;

    this.reductionLabelExtraLow = new Label(this);
   this.reductionLabelExtraLow.text = "Extra Low";
   this.reductionLabelExtraLow.textAlignment = TextAlign_Left | TextAlign_VertCenter;

    this.reductionLabelLow = new Label(this);
    this.reductionLabelLow.text = "Low";
    this.reductionLabelLow.textAlignment = TextAlign_Left | TextAlign_VertCenter;

    this.reductionLabelMed = new Label(this);
    this.reductionLabelMed.text = "Med";
    this.reductionLabelMed.textAlignment = TextAlign_Center | TextAlign_VertCenter;

    this.reductionLabelHigh = new Label(this);
    this.reductionLabelHigh.text = "High";
    this.reductionLabelHigh.textAlignment = TextAlign_Right | TextAlign_VertCenter;

    this.reductionLabelSizer = new HorizontalSizer;
    this.reductionLabelSizer.margin = 8;
    this.reductionLabelSizer.spacing = 6;
    this.reductionLabelSizer.add(this.reductionLabelExtraLow);
   this.reductionLabelSizer.addStretch();
    this.reductionLabelSizer.add(this.reductionLabelLow);
    this.reductionLabelSizer.addStretch();
    this.reductionLabelSizer.add(this.reductionLabelMed);
    this.reductionLabelSizer.addStretch();
    this.reductionLabelSizer.add(this.reductionLabelHigh);

    this.reductionSlider = new Slider(this);
    this.reductionSlider.minValue = 0;
    this.reductionSlider.maxValue = 3;
    this.reductionSlider.value = 1;
    this.reductionSlider.toolTip = "Adjust the amount of halo reduction (Low, Medium, High)";

    this.linearDataCheckbox = new CheckBox(this);
    this.linearDataCheckbox.text = "Linear Data";
    this.linearDataCheckbox.checked = false;
    this.linearDataCheckbox.toolTip = "Check if the data is linear";

    this.authorshipLabel = new Label(this);
    this.authorshipLabel.text = "<p style='text-align:center;'>Written by Franklin Marek 2024.<br><a href='http://www.setiastro.com'>www.setiastro.com</a></p>";
    this.authorshipLabel.textAlignment = TextAlign_Center | TextAlign_VertCenter;
    this.authorshipLabel.useRichText = true;

    this.newInstanceButton = new ToolButton(this);
    this.newInstanceButton.icon = this.scaledResource(":/process-interface/new-instance.png");
    this.newInstanceButton.setScaledFixedSize(24, 24);
    this.newInstanceButton.toolTip = "New Instance";
    this.newInstanceButton.onMousePress = () => {
        this.newInstance();
    };

    this.generateButton = new PushButton(this);
    this.generateButton.text = "Execute";
    this.generateButton.onClick = function() {
        console.writeln("Execute button clicked.");
        console.flush();

        let selectedImageId = this.targetImageComboBox.itemText(this.targetImageComboBox.currentItem).trim();
        console.writeln("Selected Image ID: " + selectedImageId);
        console.flush();

        if (selectedImageId === "") {
            new MessageBox("Please select a valid image.", "Error", StdIcon_Error, StdButton_Ok).execute();
            return;
        }

        let selectedImage = ImageWindow.windowById(selectedImageId);
        console.writeln("Selected Image: " + selectedImage.mainView.id);
        console.flush();

        if (selectedImage.isNull) {
            new MessageBox("Selected image is not valid or not found.", "Error", StdIcon_Error, StdButton_Ok).execute();
            return;
        }

        if (this.linearDataCheckbox.checked) {
            var P = new PixelMath;
            P.expression = "mtf(((.25)^5),$T)";
            P.useSingleExpression = true;
            P.generateOutput = true;
            P.singleThreaded = false;
            P.optimization = true;
            P.use64BitWorkingImage = false;
            P.rescale = false;
            P.truncate = true;
            P.truncateLower = 0;
            P.truncateUpper = 1;
            P.createNewImage = false;
            P.showNewImage = true;
            P.executeOn(selectedImage.mainView);
        }

        let reductionAmount = this.reductionSlider.value;

        for (let i = 0; i < (reductionAmount === 0 ? 1 : reductionAmount); i++) {
            let lightnessMask = createLightnessMask(selectedImage);
            if (!lightnessMask) {
                console.writeln("Lightness mask creation failed.");
                console.flush();
                return;
            }

            let duplicatedLightnessMask = createDuplicateImage(lightnessMask);
            if (!duplicatedLightnessMask) {
                console.writeln("Duplicating lightness mask failed.");
                console.flush();
                return;
            }

            applyMMT(duplicatedLightnessMask);

            invertMask(lightnessMask);

            // Apply HistogramTransformation to the lightness mask
            var P = new HistogramTransformation;
            P.H = [ // c0, m, c1, r0, r1
                [0.00000000, 0.50000000, 1.00000000, 0.00000000, 1.00000000],
                [0.00000000, 0.50000000, 1.00000000, 0.00000000, 1.00000000],
                [0.00000000, 0.50000000, 1.00000000, 0.00000000, 1.00000000],
                [0.00000000, 0.57250000, 0.87500000, 0.00000000, 1.00000000],
                [0.00000000, 0.50000000, 1.00000000, 0.00000000, 1.00000000]
            ];
            P.executeOn(lightnessMask.mainView);

            // Subtract the MMT result from the inverted lightness mask
            var pixelMathExpression = lightnessMask.mainView.id + " - " + duplicatedLightnessMask.mainView.id+ " - " + duplicatedLightnessMask.mainView.id;
            var P = new PixelMath;
            P.expression = pixelMathExpression;
            P.useSingleExpression = true;
            P.generateOutput = true;
            P.createNewImage = false;
            P.executeOn(lightnessMask.mainView);

            applyMaskToImage(selectedImage, lightnessMask);
            applyCurvesToImage(selectedImage, reductionAmount); // Apply curves once in each iteration
            selectedImage.removeMask();

            // Clean up: close the masks
            lightnessMask.forceClose();
            duplicatedLightnessMask.forceClose();
        }

        // Run the reverse pixel math if the linear data checkbox is checked
        if (this.linearDataCheckbox.checked) {
            var P = new PixelMath;
            P.expression = "mtf(~((.25)^5),$T)";
            P.useSingleExpression = true;
            P.generateOutput = true;
            P.singleThreaded = false;
            P.optimization = true;
            P.use64BitWorkingImage = false;
            P.rescale = false;
            P.truncate = true;
            P.truncateLower = 0;
            P.truncateUpper = 1;
            P.createNewImage = false;
            P.showNewImage = true;
            P.executeOn(selectedImage.mainView);
        }

        console.noteln("Halos Be Gone!");

        this.ok();
    }.bind(this);

    this.buttonSizer = new HorizontalSizer;
    this.buttonSizer.spacing = 6;
    this.buttonSizer.add(this.newInstanceButton);
    this.buttonSizer.add(this.generateButton);

    this.sizer = new VerticalSizer;
    this.sizer.margin = 8;
    this.sizer.spacing = 6;
    this.sizer.add(this.titleLabel); // Add title box to the main sizer
    this.sizer.addSpacing(8);
    this.sizer.add(this.targetImageLabel);
    this.sizer.add(this.targetImageComboBox);
    this.sizer.addSpacing(8);
    this.sizer.add(this.reductionLabel);
    this.sizer.add(this.reductionLabelSizer);
    this.sizer.add(this.reductionSlider);
    this.sizer.addSpacing(8);
    this.sizer.add(this.linearDataCheckbox);
    this.sizer.addSpacing(8);
    this.sizer.add(this.authorshipLabel);
    this.sizer.addSpacing(8);
    this.sizer.add(this.buttonSizer);

    this.windowTitle = "Halo-B-Gon: Reduce those UnWanted Halos";
    this.adjustToContents();
}
}

function main() {
    CoreApplication.ensureMinimumVersion(1, 9, 4);
    console.show();
    Console.criticalln("   ____    __  _   ___       __         \n  / __/__ / /_(_) / _ | ___ / /_______ ");
    Console.warningln(" _\\ \\/ -_) __/ / / __ |(_-</ __/ __/ _ \\ \n/___/\\__/\\__/_/ /_/ |_/__/\\__/_/  \\___/ \n                                         ");
    let dialog = new HaloBGonDialog();
    dialog.execute();
}

main();
