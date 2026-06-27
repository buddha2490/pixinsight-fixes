#engine v8
#feature-id ContinuumSubtractionUtility : SetiAstro > ContinuumSubtraction Utility
#feature-icon  continuumsubtraction.svg
#feature-info This script is designed for the automated continuum subtraction in astrophotography images. It includes functionalities for gradient descent optimization, color calibration, background neutralization, and non-linear stretching.

/******************************************************************************
 *######################################################################
 *#        ___     __      ___       __                                #
 *#       / __/___/ /__   / _ | ___ / /________                        #
 *#      _\ \/ -_) _ _   / __ |(_-</ __/ __/ _ \                       #
 *#     /___/\__/_//_/  /_/ |_/___/\__/_/  \___/                       #
 *#                                                                    #
 *######################################################################
 * Continuum Subtraction Script
 * Version: 1.3.6
 * Author: Franklin Marek
 * Website: www.setiastro.com
 *
 * This script is designed for the automated continuum subtraction in astrophotography
 * images, allowing for enhanced emission line analysis. It includes functionalities for
 * gradient descent optimization, color calibration, background neutralization, and
 * non-linear stretching.
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
#include <pjsr/Sizer.jsh>
#include <pjsr/FrameStyle.jsh>
#include <pjsr/NumericControl.jsh>
#include <pjsr/ImageOp.jsh>
#include <pjsr/SampleType.jsh>
#include <pjsr/UndoFlag.jsh>

#define TITLE "Continuum Subtraction Utility"
#define VERSION "1.3.6"
#define DEBUGGING_MODE_ON false
#define GLOBAL_NOISE_REDUCTION_CHECKED "globalNoiseReductionChecked"
#define GLOBAL_NOISE_REDUCTION_METHOD "globalNoiseReductionMethod"

#ifeq __PI_PLATFORM__ MACOSX
#define NOISEXTERMINATOR_AI_FILE "NoiseXTerminator.2.mlpackage"
#endif
#ifeq __PI_PLATFORM__ MSWINDOWS
#define NOISEXTERMINATOR_AI_FILE "NoiseXTerminator.2.pb"
#endif
#ifeq __PI_PLATFORM__ LINUX
#define NOISEXTERMINATOR_AI_FILE "NoiseXTerminator.2.pb"
#endif

// Enable automatic garbage collection
jsAutoGC = true;

// Global parameters object
var ContinuumSubtractionParameters = {
    targetView: undefined,
    applyNoiseReduction: false,
    noiseReductionMethod: "NoiseXterminator",
    starrySelected: true,
    outputLinearImageOnly: false,
    aiModel: "2.0.0", // Default AI model

    newInstance: function() {
        console.writeln("New instance created.");
        this.save();
    },

    save: function() {
        Parameters.set("targetView", this.targetView ? this.targetView.id : "");
        Parameters.set("applyNoiseReduction", this.applyNoiseReduction);
        Parameters.set("noiseReductionMethod", this.noiseReductionMethod);
        Parameters.set("starrySelected", this.starrySelected);
        Parameters.set("outputLinearImageOnly", this.outputLinearImageOnly);
        Parameters.set("aiModel", this.aiModel); // Save AI model
    },

    load: function() {
        if (Parameters.has("targetView")) {
            let savedViewId = Parameters.getString("targetView");
            if (savedViewId.length > 0) {
                let savedWindow = ImageWindow.windowById(savedViewId);
                if (!savedWindow.isNull)
                    this.targetView = savedWindow.mainView;
            }
        }
        if (Parameters.has("applyNoiseReduction"))
            this.applyNoiseReduction = Parameters.getBoolean("applyNoiseReduction");
        if (Parameters.has("noiseReductionMethod"))
            this.noiseReductionMethod = Parameters.getString("noiseReductionMethod");
        if (Parameters.has("starrySelected"))
            this.starrySelected = Parameters.getBoolean("starrySelected");
        if (Parameters.has("outputLinearImageOnly"))
            this.outputLinearImageOnly = Parameters.getBoolean("outputLinearImageOnly");
        if (Parameters.has("aiModel"))
            this.aiModel = Parameters.getString("aiModel"); // Load AI model
    }
};

// Call the load method to initialize parameters if needed
ContinuumSubtractionParameters.load();


// Parameters for Gradient Descent
let GradientDescentParameters = {
    targetView: undefined,
    generatePathImage: false
};

// Global parameters
let qualityMultiplier = 1.0;
let targetMedian = 0.25;


// Track created windows
let createdWindows = [];

// Function to get all existing image IDs
function getAllImageIDs() {
    let ids = [];
    let windows = ImageWindow.windows;
    for (let i = 0; i < windows.length; ++i) {
        ids.push(windows[i].mainView.id);
    }
    return ids;
}

// Function to find a unique image ID
function findUniqueImageID(baseID) {
    let ids = getAllImageIDs();
    let uniqueID = baseID;
    let count = 1;
    while (ids.indexOf(uniqueID) !== -1) {
        uniqueID = baseID + "_" + ("00" + count).slice(-2);
        count++;
    }
    return uniqueID;
}

function checkImageIsGreyscale(imageId) {
    let window = ImageWindow.windowById(imageId);
    if (window && window.mainView.image.isColor) {
        return false;
    }
    return true;
}



function ContinuumSubtractionDialog() {
    this.__base__ = Dialog;
    this.__base__();

    this.title = TITLE + " Script";

    // Title Box
    this.titleLabel = new Label(this);
    this.titleLabel.text = TITLE + " V" + VERSION;
    this.titleLabel.textAlignment = TextAlign_Center;
    this.titleLabel.styleSheet = "font-weight: bold; font-size: 14pt; background-color: #f0f0f0;";

    // Instruction Box
    this.instructionLabel = new Label(this);
    this.instructionLabel.text = "Script to take Linear NB filter image(s) and RGB Channels (or OSC), perform a continuum subtraction, and automatically create pure signal non-linear images.\n\nSelect the relevant images for Ha, OIII, SII, and the continuum images Red (or RGB), Green. At least one image must be selected in both the emission line and continuum groups.\n\nYou will need a Red(or RGB) image for Ha and SII subtraction and a Green if you don't have an RGB image in the Red (or RGB) dropdown for OIII subtraction.\n\nBe sure to select whether your images have had the stars removed or not with the Starry or Starless Buttons.  All images loaded need to either be all starless or all be full of stars.\n\nPrior to Running the script ensure:\n -Gradients Removed\n -Stacking Artifacts cropped out\n -BlurXterminator ran (if you own it)";
    this.instructionLabel.wordWrapping = true;
    this.instructionLabel.textAlignment = TextAlign_Left;
    this.instructionLabel.frameStyle = FrameStyle_Box;
    this.instructionLabel.styleSheet = "font-size: 10pt; padding: 10px; background-color: #e6e6fa;";

    // Radio buttons for Starry and Starless
    this.starryRadioButton = new RadioButton(this);
    this.starryRadioButton.text = "Starry";
    this.starryRadioButton.checked = ContinuumSubtractionParameters.starrySelected; // Set from parameters
    this.starryRadioButton.toolTip = "If processing galaxies I highly recommend you use Starry images\n\nStarX and StarNet tend to remove portions of galaxies\nthinking they are stars as the structures are\nso far away they appear pointlike.\n\nThis can lead to improper subtraction with starless images";

    this.starlessRadioButton = new RadioButton(this);
    this.starlessRadioButton.text = "Starless";
    this.starlessRadioButton.checked = !ContinuumSubtractionParameters.starrySelected; // Set from parameters
    this.starlessRadioButton.toolTip = "If processing galaxies I highly recommend you use Starry images\n\nStarX and StarNet tend to remove portions of galaxies\nthinking they are stars as the structures are\nso far away they appear pointlike.\n\nThis can lead to improper subtraction with starless images";

    this.radioButtonSizer = new HorizontalSizer;
    this.radioButtonSizer.spacing = 10;
    this.radioButtonSizer.add(this.starryRadioButton);
    this.radioButtonSizer.add(this.starlessRadioButton);

    // Ensure the selected state is saved when the radio button changes
    this.starryRadioButton.onCheck = function(checked) {
        if (checked) {
            ContinuumSubtractionParameters.starrySelected = true;
        }
    };

    this.starlessRadioButton.onCheck = function(checked) {
        if (checked) {
            ContinuumSubtractionParameters.starrySelected = false;
        }
    };

    // Function to create dropdowns with labels
    this.createDropdownWithLabel = function(labelText) {
        let sizer = new HorizontalSizer;
        let label = new Label(this);
        label.text = labelText;
        label.textAlignment = TextAlign_Right | TextAlign_VertCenter;
        let comboBox = new ComboBox(this);
        comboBox.editEnabled = false;
        comboBox.addItem("Select Image");

        let windows = ImageWindow.windows;
        for (let i = 0; i < windows.length; ++i) {
            comboBox.addItem(windows[i].mainView.id);
        }

        comboBox.currentItem = 0; // Default to "Select Image"

        sizer.add(label);
        sizer.add(comboBox, 100);
        return { sizer: sizer, comboBox: comboBox };
    };

    // Create dropdowns with labels and store references to the ComboBox elements
    let ha = this.createDropdownWithLabel("Ha:");
    this.haSizer = ha.sizer;
    this.haComboBox = ha.comboBox;
    this.haComboBox.maxWidth = 400; // Set the maximum width

    let oiii = this.createDropdownWithLabel("OIII:");
    this.oiiiSizer = oiii.sizer;
    this.oiiiComboBox = oiii.comboBox;
    this.oiiiComboBox.maxWidth = 400; // Set the maximum width

    let sii = this.createDropdownWithLabel("SII:");
    this.siiSizer = sii.sizer;
    this.siiComboBox = sii.comboBox;
    this.siiComboBox.maxWidth = 400; // Set the maximum width

    let redRgb = this.createDropdownWithLabel("Red (or RGB):");
    this.redRgbSizer = redRgb.sizer;
    this.redRgbComboBox = redRgb.comboBox;
    this.redRgbComboBox.maxWidth = 400; // Set the maximum width

    let green = this.createDropdownWithLabel("Green:");
    this.greenSizer = green.sizer;
    this.greenComboBox = green.comboBox;
    this.greenComboBox.maxWidth = 400; // Set the maximum width

    // New Instance Button setup
    this.newInstanceButton = new ToolButton(this);
    this.newInstanceButton.icon = ":/process-interface/new-instance.png";
    this.newInstanceButton.setScaledFixedSize(24, 24);
    this.newInstanceButton.toolTip = "New Instance";
    this.newInstanceButton.onMousePress = () => {
        ContinuumSubtractionParameters.newInstance();
        this.newInstance();
    };

    // Execute Button
    this.executeButton = new PushButton(this);
    this.executeButton.text = "Execute";

    // Authorship
    this.authorshipLabel = new Label(this);
    this.authorshipLabel.text = "Written by Franklin Marek\nCopyright 2024\nwww.setiastro.com";
    this.authorshipLabel.textAlignment = TextAlign_Center;

    // Define variables for the new UI elements
    this.noiseReductionCheckBox = new CheckBox(this);
    this.noiseReductionCheckBox.text = "Apply Noise Reduction within the Process";
    this.noiseReductionCheckBox.checked = ContinuumSubtractionParameters.applyNoiseReduction;
    this.noiseReductionCheckBox.onCheck = function(checked) {
        this.dialog.noiseReductionMethodGroup.visible = checked;
        this.dialog.adjustToContents();
        ContinuumSubtractionParameters.applyNoiseReduction = checked;
    };

    this.noiseXterminatorCheckBox = new CheckBox(this);
    this.noiseXterminatorCheckBox.text = "NoiseXterminator";
    this.noiseXterminatorCheckBox.checked = ContinuumSubtractionParameters.noiseReductionMethod === "NoiseXterminator";
    this.noiseXterminatorCheckBox.tooltip = "These processes need to be installed separately from this script.";
    this.noiseXterminatorCheckBox.onCheck = function(checked) {
        if (checked) {
            ContinuumSubtractionParameters.noiseReductionMethod = "NoiseXterminator";
            this.dialog.graXpertDenoiseCheckBox.checked = false;
            this.dialog.aiModelLabel.visible = false; // Hide AI model label
            this.dialog.aiModelDropdown.visible = false; // Hide AI model dropdown
            this.dialog.adjustToContents();
        }
    };

    this.graXpertDenoiseCheckBox = new CheckBox(this);
    this.graXpertDenoiseCheckBox.text = "GraXpertDenoise";
    this.graXpertDenoiseCheckBox.checked = ContinuumSubtractionParameters.noiseReductionMethod === "GraXpertDenoise";
    this.graXpertDenoiseCheckBox.onCheck = function(checked) {
        if (checked) {
            ContinuumSubtractionParameters.noiseReductionMethod = "GraXpertDenoise";
            this.dialog.noiseXterminatorCheckBox.checked = false;
            this.dialog.aiModelLabel.visible = true; // Show AI model label
            this.dialog.aiModelDropdown.visible = true; // Show AI model dropdown
            this.dialog.adjustToContents();
        }
    };

    // Label for AI model dropdown
    this.aiModelLabel = new Label(this);
    this.aiModelLabel.text = "Select AI Model: ";
    this.aiModelLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;
    this.aiModelLabel.visible = this.graXpertDenoiseCheckBox.checked; // Initially set based on GraXpertDenoise checkbox

      // Dropdown for selecting the AI model
      this.aiModelDropdown = new ComboBox(this);
      this.aiModelDropdown.addItem("1.0.0");
      this.aiModelDropdown.addItem("2.0.0");
      this.aiModelDropdown.addItem("3.0.0");
      this.aiModelDropdown.addItem("3.0.1");
      this.aiModelDropdown.addItem("3.0.2");
      this.aiModelDropdown.currentItem = 1; // Default to "2.0.0"
      this.aiModelDropdown.visible = this.graXpertDenoiseCheckBox.checked; // Initially set based on GraXpertDenoise checkbox
      this.aiModelDropdown.onItemSelected = function(index) {
          ContinuumSubtractionParameters.aiModel = this.dialog.aiModelDropdown.itemText(index);
      };

    this.noiseReductionMethodGroup = new Control(this);
    this.noiseReductionMethodGroup.sizer = new VerticalSizer;
    this.noiseReductionMethodGroup.sizer.add(this.noiseXterminatorCheckBox);
    this.noiseReductionMethodGroup.sizer.add(this.graXpertDenoiseCheckBox);

    // Add AI model label and dropdown to the sizer
    let aiModelSizer = new HorizontalSizer;
    aiModelSizer.add(this.aiModelLabel);
    aiModelSizer.add(this.aiModelDropdown);
    this.noiseReductionMethodGroup.sizer.add(aiModelSizer);

    this.noiseReductionMethodGroup.visible = ContinuumSubtractionParameters.applyNoiseReduction;

    // New Checkbox for "Output Linear Image Only"
    this.outputLinearCheckBox = new CheckBox(this);
    this.outputLinearCheckBox.text = "Output Linear Image Only";
    this.outputLinearCheckBox.checked = ContinuumSubtractionParameters.outputLinearImageOnly;
    this.outputLinearCheckBox.toolTip = "If checked, the script will output only the linear image and skip the non-linear stretch, pure signal extraction, and curves boost steps.";
    this.outputLinearCheckBox.onCheck = function(checked) {
        ContinuumSubtractionParameters.outputLinearImageOnly = checked;
    };

    // Layout
    this.sizer = new VerticalSizer;
    this.sizer.margin = 6;
    this.sizer.spacing = 6;
    this.sizer.add(this.titleLabel);
    this.sizer.add(this.instructionLabel);
    this.sizer.addSpacing(10);

    // Add radio buttons to the layout
    this.sizer.add(this.radioButtonSizer);
    this.sizer.addSpacing(10);

    // Group Labels
    this.groupLabelsSizer = new HorizontalSizer;
    this.groupLabelsSizer.spacing = 6;

    this.emissionGroupLabel = new Label(this);
    this.emissionGroupLabel.text = "Emission Line Group";
    this.emissionGroupLabel.textAlignment = TextAlign_Center;
    this.emissionGroupLabel.styleSheet = "font-weight: bold;";
    this.groupLabelsSizer.add(this.emissionGroupLabel, 100);

    this.groupLabelsSizer.addSpacing(20); // Add space between groups

    this.continuumGroupLabel = new Label(this);
    this.continuumGroupLabel.text = "Continuum Group";
    this.continuumGroupLabel.textAlignment = TextAlign_Center;
    this.continuumGroupLabel.styleSheet = "font-weight: bold;";
    this.groupLabelsSizer.add(this.continuumGroupLabel, 100);

    this.sizer.add(this.groupLabelsSizer);

    // Emission Line and Continuum Dropdowns
    this.dropdownGroupSizer = new HorizontalSizer;
    this.dropdownGroupSizer.spacing = 6;

    this.emissionSizer = new VerticalSizer;
    this.emissionSizer.spacing = 6;
    this.emissionSizer.add(this.haSizer);
    this.emissionSizer.add(this.oiiiSizer);
    this.emissionSizer.add(this.siiSizer);

    this.dropdownGroupSizer.add(this.emissionSizer);

    this.dropdownGroupSizer.addSpacing(20); // Add space between columns

    this.continuumSizer = new VerticalSizer;
    this.continuumSizer.spacing = 6;
    this.continuumSizer.add(this.redRgbSizer);
    this.continuumSizer.add(this.greenSizer);
    this.continuumSizer.add(new Label(this)); // Add blank space to align with SII

    this.dropdownGroupSizer.add(this.continuumSizer);

    this.sizer.add(this.dropdownGroupSizer);

    // Add the new controls for noise reduction and output linear image
    this.noiseReductionAndOutputSizer = new HorizontalSizer;
    this.noiseReductionAndOutputSizer.spacing = 8;
    this.noiseReductionAndOutputSizer.add(this.noiseReductionCheckBox);
    this.noiseReductionAndOutputSizer.add(this.outputLinearCheckBox);
    this.sizer.add(this.noiseReductionAndOutputSizer);
    this.sizer.addSpacing(8);
    this.sizer.add(this.noiseReductionMethodGroup);

    // Bottom row layout
    this.bottomRowSizer = new HorizontalSizer;
    this.bottomRowSizer.spacing = 6;
    this.bottomRowSizer.add(this.newInstanceButton);
    this.bottomRowSizer.addStretch();
    this.bottomRowSizer.add(this.authorshipLabel);
    this.bottomRowSizer.addStretch();
    this.bottomRowSizer.add(this.executeButton);

    this.sizer.add(this.bottomRowSizer);

    this.windowTitle = TITLE + " Script";
    this.adjustToContents();
    this.resizeable = true;

    this.executeButton.onClick = () => {
        this.executeScript();
    };
}
ContinuumSubtractionDialog.prototype = new Dialog;



// Function to convert to grayscale
function convertToGrayscale(imageWindow) {
    let P = new ConvertToGrayscale;
    P.executeOn(imageWindow.mainView);
}


function ensureGrayscale(imageWindow) {
    if (!imageWindow.mainView.image.isGrayscale) {
        convertToGrayscale(imageWindow);
    }
}



// Function to apply non-linear stretch using PixelMath
function applyNonLinearStretch(imageWindow) {
    console.writeln("Applying non-linear stretch to image: ", imageWindow.mainView.id);

    let P = new PixelMath;
    P.expression = "L=log((Med($T)*" + targetMedian + "-(" + targetMedian + "))/(Med($T)*(" + targetMedian + "-1)))/log(3);\n" +
                   "S=(3^L*$T)/((3^L-1)*$T+1);";
    P.useSingleExpression = true;
    P.symbols = "L, S";
    P.clearImageCacheAndExit = false;
    P.cacheGeneratedImages = false;
    P.generateOutput = true;
    P.singleThreaded = false;
    P.optimization = true;
    P.use64BitWorkingImage = true;
    P.rescale = false;
    P.rescaleLower = 0;
    P.rescaleUpper = 1;
    P.truncate = true;
    P.truncateLower = 0;
    P.truncateUpper = 1;
    P.createNewImage = false;
    P.showNewImage = true;
    P.executeOn(imageWindow.mainView);
}


// Function to calculate window size
function calculate_window_size(image_height) {
    return Math.min(Math.round(image_height * 0.05), 50); // 5% of the height of the target image, but not exceeding 50 pixels
}

// Function to calculate spacing
function calculate_spacing(window_size) {
    return Math.ceil(window_size * 0.5); // Increase spacing to cover fewer regions
}

// Function to get average pixel brightness
function get_average_pixel_brightness(var_image, x, y, channels) {
    if (channels == 1) {
        return var_image.sample(x, y, 0); // Single channel (greyscale)
    } else {
        return (var_image.sample(x, y, 0) + var_image.sample(x, y, 1) + var_image.sample(x, y, 2)) / 3; // Color image
    }
}

// Function to get window statistics
function get_window_stats(var_image, x, y, window_size, channels) {
    let pixel_values = [];
    let average_brightness = 0;
    let sum_squares = 0;

    for (let offset_x = 0; offset_x < window_size; offset_x++) {
        for (let offset_y = 0; offset_y < window_size; offset_y++) {
            let brightness = get_average_pixel_brightness(var_image, x + offset_x, y + offset_y, channels);
            pixel_values.push(brightness);
            average_brightness += brightness;
            sum_squares += brightness * brightness;
        }
    }

    let num_pixels = window_size * window_size;
    average_brightness /= num_pixels;
    let variance = sum_squares / num_pixels - average_brightness * average_brightness;
    let std_dev = Math.sqrt(variance);

    return { average_brightness: average_brightness, std_dev: std_dev };
}


// Function to find the highest white point region using gradient ascent
function find_white_point(imageWindow) {
    let var_image = imageWindow.mainView.image;
    let channels = var_image.numberOfChannels;
    let window_size = 200; // Fixed size for white point region
    let spacing = calculate_spacing(window_size);

    let max_brightness = -Infinity;
    let max_x = 0;
    let max_y = 0;

    console.writeln("Starting Gradient Ascent Path Algorithm");
    console.flush();  // Ensure console updates in real-time

    let max_iterations = 200;  // Set the maximum number of iterations
    let paths = 50;  // Number of random paths
    let path_count = 0;

    let progress_checkpoints = [0, 0.25, 0.50, 0.75, 1.00];
    let next_checkpoint_index = 0;

    while (path_count < paths) {
        // Random starting point
        let start_x = Math.floor(Math.random() * (var_image.width - window_size));
        let start_y = Math.floor(Math.random() * (var_image.height - window_size));

        let x = start_x;
        let y = start_y;
        let iteration_count = 0;

        while (iteration_count < max_iterations) {
            processEvents();

            let stats = get_window_stats(var_image, x, y, window_size, channels);
            if (stats.average_brightness > max_brightness) {
                max_brightness = stats.average_brightness;
                max_x = x;
                max_y = y;
            }

            // Randomly move to the next point
            let direction = Math.floor(Math.random() * 4);
            switch (direction) {
                case 0: x = Math.max(0, x - spacing); break; // Left
                case 1: x = Math.min(var_image.width - window_size, x + spacing); break; // Right
                case 2: y = Math.max(0, y - spacing); break; // Up
                case 3: y = Math.min(var_image.height - window_size, y + spacing); break; // Down
            }

            iteration_count++;
        }

        path_count++;

        // Calculate and print the completion percentage
        let completion_percentage = (path_count / paths);
        if (completion_percentage >= progress_checkpoints[next_checkpoint_index]) {
            console.writeln("Progress: ", (completion_percentage * 100).toFixed(2), "%");
            console.flush();  // Ensure console updates in real-time
            next_checkpoint_index++;
        }
    }

    console.writeln("Found white point at (", max_x, ",", max_y, ") with brightness ", max_brightness);
    console.flush();  // Ensure console updates in real-time

    // Create a preview window
    let previewRect = new Rect(max_x, max_y, max_x + window_size, max_y + window_size);
    imageWindow.createPreview(previewRect, "WhitePoint");
    return { x0: max_x, y0: max_y, x1: max_x + window_size, y1: max_y + window_size };
}

// Function to apply ColorCalibration to images using the background previews for Starry mode
function applyColorCalibrationStarry(imageWindow, backgroundPreview) {
    console.writeln("Applying Color Calibration for Starry mode to image: ", imageWindow.mainView.id);
    console.writeln("Using background preview coordinates: ", backgroundPreview.x0, ", ", backgroundPreview.y0, ", ", backgroundPreview.x1, ", ", backgroundPreview.y1);

    let P = new ColorCalibration;
    P.whiteReferenceViewId = "";
    P.whiteLow = 0.0000000;
    P.whiteHigh = 0.9000000;
    P.whiteUseROI = false;
    P.whiteROIX0 = 0;
    P.whiteROIY0 = 0;
    P.whiteROIX1 = 0;
    P.whiteROIY1 = 0;
    P.structureDetection = true;
    P.structureLayers = 5;
    P.noiseLayers = 1;
    P.manualWhiteBalance = false;
    P.manualRedFactor = 1.0000;
    P.manualGreenFactor = 1.0000;
    P.manualBlueFactor = 1.0000;
    P.backgroundReferenceViewId = "";
    P.backgroundLow = 0.0000000;
    P.backgroundHigh = 0.300000;
    P.backgroundUseROI = true;
    P.backgroundROIX0 = backgroundPreview.x0;
    P.backgroundROIY0 = backgroundPreview.y0;
    P.backgroundROIX1 = backgroundPreview.x1;
    P.backgroundROIY1 = backgroundPreview.y1;
    P.outputWhiteReferenceMask = false;
    P.outputBackgroundReferenceMask = false;
    P.executeOn(imageWindow.mainView);
}

// Function to apply ColorCalibration to images using the background previews for Starless mode
function applyColorCalibrationStarless(imageWindow, backgroundPreview, whitePointPreview) {
    console.writeln("Applying Color Calibration for Starless mode to image: ", imageWindow.mainView.id);
    console.writeln("Using background preview coordinates: ", backgroundPreview.x0, ", ", backgroundPreview.y0, ", ", backgroundPreview.x1, ", ", backgroundPreview.y1);
    console.writeln("Using white point preview coordinates: ", whitePointPreview.x0, ", ", whitePointPreview.y0, ", ", whitePointPreview.x1, ", whitePointPreview.y1");

    let P = new ColorCalibration;
    P.whiteReferenceViewId = "";
    P.whiteLow = 0.0000000;
    P.whiteHigh = 0.9000000;
    P.whiteUseROI = true;
    P.whiteROIX0 = whitePointPreview.x0;
    P.whiteROIY0 = whitePointPreview.y0;
    P.whiteROIX1 = whitePointPreview.x1;
    P.whiteROIY1 = whitePointPreview.y1;
    P.structureDetection = false;
    P.structureLayers = 5;
    P.noiseLayers = 1;
    P.manualWhiteBalance = false;
    P.manualRedFactor = 1.0000;
    P.manualGreenFactor = 1.0000;
    P.manualBlueFactor = 1.0000;
    P.backgroundReferenceViewId = "";
    P.backgroundLow = 0.0000000;
    P.backgroundHigh = 0.300000;
    P.backgroundUseROI = true;
    P.backgroundROIX0 = backgroundPreview.x0;
    P.backgroundROIY0 = backgroundPreview.y0;
    P.backgroundROIX1 = backgroundPreview.x1;
    P.backgroundROIY1 = backgroundPreview.y1;
    P.outputWhiteReferenceMask = false;
    P.outputBackgroundReferenceMask = false;
    P.executeOn(imageWindow.mainView);
}

// Function to find the lowest background region using gradient descent
function find_background(imageWindow) {
    let var_image = imageWindow.mainView.image;
    let channels = var_image.numberOfChannels;
    let window_size = calculate_window_size(var_image.height);
    let spacing = calculate_spacing(window_size);

    let min_brightness = Infinity;
    let min_x = 0;
    let min_y = 0;

    console.writeln("Starting Gradient Descent Path Algorithm");
    console.flush();  // Ensure console updates in real-time

    let max_iterations = 200;  // Set the maximum number of iterations
    let paths = 50;  // Number of random paths
    let path_count = 0;

    let progress_checkpoints = [0, 0.25, 0.50, 0.75, 1.00];
    let next_checkpoint_index = 0;

    while (path_count < paths) {
        // Random starting point
        let start_x = Math.floor(Math.random() * (var_image.width - window_size));
        let start_y = Math.floor(Math.random() * (var_image.height - window_size));

        let x = start_x;
        let y = start_y;
        let iteration_count = 0;

        while (iteration_count < max_iterations) {
            processEvents();

            let stats = get_window_stats(var_image, x, y, window_size, channels);
            if (stats.average_brightness < min_brightness) {
                min_brightness = stats.average_brightness;
                min_x = x;
                min_y = y;
            }

            // Randomly move to the next point
            let direction = Math.floor(Math.random() * 4);
            switch (direction) {
                case 0: x = Math.max(0, x - spacing); break; // Left
                case 1: x = Math.min(var_image.width - window_size, x + spacing); break; // Right
                case 2: y = Math.max(0, y - spacing); break; // Up
                case 3: y = Math.min(var_image.height - window_size, y + spacing); break; // Down
            }

            iteration_count++;
        }

        path_count++;

        // Calculate and print the completion percentage
        let completion_percentage = (path_count / paths);
        if (completion_percentage >= progress_checkpoints[next_checkpoint_index]) {
            console.writeln("Progress: ", (completion_percentage * 100).toFixed(2), "%");
            console.flush();  // Ensure console updates in real-time
            next_checkpoint_index++;
        }
    }

    console.writeln("Found background at (", min_x, ",", min_y, ") with brightness ", min_brightness);
    console.flush();  // Ensure console updates in real-time

    // Create a preview window
    let previewRect = new Rect(min_x, min_y, min_x + window_size, min_y + window_size);
    imageWindow.createPreview(previewRect, "Background");
    return { x0: min_x, y0: min_y, x1: min_x + window_size, y1: min_y + window_size };
}

// Function to apply BackgroundNeutralization to images using the background previews
function applyBackgroundNeutralization(imageWindow, backgroundPreview) {
    console.writeln("Applying Background Neutralization to image: ", imageWindow.mainView.id);
    console.writeln("Using background preview coordinates: ", backgroundPreview.x0, ", ", backgroundPreview.y0, ", ", backgroundPreview.x1, ", ", backgroundPreview.y1);

    let P = new BackgroundNeutralization;
    P.backgroundReferenceViewId = "";
    P.backgroundLow = 0.0000000;
    P.backgroundHigh = 0.1000000;
    P.useROI = true;
    P.roiX0 = backgroundPreview.x0;
    P.roiY0 = backgroundPreview.y0;
    P.roiX1 = backgroundPreview.x1;
    P.roiY1 = backgroundPreview.y1;
    P.mode = BackgroundNeutralization.prototype.RescaleAsNeeded;
    P.targetBackground = 0.0010000;
    P.executeOn(imageWindow.mainView);
}

// CreateImagesAndFindBackground function modifications:
function createImagesAndFindBackground(ha, oiii, sii, redRgb, green) {
    let createdImages = [];
    let backgroundPreviews = {};
    let extractedChannels = [];

        // Function to check if all images have the same dimensions
    function checkImageDimensions(imageIds) {
        let firstImage = ImageWindow.windowById(imageIds[0]);
        let width = firstImage.mainView.image.width;
        let height = firstImage.mainView.image.height;
        for (let i = 1; i < imageIds.length; i++) {
            let image = ImageWindow.windowById(imageIds[i]);
            if (image.mainView.image.width !== width || image.mainView.image.height !== height) {
                return false;  // Dimensions do not match
            }
        }
        return true;  // All dimensions match
    }

    // Collect all selected images
    let selectedImages = [ha, oiii, sii, redRgb, green].filter(img => img !== "Select Image");

    // Check if all images have matching dimensions
    if (!checkImageDimensions(selectedImages)) {
        new MessageBox("Image dimensions do not match. Please align and crop to the same dimensions.", "Dimension Mismatch", StdIcon_Error, StdButton_Ok).execute();
        return null; // Exit early to prevent further processing
    }

    // Function to create a new image with ChannelCombination
    function createNewImage(channels, baseID) {
        let uniqueID = findUniqueImageID(baseID);

        let P = new ChannelCombination;
        P.colorSpace = ChannelCombination.prototype.RGB;
        P.channels = channels;
        P.inheritAstrometricSolution = true;
        P.executeGlobal();

        let newImage = ImageWindow.activeWindow;
        newImage.mainView.id = uniqueID;
        createdImages.push(uniqueID);

        // Find background and save preview coordinates
        backgroundPreviews[uniqueID] = find_background(newImage);

        return uniqueID;  // Return the unique ID for further processing
    }

    // Function to extract a color channel from an RGB image
    function extractChannel(imageId, channelIndex, suffix) {
        let P = new ChannelExtraction;
        P.colorSpace = ChannelExtraction.prototype.RGB;
        P.channels = [
            [channelIndex === 0, ""],
            [channelIndex === 1, ""],
            [channelIndex === 2, ""]
        ];
        P.sampleFormat = ChannelExtraction.prototype.SameAsSource;
        P.inheritAstrometricSolution = true;
        P.executeOn(ImageWindow.windowById(imageId).mainView);
        let extractedImage = ImageWindow.activeWindow;
        extractedImage.mainView.id = imageId + suffix;
        extractedChannels.push(extractedImage.mainView.id);
        return extractedImage.mainView.id;
    }

    // Check if selected images are greyscale
    if (ha !== "Select Image" && !checkImageIsGreyscale(ha)) {
        new MessageBox("The image " + ha + " is the wrong color space, please select a greyscale image", TITLE, StdIcon_Error, StdButton_Ok).execute();
        return null;
    }
    if (oiii !== "Select Image" && !checkImageIsGreyscale(oiii)) {
        new MessageBox("The image " + oiii + " is the wrong color space, please select a greyscale image", TITLE, StdIcon_Error, StdButton_Ok).execute();
        return null;
    }
    if (sii !== "Select Image" && !checkImageIsGreyscale(sii)) {
        new MessageBox("The image " + sii + " is the wrong color space, please select a greyscale image", TITLE, StdIcon_Error, StdButton_Ok).execute();
        return null;
    }
    if (green !== "Select Image" && !checkImageIsGreyscale(green)) {
        new MessageBox("The image " + green + " is the wrong color space, please select a greyscale image", TITLE, StdIcon_Error, StdButton_Ok).execute();
        return null;
    }

    // Check if Red (or RGB) is grayscale or not selected
    if (redRgb === "Select Image" || ImageWindow.windowById(redRgb).mainView.image.isGrayscale) {
        // Check and create HRR
        if (ha !== "Select Image" && redRgb !== "Select Image") {
            createNewImage([[true, ha], [true, redRgb], [true, redRgb]], "HaNB");
        }

        // Check and create SRR
        if (sii !== "Select Image" && redRgb !== "Select Image") {
            createNewImage([[true, sii], [true, redRgb], [true, redRgb]], "SIINB");
        }

        // Check and create OGG
        if (oiii !== "Select Image" && green !== "Select Image") {
            createNewImage([[true, oiii], [true, green], [true, green]], "OIIINB");
        }
    }

    // Check if Red (or RGB) is RGB
    if (redRgb !== "Select Image" && ImageWindow.windowById(redRgb).mainView.image.isColor) {
        let redChannel = extractChannel(redRgb, 0, "_R");
        let greenChannel = extractChannel(redRgb, 1, "_G");

        // Check and create HRR
        if (ha !== "Select Image") {
            createNewImage([[true, ha], [true, redChannel], [true, redChannel]], "HaNB");
        }

        // Check and create SRR
        if (sii !== "Select Image") {
            createNewImage([[true, sii], [true, redChannel], [true, redChannel]], "SIINB");
        }

        // Check and create OGG
        if (oiii !== "Select Image") {
            createNewImage([[true, oiii], [true, greenChannel], [true, greenChannel]], "OIIINB");
        }
    }

    // If no images were created, display a message box and return early
    if (createdImages.length === 0) {
        new MessageBox("Please Select Appropriate Emission and Continuum Images", TITLE, StdIcon_Error, StdButton_Ok).execute();
        return null; // Return early to prevent further execution
    }

    // Close the extracted channels
    closeExtractedChannels(extractedChannels);

    return { createdImages: createdImages, backgroundPreviews: backgroundPreviews };
}



// Function to apply background neutralization after finding backgrounds
function applyBackgroundNeutralizationToImages(imagesAndPreviews) {
    let createdImages = imagesAndPreviews.createdImages;
    let backgroundPreviews = imagesAndPreviews.backgroundPreviews;

    for (let i = 0; i < createdImages.length; i++) {
        let imageWindow = ImageWindow.windowById(createdImages[i]);
        applyBackgroundNeutralization(imageWindow, backgroundPreviews[createdImages[i]]);
    }
}

// Function to apply color calibration after background neutralization for Starry mode
function applyColorCalibrationToImagesStarry(imagesAndPreviews) {
    let createdImages = imagesAndPreviews.createdImages;
    let backgroundPreviews = imagesAndPreviews.backgroundPreviews;

    for (let i = 0; i < createdImages.length; i++) {
        let imageWindow = ImageWindow.windowById(createdImages[i]);
        applyColorCalibrationStarry(imageWindow, backgroundPreviews[createdImages[i]]);
    }
}

// Function to apply color calibration after background neutralization for Starless mode
function applyColorCalibrationToImagesStarless(imagesAndPreviews) {
    let createdImages = imagesAndPreviews.createdImages;
    let backgroundPreviews = imagesAndPreviews.backgroundPreviews;
    let whitePointPreviews = {};

    for (let i = 0; i < createdImages.length; i++) {
        let imageWindow = ImageWindow.windowById(createdImages[i]);
        whitePointPreviews[createdImages[i]] = find_white_point(imageWindow);
        applyColorCalibrationStarless(imageWindow, backgroundPreviews[createdImages[i]], whitePointPreviews[createdImages[i]]);
    }
}

// Function to extract emission line data from color-calibrated images
function extractEmissionLineData(imageWindow) {
    console.writeln("Extracting emission line data from image: ", imageWindow.mainView.id);

    let P = new PixelMath;
    P.expression = "$T[0]-Q*($T[1]-med($T[1]))";
    P.expression1 = "";
    P.expression2 = "";
    P.expression3 = "";
    P.useSingleExpression = true;
    P.symbols = "Q=" + qualityMultiplier.toString();
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
    P.createNewImage = false;
    P.showNewImage = true;
    P.newImageId = "";
    P.newImageWidth = 0;
    P.newImageHeight = 0;
    P.newImageAlpha = false;
    P.newImageColorSpace = PixelMath.prototype.Gray;
    P.newImageSampleFormat = PixelMath.prototype.SameAsTarget;
    P.executeOn(imageWindow.mainView);
}

// Function to create a new image with ChannelCombination
function createNewImage(channels, baseLabel) {
    let label = baseLabel;
    let count = 1;
    while (ImageWindow.windowById(label) !== null) {
        label = baseLabel + count.toString();
        count++;
    }

    let P = new ChannelCombination;
    P.colorSpace = ChannelCombination.prototype.RGB;
    P.channels = channels;
    P.inheritAstrometricSolution = true;
    P.executeGlobal();
    let newImage = ImageWindow.activeWindow;
    newImage.mainView.id = label;
    createdImages.push(label);
    createdWindows.push(label); // Track created windows

    // Find background and save preview coordinates
    backgroundPreviews[label] = find_background(newImage);
}

function closeCreatedWindows() {
    for (let i = 0; i < createdWindows.length; i++) {
        let window = ImageWindow.windowById(createdWindows[i]);
        if (window) {
            window.forceClose();
        }
    }
    createdWindows = []; // Clear the list after closing windows
}

// Function to extract pure signal using PixelMath
function extractPureSignal(imageWindow) {
    console.writeln("Extracting pure signal from image: ", imageWindow.mainView.id);

    let P = new PixelMath;
    P.expression = "($T-med($T))/~med($T)";
    P.expression1 = "";
    P.expression2 = "";
    P.expression3 = "";
    P.useSingleExpression = true;
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
    P.createNewImage = false;
    P.showNewImage = true;
    P.executeOn(imageWindow.mainView);
}

function applyNoiseXterminator(imageWindow) {
    try {
        var P = new NoiseXTerminator;

        // Try the file based on the platform
        P.ai_file = NOISEXTERMINATOR_AI_FILE;
        P.denoise = 0.70;
        P.detail = 0.15;
        var success = P.executeOn(imageWindow.mainView, false);

        // If the file is not found, throw an error
        if (!success) {
            throw new Error("NoiseXterminator file not found.");
        }

    } catch (e) {
        var errorMessage = "NoiseXTerminator is not installed or the AI file is not found.\nPlease visit www.rc-astro.com/software/nxt/ to purchase and install it.";
        new MessageBox(errorMessage, "Error", StdIcon_Error, StdButton_Ok).execute();
    }
}

function applyGraXpertDenoise(imageWindow) {
    try {
        var P = new GraXpert;
        P.backgroundExtraction = false;
        P.smoothing = 0.000;
        P.correction = "Subtraction";
        P.createBackground = false;
        P.backgroundExtractionAIModel = "1.0.1";
        P.denoising = true;
        P.strength = 0.700;
        P.batchSize = 4;
        P.denoiseAIModel = ContinuumSubtractionParameters.aiModel || "2.0.0"; // Use selected AI model
        P.disableGPU = false;
        P.replaceImage = true;
        P.showLogs = false;
        P.executeOn(imageWindow.mainView, false);
    } catch (e) {
        var errorMessage = "GraXpert is not installed.\nPlease visit www.deepskyforge.com/index.html to download and install it.";
        new MessageBox(errorMessage, "Error", StdIcon_Error, StdButton_Ok).execute();
    }
}


function applyCurvesBoost(imageWindow){
   let P = new CurvesTransformation;
      P.K = [ // x, y
         [0.00000, 0.00000],
         [0.37500, 0.55000],
         [1.00000, 1.00000]
      ];
      P.Kt = CurvesTransformation.prototype.AkimaSubsplines;
      P.executeOn(imageWindow.mainView);
}


ContinuumSubtractionDialog.prototype.executeScript = function() {
    // Close any previously created images to avoid conflicts
    closeCreatedWindows();

    // Get selected values
    let ha = this.haComboBox.itemText(this.haComboBox.currentItem);
    let oiii = this.oiiiComboBox.itemText(this.oiiiComboBox.currentItem);
    let sii = this.siiComboBox.itemText(this.siiComboBox.currentItem);
    let redRgb = this.redRgbComboBox.itemText(this.redRgbComboBox.currentItem);
    let green = this.greenComboBox.itemText(this.greenComboBox.currentItem);

    // Get selected mode
    let mode = this.starryRadioButton.checked ? "Starry" : "Starless";

    // Set quality multiplier based on selected mode
    qualityMultiplier = this.starryRadioButton.checked ? 0.9 : 1.0;

    // Create images and find background previews
    let imagesAndPreviews = createImagesAndFindBackground(ha, oiii, sii, redRgb, green);

    // Check if images were created successfully
    if (imagesAndPreviews === null) {
        return; // Exit if no images were created
    }

    // Apply background neutralization to images
    applyBackgroundNeutralizationToImages(imagesAndPreviews);

    if (mode === "Starry") {
        // Apply color calibration based on selected mode
        applyColorCalibrationToImagesStarry(imagesAndPreviews);
    } else {
        // Apply color calibration based on selected mode
        applyColorCalibrationToImagesStarless(imagesAndPreviews);
    }

    // Extract emission line data from color-calibrated images
    for (let i = 0; i < imagesAndPreviews.createdImages.length; i++) {
        let imageWindow = ImageWindow.windowById(imagesAndPreviews.createdImages[i]);
        extractEmissionLineData(imageWindow);
    }

        // Ensure images are grayscale after extracting emission line data
    for (let i = 0; i < imagesAndPreviews.createdImages.length; i++) {
        let imageWindow = ImageWindow.windowById(imagesAndPreviews.createdImages[i]);
        convertToGrayscale(imageWindow);
    }

    // Apply denoising if selected
    if (ContinuumSubtractionParameters.applyNoiseReduction) {
        for (let i = 0; i < imagesAndPreviews.createdImages.length; i++) {
            let imageWindow = ImageWindow.windowById(imagesAndPreviews.createdImages[i]);
            if (ContinuumSubtractionParameters.noiseReductionMethod === "NoiseXterminator") {
                applyNoiseXterminator(imageWindow);
            } else if (ContinuumSubtractionParameters.noiseReductionMethod === "GraXpertDenoise") {
                applyGraXpertDenoise(imageWindow);
            }
        }
    }

    console.show();

    if (!ContinuumSubtractionParameters.outputLinearImageOnly) {
        // Apply non-linear stretch to all created images
        for (let i = 0; i < imagesAndPreviews.createdImages.length; i++) {
            let imageWindow = ImageWindow.windowById(imagesAndPreviews.createdImages[i]);
            applyNonLinearStretch(imageWindow);
        }

        // Extract pure signal from all created images
        for (let i = 0; i < imagesAndPreviews.createdImages.length; i++) {
            let imageWindow = ImageWindow.windowById(imagesAndPreviews.createdImages[i]);
            extractPureSignal(imageWindow);
        }

        // Curves Boost on all created images
        for (let i = 0; i < imagesAndPreviews.createdImages.length; i++) {
            let imageWindow = ImageWindow.windowById(imagesAndPreviews.createdImages[i]);
            applyCurvesBoost(imageWindow);
        }
    }

    // Print completion message
    console.noteln("Continuum Subtraction complete! Created: ", imagesAndPreviews.createdImages.join(", "));

    // Close the dialog
    this.ok();
};



// Function to close extracted channels
function closeExtractedChannels(extractedChannels) {
    for (let i = 0; i < extractedChannels.length; i++) {
        let window = ImageWindow.windowById(extractedChannels[i]);
        if (window !== null) {
            window.forceClose();
        }
    }
}


function main() {
    // Require PixInsight 1.9.4 or later (V8 JavaScript runtime).
    CoreApplication.ensureMinimumVersion(1, 9, 4);
Console.criticalln("   ____    __  _   ___       __         \n  / __/__ / /_(_) / _ | ___ / /_______ ");
Console.warningln(" _\\ \\/ -_) __/ / / __ |(_-</ __/ __/ _ \\ \n/___/\\__/\\__/_/ /_/ |_/__/\\__/_/  \\___/ \n                                         ");
    let dialog = new ContinuumSubtractionDialog();
    if (dialog.execute() !== Dialog.prototype.Accepted) {
        console.noteln("Continuum Subtraction Script Dialog Closed.");
    }
}

main();
