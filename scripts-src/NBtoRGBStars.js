#engine v8
#feature-id NBtoRGBStars_v1.6 : SetiAstro > NB to RGB Star Combination
#feature-icon  nbtorgb.svg
#feature-info This script performs a combination of NB stars only images and produces a realistic RGB star image. It also has the option to perform a non-linear Star Stretch on the output.

/******************************************************************************
 *######################################################################
 *#        ___     __      ___       __                                #
 *#       / __/___/ /__   / _ | ___ / /________                        #
 *#      _\ \/ -_) _ _   / __ |(_-</ __/ __/ _ \                       #
 *#     /___/\__/_//_/  /_/ |_/___/\__/_/  \___/                       #
 *#                                                                    #
 *######################################################################
 *
 * NB to RGB Stars Script
 * Version: 1.6
 * Author: Franklin Marek
 * Website: www.setiastro.com
 *
 * This script is designed for the automatic removal of gradients in
 * astrophotographic images.  It includes finding starting points via
 * gradient descent, custom weighting scores, and custom rejection algorithms
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

#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/StdCursor.jsh>
// #include <pjsr/Sizer.jsh>        // native in V8
#include <pjsr/FrameStyle.jsh>
// #include <pjsr/NumericControl.jsh> // native in V8
#include <pjsr/TextAlign.jsh>

var SHOParameters = {
    HaView: undefined,
    OIIIView: undefined,
    SIIView: undefined,
    OSCView: undefined,
    applyStarStretch: false,
    stretchFactor: 5,
    colorBoost: 1.0,
    haToOiiRatio: 0.3,

    save: function() {
        Parameters.set("HaView", this.HaView ? this.HaView.id : "");
        Parameters.set("OIIIView", this.OIIIView ? this.OIIIView.id : "");
        Parameters.set("SIIView", this.SIIView ? this.SIIView.id : "");
        Parameters.set("OSCView", this.OSCView ? this.OSCView.id : "");
        Parameters.set("applyStarStretch", this.applyStarStretch);
        Parameters.set("stretchFactor", this.stretchFactor);
        Parameters.set("colorBoost", this.colorBoost);
        Parameters.set("haToOiiRatio", this.haToOiiRatio);
    },

    load: function() {
        if (Parameters.has("HaView"))
            this.HaView = ImageWindow.windowById(Parameters.getString("HaView")).mainView;
        if (Parameters.has("OIIIView"))
            this.OIIIView = ImageWindow.windowById(Parameters.getString("OIIIView")).mainView;
        if (Parameters.has("SIIView") && Parameters.getString("SIIView") !== "")
            this.SIIView = ImageWindow.windowById(Parameters.getString("SIIView")).mainView;
        if (Parameters.has("OSCView") && Parameters.getString("OSCView") !== "")
            this.OSCView = ImageWindow.windowById(Parameters.getString("OSCView")).mainView;
        if (Parameters.has("applyStarStretch"))
            this.applyStarStretch = Parameters.getBoolean("applyStarStretch");
        if (Parameters.has("stretchFactor"))
            this.stretchFactor = Parameters.getReal("stretchFactor");
        if (Parameters.has("colorBoost"))
            this.colorBoost = Parameters.getReal("colorBoost");
        if (Parameters.has("haToOiiRatio"))
            this.haToOiiRatio = Parameters.getReal("haToOiiRatio");
    }
};

class SHODialog extends Dialog {
    constructor() {
        super();

        this.userResizable = true;
        this.scaledMinWidth = 450;

        // Title setup
        this.title = new TextBox(this);
        this.title.text = "<b>NB to RGB Star Combination Tool v1.6</b><br>Select the H-alpha, OIII, and optionally SII star images for combination. \n\nYou can also select your OSC Image if a dual NB filter is used.  \n\nIf checked it will also perform a linear to non-linear Star Stretch on the output image.";
        this.title.readOnly = true;
        this.title.backgroundColor = 0xf7f7c625;
        this.title.minHeight = 140;
        this.title.maxHeight = 140;

        // Ha setup
        this.HaLabel = new Label(this);
        this.HaLabel.text = "Ha Stars Image:";
        this.HaViewList = new ViewList(this);
        this.HaViewList.getAll();
        this.HaViewList.onViewSelected = (view) => { SHOParameters.HaView = view; };
        this.HaViewList.maxWidth = 275;

        this.HaSizer = new HorizontalSizer;
        this.HaSizer.add(this.HaLabel);
        this.HaSizer.add(this.HaViewList);

        // OIII setup
        this.OIIILabel = new Label(this);
        this.OIIILabel.text = "OIII Stars Image:";
        this.OIIIViewList = new ViewList(this);
        this.OIIIViewList.getAll();
        this.OIIIViewList.onViewSelected = (view) => { SHOParameters.OIIIView = view; };
        this.OIIIViewList.maxWidth = 275;

        this.OIIISizer = new HorizontalSizer;
        this.OIIISizer.add(this.OIIILabel);
        this.OIIISizer.add(this.OIIIViewList);

        // SII setup
        this.SIILabel = new Label(this);
        this.SIILabel.text = "SII Stars Image (optional):";
        this.SIIViewList = new ViewList(this);
        this.SIIViewList.getAll();
        this.SIIViewList.onViewSelected = (view) => { SHOParameters.SIIView = view; };
        this.SIIViewList.maxWidth = 275;

        this.SIISizer = new HorizontalSizer;
        this.SIISizer.add(this.SIILabel);
        this.SIISizer.add(this.SIIViewList);

        // OR label
        this.orLabel = new Label(this);
        this.orLabel.text = "OR";
        this.orLabel.textAlignment = TextAlign_Center;

        // OSC setup
        this.OSCLabel = new Label(this);
        this.OSCLabel.text = "OSC (for dual band filter) Image:";
        this.OSCViewList = new ViewList(this);
        this.OSCViewList.getAll();
        this.OSCViewList.onViewSelected = (view) => { SHOParameters.OSCView = view; };
        this.OSCViewList.maxWidth = 275;

        this.OSCSizer = new HorizontalSizer;
        this.OSCSizer.add(this.OSCLabel);
        this.OSCSizer.add(this.OSCViewList);

        // Checkbox for Green Channel Blend Ratio
        this.greenChannelCheckBox = new CheckBox(this);
        this.greenChannelCheckBox.text = "Green Channel Blend Ratio (Optional)";
        this.greenChannelCheckBox.checked = false;
        this.greenChannelCheckBox.toolTip = "Enable the green channel blend ratio adjustment.";
        this.greenChannelCheckBox.onCheck = (checked) => {
            SHOParameters.haToOiiRatio = checked ? SHOParameters.haToOiiRatio : 0.3;
            this.haToOiiRatioControl.visible = checked;
        };

        // NumericControl for Ha to OIII Ratio
        this.haToOiiRatioControl = new NumericControl(this);
        this.haToOiiRatioControl.label.text = "Ha to OIII ratio:";
        this.haToOiiRatioControl.setRange(0, 1);
        this.haToOiiRatioControl.slider.setRange(0, 100);
        this.haToOiiRatioControl.setValue(SHOParameters.haToOiiRatio);
        this.haToOiiRatioControl.setPrecision(2);
        this.haToOiiRatioControl.onValueUpdated = function(value) {
            SHOParameters.haToOiiRatio = value;
        };
        this.haToOiiRatioControl.visible = false;

        // Checkbox for Star Stretch
        this.starStretchCheckBox = new CheckBox(this);
        this.starStretchCheckBox.text = "Apply Star Stretch (Recommended)";
        this.starStretchCheckBox.checked = false;
        this.starStretchCheckBox.toolTip = "Enable additional stretching and color saturation adjustments.";
        this.starStretchCheckBox.onCheck = (checked) => {
            SHOParameters.applyStarStretch = checked;
            this.stretchFactorControl.visible = checked;
            this.colorBoostControl.visible = checked;
        };

        // NumericControl for stretchFactor
        this.stretchFactorControl = new NumericControl(this);
        this.stretchFactorControl.label.text = "Stretch Factor:";
        this.stretchFactorControl.setRange(0, 8);
        this.stretchFactorControl.slider.setRange(10, 100);
        this.stretchFactorControl.setValue(5);
        this.stretchFactorControl.setPrecision(2);
        this.stretchFactorControl.onValueUpdated = function(value) {
            SHOParameters.stretchFactor = value;
        };
        this.stretchFactorControl.visible = false;

        // NumericControl for Color Boost
        this.colorBoostControl = new NumericControl(this);
        this.colorBoostControl.label.text = "Color Boost:";
        this.colorBoostControl.setRange(0, 3);
        this.colorBoostControl.slider.setRange(0, 300);
        this.colorBoostControl.setValue(SHOParameters.colorBoost);
        this.colorBoostControl.setPrecision(2);
        this.colorBoostControl.onValueUpdated = function(value) {
            SHOParameters.colorBoost = value;
        };
        this.colorBoostControl.visible = false;

        // Add create instance button
        this.newInstanceButton = new ToolButton(this);
        this.newInstanceButton.icon = this.scaledResource(":/process-interface/new-instance.png");
        this.newInstanceButton.setScaledFixedSize(24, 24);
        this.newInstanceButton.toolTip = "New Instance";
        this.newInstanceButton.onMousePress = () => {
            SHOParameters.save();
            this.newInstance();
        };

        // prepare the execution button
        this.execButton = new PushButton(this);
        this.execButton.text = "Execute";
        this.execButton.width = 80;
        this.execButton.onClick = () => {
            this.processImages();
            this.ok();
        };

        // create a horizontal sizer to layout the execution button
        this.execButtonSizer = new HorizontalSizer;
        this.execButtonSizer.margin = 8;
        this.execButtonSizer.add(this.newInstanceButton);
        this.execButtonSizer.addStretch();
        this.execButtonSizer.add(this.execButton);

        // layout the dialog
        this.sizer = new VerticalSizer;
        this.sizer.margin = 8;
        this.sizer.spacing = 8;
        this.sizer.add(this.title);
        this.sizer.addSpacing(8);
        this.sizer.add(this.HaSizer);
        this.sizer.addSpacing(8);
        this.sizer.add(this.OIIISizer);
        this.sizer.addSpacing(8);
        this.sizer.add(this.SIISizer);
        this.sizer.addSpacing(8);
        this.sizer.add(this.orLabel);
        this.sizer.addSpacing(8);
        this.sizer.add(this.OSCSizer);
        this.sizer.addSpacing(8);
        this.sizer.add(this.greenChannelCheckBox);
        this.sizer.addSpacing(8);
        this.sizer.add(this.haToOiiRatioControl);
        this.sizer.addSpacing(8);
        this.sizer.add(this.starStretchCheckBox);
        this.sizer.addSpacing(8);
        this.sizer.add(this.stretchFactorControl);
        this.sizer.addSpacing(8);
        this.sizer.add(this.colorBoostControl);
        this.sizer.addSpacing(8);
        this.sizer.add(this.execButtonSizer);
        this.sizer.addStretch();

        this.adjustToContents();
    }

    processImages() {
        if ((!SHOParameters.HaView || !SHOParameters.OIIIView) && !SHOParameters.OSCView) {
            Console.warningln("Please ensure H-alpha and OIII images are selected, or an OSC image is selected.");
            return;
        }

        let extractedChannels = [];
        try {
            if (SHOParameters.OSCView) {
                extractChannelsFromOSC(SHOParameters.OSCView.id, extractedChannels);
            }

            let newImageId = combineNBtoRGB();
            if (newImageId) {
                applyAdjustments(newImageId);
                closeExtractedChannels(extractedChannels);
                Console.noteln("NB to RGB Star Process Complete");
            } else {
                Console.criticalln("Error creating the new image. Please check the settings.");
                closeExtractedChannels(extractedChannels);
            }
        } catch (e) {
            Console.criticalln("Error during processing: " + e.message);
            closeExtractedChannels(extractedChannels);
        }

        Console.show();
    }
}

function main() {
    Console.show();
    console.criticalln("        ___     __      ___       __                               \n       / __/___/ /__   / _ | ___ / /________                       ");
    console.warningln("        _\\ \\/ -_) _ _   / __ |(_-</ __/ __/ _ \\                     \n      /___/\\__/_//_/  /_/ |_/___/\\__/_/  \\___/                      ");

    if (Parameters.isGlobalTarget) {
        Console.criticalln("This script cannot run in a global context.");
        return;
    }

    try {
        let dialog = new SHODialog();
        dialog.execute();
    } catch (e) {
        Console.criticalln("Fatal error in NB to RGB Stars: " + e.message);
        if (e.stack) Console.criticalln(e.stack);
    }
}

function getAllImageIDs() {
    var windows = ImageWindow.windows;
    var ids = [];
    for (var i = 0; i < windows.length; ++i) {
        ids.push(windows[i].mainView.id);
    }
    return ids;
}

function findNewImageID(oldIDs, newIDs) {
    for (var i = 0; i < newIDs.length; i++) {
        var found = false;
        for (var j = 0; j < oldIDs.length; j++) {
            if (newIDs[i] === oldIDs[j]) {
                found = true;
                break;
            }
        }
        if (!found) {
            return newIDs[i];
        }
    }
    return null;
}

function extractChannel(imageId, channelIndex, suffix, extractedChannels) {
    let P = new ChannelExtraction;
    P.colorSpace = ChannelExtraction.RGB;
    P.channels = [
        [channelIndex === 0, ""],
        [channelIndex === 1, ""],
        [channelIndex === 2, ""]
    ];
    P.sampleFormat = ChannelExtraction.SameAsSource;
    P.inheritAstrometricSolution = true;
    P.executeOn(ImageWindow.windowById(imageId).mainView);
    let extractedImage = ImageWindow.activeWindow;
    extractedImage.mainView.id = imageId + suffix;
    extractedChannels.push(extractedImage.mainView.id);
    extractedImage.hide();
    return extractedImage.mainView.id;
}

function extractChannelsFromOSC(imageId, extractedChannels) {
    SHOParameters.HaView = ImageWindow.windowById(extractChannel(imageId, 0, "_Ha", extractedChannels)).mainView;
    SHOParameters.OIIIView = ImageWindow.windowById(extractChannel(imageId, 1, "_OIII", extractedChannels)).mainView;
}

function closeExtractedChannels(extractedChannels) {
    for (let i = 0; i < extractedChannels.length; i++) {
        try {
            let window = ImageWindow.windowById(extractedChannels[i]);
            if (window) {
                window.forceClose();
            }
        } catch (e) {
            Console.warningln("Could not close extracted channel: " + extractedChannels[i]);
        }
    }
}

function combineNBtoRGB(skipShowingImage) {
    var oldIDs = getAllImageIDs();

    var P = new PixelMath;
    P.expression = "0.5*" + SHOParameters.HaView.id + " + 0.5*" + (SHOParameters.SIIView ? SHOParameters.SIIView.id : SHOParameters.HaView.id);
    P.expression1 = SHOParameters.haToOiiRatio + "*" + SHOParameters.HaView.id + " + ~" + SHOParameters.haToOiiRatio + "*" + SHOParameters.OIIIView.id;
    P.expression2 = SHOParameters.OIIIView.id;
    P.expression3 = "";
    P.useSingleExpression = false;
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
    P.showNewImage = !skipShowingImage;
    P.newImageId = "NBtoRGB_stars";
    P.newImageWidth = 0;
    P.newImageHeight = 0;
    P.newImageAlpha = false;
    P.newImageColorSpace = PixelMath.RGB;
    P.newImageSampleFormat = PixelMath.SameAsTarget;
    P.executeOn(SHOParameters.HaView);

    var newIDs = getAllImageIDs();
    var newImageId = findNewImageID(oldIDs, newIDs);

    return newImageId;
}

function applyAdjustments(newImageId, skipShowingImage) {
    var targetView = ImageWindow.windowById(newImageId) ? ImageWindow.windowById(newImageId).mainView : null;
    if (!targetView) {
        Console.criticalln("Error: Image view not found for ID " + newImageId);
        return;
    }

    applySCNR(targetView);
    applyMTF(targetView);
    applySCNR(targetView);
    reverseMTF(targetView);

    if (SHOParameters.applyStarStretch) {
        applyStarStretch(targetView);
    }

    Console.noteln("All adjustments including optional star stretch (if applied) are complete.");

    if (skipShowingImage) {
        ImageWindow.windowById(newImageId).hide();
    }
}

function applySCNR(view) {
    var P = new SCNR;
    P.amount = 1.00;
    P.protectionMethod = SCNR.AverageNeutral;
    P.colorToRemove = SCNR.Green;
    P.preserveLightness = true;
    P.executeOn(view);
}

function applyMTF(view) {
    var P = new PixelMath;
    P.expression = "mtf(0.01, $T)";
    P.useSingleExpression = true;
    P.executeOn(view);
}

function reverseMTF(view) {
    var P = new PixelMath;
    P.expression = "mtf(~0.01, $T)";
    P.useSingleExpression = true;
    P.executeOn(view);
}

function applyStarStretch(view) {
    var stretchFactor = SHOParameters.stretchFactor || 5;
    var colorBoost = SHOParameters.colorBoost || 1.0;

    var P = new PixelMath;
    P.expression = "((3^" + stretchFactor + ")*$T)/((3^" + stretchFactor + "-1)*$T+1)";
    P.useSingleExpression = true;
    P.executeOn(view);

    var C = new ColorSaturation;
    C.HS = [
        [0.00000, colorBoost * 0.40000],
        [0.50000, colorBoost * 0.70000],
        [1.00000, colorBoost * 0.40000]
    ];
    C.HSt = ColorSaturation.AkimaSubsplines;
    C.hueShift = 0.000;

    C.executeOn(view);
}

main();
