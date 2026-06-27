#engine v8  // V8: PixInsight 1.9.4+ routes scripts to the V8 engine; required so this file loads at all.

/******************************************************************************
 *######################################################################
 *#        ___     __      ___       __                                #
 *#       / __/___/ /__   / _ | ___ / /________                        #
 *#      _\ \/ -_) _ _   / __ |(_-</ __/ __/ _ \                       #
 *#     /___/\__/_//_/  /_/ |_/___/\__/_/  \___/                       #
 *#                                                                    #
 *######################################################################
 *
 * Automatic DBE Script
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

#feature-id AutoDBE : Pixinsight-Fixes > Automatic DBE
#feature-icon  adbe.svg
#feature-info This script performs a gradient correction via gradient descent and provides a background ROI

#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/StdCursor.jsh>
// #include <pjsr/Sizer.jsh>  // V8: Sizer/HorizontalSizer/VerticalSizer are native classes now; including this header re-declares them and fails.
#define Align_Expand 0  // V8: was provided by Sizer.jsh (now removed); the only Align_* constant this script uses.
#include <pjsr/FrameStyle.jsh>
// #include <pjsr/NumericControl.jsh>  // V8: NumericControl/NumericEdit are native classes now; including this header re-declares them and fails.
#include <pjsr/TextAlign.jsh>  // V8: TextAlign_* are no longer predefined globals; include the constants header explicitly.

// include constants
#include <pjsr/ImageOp.jsh>
#include <pjsr/SampleType.jsh>
#include <pjsr/UndoFlag.jsh>

#define VERSION "1.6"

// Parameters

// Array to store the end points of all paths
let endPoints = [];

// V8: process enumeration constants moved from <Process>.prototype.<NAME> to static <Process>.<NAME>
// (inconsistently across classes). Resolve static-first, prototype-fallback so the script works on
// both the old SpiderMonkey engine and the new V8 engine.
// V8 renamed many process enum constants two ways, inconsistently across classes:
//   (a) moved from <Process>.prototype.<NAME> to a static <Process>.<NAME>  (e.g. PixelMath.SameAsTarget), and
//   (b) for some classes, prefixed by category, e.g. AutomaticBackgroundExtractor.ModelFormat_f32 /
//       CorrectedFormat_SameAsTarget / Correction_Subtract.
// `category` is an optional disambiguation hint (e.g. "ModelFormat"); needed because bare names like
// "f32"/"SameAsTarget" are ambiguous when a class exposes both ModelFormat_* and CorrectedFormat_*.
function piEnum(processClass, name, category) {
    let candidates = [];
    if (category) candidates.push(category + "_" + name); // V8 category-prefixed static name (tried first)
    candidates.push(name);                                 // bare static / prototype name (old engines, unprefixed classes)
    for (let i = 0; i < candidates.length; i++) {
        let c = candidates[i];
        if (processClass[c] !== undefined)
            return processClass[c];
        if (processClass.prototype && processClass.prototype[c] !== undefined)
            return processClass.prototype[c];
    }
    // Fallback: find a unique static constant ending in "_<name>" (handles unforeseen prefixes).
    let suffix = "_" + name;
    let matches = Object.getOwnPropertyNames(processClass).filter(function(n) {
        return n === name || n.slice(-suffix.length) === suffix;
    });
    if (matches.length === 1)
        return processClass[matches[0]];

    // Diagnostic: dump every property that looks like an enum constant so we can see the real name/value.
    try {
        let dump = function(label, obj) {
            if (!obj) return;
            let names = Object.getOwnPropertyNames(obj).filter(function(n) {
                return /^[A-Za-z]/.test(n) && typeof obj[n] !== "function";
            });
            console.warningln(label + ": " + names.map(function(n) {
                return n + "=" + obj[n];
            }).join(", "));
        };
        console.warningln("piEnum could not resolve '" + name + "'" +
            (category ? " (category '" + category + "')" : "") +
            (matches.length > 1 ? " — ambiguous, matched: " + matches.join(", ") : "") +
            ". Available constants:");
        dump("  static", processClass);
        dump("  prototype", processClass.prototype);
    } catch (e) { /* ignore diagnostic failures */ }
    throw new Error("Unresolved process constant: " + name);
}

let GradientDescentParameters = {
    targetView: undefined,
    descentPathsInput: 50,
    tolerance: 2.0, // Default value for P.tolerance
    defaultSampleRadius: 10,
    smoothing: 0.25, // Default value for P.defaultSampleRadius
    overrideSampleRadius: false,
    overrideSmoothing: false,
    replaceTarget: false, // Default is false
    discardModel: false,  // Default is true (Show Gradient Extracted is checked by default)
    enableSimplifiedInitialModelling: true, // Default is true
    rigidlyFixCornerPoints: false, // Default is false
    polynomialDegree: 1,
    correctionType: piEnum(DynamicBackgroundExtraction, "Subtract", "Correction"),

    load: function() {
        if (Parameters.has("descentPathsInput"))
            this.descentPathsInput = Parameters.getInteger("descentPathsInput");
        if (Parameters.has("tolerance"))
            this.tolerance = Parameters.getReal("tolerance");
        if (Parameters.has("defaultSampleRadius"))
            this.defaultSampleRadius = Parameters.getInteger("defaultSampleRadius");
        if (Parameters.has("smoothing"))
            this.smoothing = Parameters.getReal("smoothing");
        if (Parameters.has("overrideSampleRadius"))
            this.overrideSampleRadius = Parameters.getBoolean("overrideSampleRadius");
        if (Parameters.has("overrideSmoothing"))
            this.overrideSmoothing = Parameters.getBoolean("overrideSmoothing");
        if (Parameters.has("targetView"))
            this.targetView = Parameters.get("targetView");
        if (Parameters.has("replaceTarget"))
            this.replaceTarget = Parameters.getBoolean("replaceTarget");
        if (Parameters.has("discardModel"))
            this.discardModel = Parameters.getBoolean("discardModel");
        if (Parameters.has("enableSimplifiedInitialModelling"))
            this.enableSimplifiedInitialModelling = Parameters.getBoolean("enableSimplifiedInitialModelling");
        if (Parameters.has("rigidlyFixCornerPoints"))
            this.rigidlyFixCornerPoints = Parameters.getBoolean("rigidlyFixCornerPoints");
        if (Parameters.has("polynomialDegree"))
            this.polynomialDegree = Parameters.getInteger("polynomialDegree");
        else
            this.polynomialDegree = 1; // Default value

        // Load correction type
        if (Parameters.has("correctionType")) {
            let correctionType = Parameters.getInteger("correctionType");
            if (correctionType === piEnum(DynamicBackgroundExtraction, "Subtract", "Correction") ||
                correctionType === piEnum(DynamicBackgroundExtraction, "Divide", "Correction")) {
                this.correctionType = correctionType;
            } else {
                this.correctionType = piEnum(DynamicBackgroundExtraction, "Subtract", "Correction"); // Default to Subtract
            }
        } else {
            this.correctionType = piEnum(DynamicBackgroundExtraction, "Subtract", "Correction"); // Default to Subtract
        }
    },

    save: function() {
        Parameters.set("descentPathsInput", this.descentPathsInput);
        Parameters.set("tolerance", this.tolerance);
        Parameters.set("defaultSampleRadius", this.defaultSampleRadius);
        Parameters.set("smoothing", this.smoothing);
        Parameters.set("overrideSampleRadius", this.overrideSampleRadius);
        Parameters.set("overrideSmoothing", this.overrideSmoothing);
        Parameters.set("replaceTarget", this.replaceTarget);
        Parameters.set("discardModel", this.discardModel);
        Parameters.set("enableSimplifiedInitialModelling", this.enableSimplifiedInitialModelling);
        Parameters.set("rigidlyFixCornerPoints", this.rigidlyFixCornerPoints);
        Parameters.set("correctionType", this.correctionType);
        Parameters.set("polynomialDegree", this.polynomialDegree);
        if (this.targetView)
            Parameters.set("targetView", this.targetView.id);
    }
};



//let userDefinedRegions = null; // To store the user-defined region
let isDragging = false;
let startX, startY;

let constants =
{
    indent: 20,
    minLabelSize: 170
}

//let points = generate_starting_points_with_brightness(image_width, image_height, window_size, num_points, var_image, channels, exclusionAreas);

// Define mergeOverlappingRegions, isOverlapping, and mergeRegions functions
function mergeOverlappingRegions(regions) {
    let mergedRegions = [];
    for (let i = 0; i < regions.length; i++) {
        let region = regions[i];
        let isMerged = false;
        for (let j = 0; j < mergedRegions.length; j++) {
            if (isOverlapping(region, mergedRegions[j])) {
                mergedRegions[j] = mergeRegions(region, mergedRegions[j]);
                isMerged = true;
                break;
            }
        }
        if (!isMerged) {
            mergedRegions.push(region);
        }
    }
    return mergedRegions;
}

function isOverlapping(rect1, rect2) {
    return !(rect1.right < rect2.left || rect1.left > rect2.right || rect1.bottom < rect2.top || rect1.top > rect2.bottom);
}

function mergeRegions(rect1, rect2) {
    return new Rect(
        Math.min(rect1.left, rect2.left),
        Math.min(rect1.top, rect2.top),
        Math.max(rect1.right, rect2.right),
        Math.max(rect1.bottom, rect2.bottom)
    );
}



function normalizeRect(rect) {
    let left = Math.min(rect.left, rect.right);
    let top = Math.min(rect.top, rect.bottom);
    let right = Math.max(rect.left, rect.right);
    let bottom = Math.max(rect.top, rect.bottom);
    return new Rect(left, top, right, bottom);
}

function clampRectToBounds(rect, imageWidth, imageHeight) {
    let left = Math.max(0, Math.min(rect.left, imageWidth));
    let top = Math.max(0, Math.min(rect.top, imageHeight));
    let right = Math.max(0, Math.min(rect.right, imageWidth));
    let bottom = Math.max(0, Math.min(rect.bottom, imageHeight));
    return new Rect(left, top, right, bottom);
}

class ScrollControl extends ScrollBox {  // V8: ScrollBox is a real ES6 class; the __base__ idiom fails. Use class/super.
  constructor(parent) {
    super(parent);

    this.autoScroll = true;
    this.tracking = true;

    this.displayImage = null;
    this.dragging = false;
    this.dragOrigin = new Point(0);
    this.isDragging = false; // Flag for detecting dragging
    this.userDefinedRegions = [];
    this.exclusionAreas = []; // Initialize exclusion areas
    this.currentRegion = null;
    this.startX = 0;
    this.startY = 0;
    this.scrollPosition = new Point(0, 0); // Ensure scrollPosition is always defined

    this.viewport.cursor = new Cursor(StdCursor_Cross);

    this.getImage = function() {
        return this.displayImage;
    };

    this.doUpdateImage = function(image) {
        this.displayImage = image;
        this.initScrollBars();
        if (this.viewport) {
            this.viewport.update();
        }
    };

    this.initScrollBars = function() {
        var image = this.getImage();
        if (image == null || image.width <= 0 || image.height <= 0) {
            this.setHorizontalScrollRange(0, 0);
            this.setVerticalScrollRange(0, 0);
        } else {
            this.setHorizontalScrollRange(0, Math.max(0, image.width - this.viewport.width));
            this.setVerticalScrollRange(0, Math.max(0, image.height - this.viewport.height));
        }
        if (this.viewport) {
            this.viewport.update();
        }
    };

    this.viewport.onResize = function() {
        if (this.parent) {
            this.parent.initScrollBars();
        }
    };

    this.onHorizontalScrollPosUpdated = function(x) {
        if (this.viewport) {
            this.viewport.update();
        }
    };

    this.onVerticalScrollPosUpdated = function(y) {
        if (this.viewport) {
            this.viewport.update();
        }
    };

    this.viewport.onMousePress = function(x, y, button, buttons, modifiers) {
        var parent = this.parent; // Store reference to parent
        if (modifiers === 1) { // Shift key detection
            parent.startX = x + parent.scrollPosition.x;
            parent.startY = y + parent.scrollPosition.y;
            parent.isDragging = true;
            parent.dragging = false; // Prevent scrolling while drawing
        } else {
            this.cursor = new Cursor(StdCursor_ClosedHand);
            parent.dragOrigin.x = x;
            parent.dragOrigin.y = y;
            parent.dragging = true;
        }
    };

    this.viewport.onMouseMove = function(x, y, buttons, modifiers) {
        var parent = this.parent; // Store reference to parent
        if (!parent) return;
        if (parent.isDragging) {
            // Update current region while dragging
            parent.currentRegion = clampRectToBounds(
                normalizeRect(new Rect(parent.startX, parent.startY, x + parent.scrollPosition.x, y + parent.scrollPosition.y)),
                parent.displayImage.width,
                parent.displayImage.height
            );
            if (parent.viewport) {
                parent.viewport.update(); // Use parent reference and check if valid
            }
        } else if (parent.dragging) {
            parent.scrollPosition = new Point(parent.scrollPosition).translatedBy(parent.dragOrigin.x - x, parent.dragOrigin.y - y);
            parent.dragOrigin.x = x;
            parent.dragOrigin.y = y;
            parent.viewport.update(); // Ensure the viewport updates during dragging
        }
    };

    this.viewport.onMouseRelease = function(x, y, button, buttons, modifiers) {
        var parent = this.parent; // Store reference to parent
        if (!parent) return;
        if (parent.isDragging) {
            parent.isDragging = false;
            // Finalize the current region
            let finalRegion = clampRectToBounds(
                normalizeRect(new Rect(parent.startX, parent.startY, x + parent.scrollPosition.x, y + parent.scrollPosition.y)),
                parent.displayImage.width,
                parent.displayImage.height
            );
            parent.userDefinedRegions.push(finalRegion);
            parent.currentRegion = null;
            if (parent.viewport) {
                parent.viewport.update(); // Use parent reference and check if valid
            }
            // Invoke the completion handler
            parent.onRectangleSelectionComplete();
        } else {
            this.cursor = new Cursor(StdCursor_Cross);
            parent.dragging = false;
        }
    };

    // Function to handle the completion of the rectangle selection and scale coordinates
    this.onRectangleSelectionComplete = function() {
        if (this.userDefinedRegions.length > 0) {
            let downsamplingFactor = this.parent.downsamplingFactor; // Access the parent's downsamplingFactor
            this.userDefinedRegions.forEach(function(region, index) {
                let scaledRegion = new Rect(
                    region.left * downsamplingFactor,
                    region.top * downsamplingFactor,
                    region.right * downsamplingFactor,
                    region.bottom * downsamplingFactor
                );

                console.writeln("Region " + (index + 1) + " (scaled):");
                console.writeln("Top-left: (" + scaledRegion.left + ", " + scaledRegion.top + ")");
                console.writeln("Bottom-right: (" + scaledRegion.right + ", " + scaledRegion.bottom + ")");
            });
// Pass the scaled regions to executeGradientDescent
        executeGradientDescent(GradientDescentParameters.targetView, scaledRegions);
        }
    };



this.viewport.onPaint = function(x0, y0, x1, y1) {
    var g = new Graphics(this);
    var result = this.parent.getImage();
    if (result == null) {
        g.fillRect(x0, y0, x1, y1, new Brush(0xff000000));
    } else {
        result.selectedRect = new Rect(x0, y0, x1, y1).translated(this.parent.scrollPosition);
        g.drawBitmap(x0, y0, result.render());
        result.resetRectSelection();

        // Draw the user-defined regions if they exist
        this.parent.userDefinedRegions.forEach(function(region) {
            let color = 0xffff0000; // Default to Green
                        g.pen = new Pen(color);
            g.drawRect(region.translatedBy(-this.parent.scrollPosition.x, -this.parent.scrollPosition.y));
        }.bind(this));

        // Draw the current region if it exists
        if (this.parent.currentRegion) {
            let color = 0xffff0000; // Default to Green
            g.pen = new Pen(color);
            g.drawRect(this.parent.currentRegion.translatedBy(-this.parent.scrollPosition.x, -this.parent.scrollPosition.y));
        }

        // Draw the exclusion areas if they exist
        this.parent.exclusionAreas.forEach(function(area) {
            g.pen = new Pen(0xff0000ff); // Blue color for the exclusion areas
            g.drawRect(area.translatedBy(-this.parent.scrollPosition.x, -this.parent.scrollPosition.y));
        }.bind(this));
    }
        g.end();
        gc();
    };

    this.initScrollBars();
  }
}

// Function to calculate window size
function calculate_window_size(image_height, overrideSampleRadius, userDefinedSize) {
    if (overrideSampleRadius) {
        return userDefinedSize * 2; // Double the user-defined size for the window size
    } else {
        return Math.min(Math.round(image_height * 0.015), 30); // Default calculation
    }
}

// Function to calculate spacing
function calculate_spacing(window_size) {
    return Math.ceil(window_size * 0.5); // Increase spacing to cover fewer regions
}

function get_average_pixel_brightness(var_image, x, y, channels) {
    if (channels == 1) {
        return var_image.sample(x, y, 0); // Single channel (greyscale)
    } else {
        return (var_image.sample(x, y, 0) + var_image.sample(x, y, 1) + var_image.sample(x, y, 2)) / 3; // Color image
    }
}

// Function to get window statistics for a color image
function get_window_stats(var_image, x, y, window_size, channels, tolerance) {
    let pixel_values = [];
    for (let c = 0; c < channels; c++) {
        pixel_values.push([]);
    }

    for (let offset_x = 0; offset_x < window_size; offset_x++) {
        for (let offset_y = 0; offset_y < window_size; offset_y++) {
            for (let c = 0; c < channels; c++) {
                let brightness = var_image.sample(x + offset_x, y + offset_y, c);
                pixel_values[c].push(brightness);
            }
        }
    }

    let average_brightness = [];
    let stddev = [];
    let mad = [];
    let median_brightness = [];

    for (let c = 0; c < channels; c++) {
        let mean = pixel_values[c].reduce((a, b) => a + b, 0) / pixel_values[c].length;
        let variance = pixel_values[c].reduce((a, b) => a + Math.pow(b - mean, 2), 0) / pixel_values[c].length;
        let sigma = Math.sqrt(variance);

        // Apply tolerance-based rejection
        let filtered_values = pixel_values[c].filter(value => Math.abs(value - mean) <= tolerance * sigma);

        let new_mean = filtered_values.reduce((a, b) => a + b, 0) / filtered_values.length;
        let new_variance = filtered_values.reduce((a, b) => a + Math.pow(b - new_mean, 2), 0) / filtered_values.length;
        let new_sigma = Math.sqrt(new_variance);

        filtered_values.sort((a, b) => a - b);
        let new_median = filtered_values[Math.floor(filtered_values.length / 2)];

        average_brightness.push(new_mean);
        stddev.push(new_sigma);
        median_brightness.push(new_median);

        let mad_sum = 0;
        for (let i = 0; i < filtered_values.length; i++) {
            mad_sum += Math.abs(filtered_values[i] - new_median);
        }
        mad.push(mad_sum / filtered_values.length);
    }

    return {
        average: average_brightness,
        stddev: stddev,
        median: median_brightness,
        mad: mad
    };
}


// Function to generate random starting points spread evenly across the image after filtering quartiles
function generate_starting_points_with_brightness(image_width, image_height, window_size, num_points, var_image, channels, exclusionAreas) {
    let points = [];
    let quartile_width = Math.floor(image_width / 2);
    let quartile_height = Math.floor(image_height / 2);
    let search_region_size = 100;

    // Define regions for quartiles
    let quartiles = [
        { startX: 0, startY: 0 },
        { startX: quartile_width, startY: 0 },
        { startX: 0, startY: quartile_height },
        { startX: quartile_width, startY: quartile_height }
    ];

    // Number of points to be generated in each quartile
    let points_per_quartile = Math.ceil(num_points / quartiles.length);

    // Container for eligible regions after filtering
    let eligibleRegions = [];

    // Process each quartile
    quartiles.forEach(quartile => {
        let grid_brightness = [];
        for (let x = quartile.startX; x < quartile.startX + quartile_width; x += search_region_size) {
            for (let y = quartile.startY; y < quartile.startY + quartile_height; y += search_region_size) {
                let region = { left: x, top: y, right: x + search_region_size, bottom: y + search_region_size };

                // Check if the region overlaps with any exclusion area
                if (exclusionAreas.some(exclusionArea => isOverlapping(region, exclusionArea))) {
                    continue;
                }

                let avg_brightness = 0;
                let count = 0;
                for (let dx = 0; dx < search_region_size && (x + dx) < image_width; dx++) {
                    for (let dy = 0; dy < search_region_size && (y + dy) < image_height; dy++) {
                        avg_brightness += get_average_pixel_brightness(var_image, x + dx, y + dy, channels);
                        count++;
                    }
                }
                if (count > 0) {
                    avg_brightness /= count;
                    grid_brightness.push({ x: x, y: y, avg_brightness: avg_brightness });
                }
            }
        }

        // Sort and filter out the 50% brightest
        grid_brightness.sort((a, b) => a.avg_brightness - b.avg_brightness);
        let filtered_regions = grid_brightness.slice(0, Math.floor(grid_brightness.length * 2/3));

        // Shuffle the eligible regions to ensure randomness
        filtered_regions.sort(() => Math.random() - 0.5);

        // Limit the number of points in this quartile
        filtered_regions.slice(0, points_per_quartile).forEach(region => {
            let x = Math.floor(region.x + Math.random() * (search_region_size - window_size));
            let y = Math.floor(region.y + Math.random() * (search_region_size - window_size));

            // Ensure the point is within image bounds
            x = Math.min(x, image_width - window_size);
            y = Math.min(y, image_height - window_size);

            // Check if the point falls within any exclusion area
            let point = { left: x, top: y, right: x + window_size, bottom: y + window_size };
            if (!exclusionAreas.some(exclusionArea => isOverlapping(point, exclusionArea))) {
                points.push({ x: x, y: y });
            }
        });

        // Add the filtered regions to eligibleRegions
        for (let i = 0; i < filtered_regions.length; i++) {
            eligibleRegions.push(filtered_regions[i]);
        }
    });

    // If the total number of points exceeds num_points, truncate the list to the specified number of points
    if (points.length > num_points) {
        points = points.slice(0, num_points);
    }

    return points;
}


//debug function for displaingpoints
function debugDisplayPoints(points, image_width, image_height, exclusionAreas) {
    console.writeln("Displaying generated points:");
    for (let i = 0; i < points.length; i++) {
        console.writeln("Point " + (i + 1) + ": (" + points[i].x + ", " + points[i].y + ")");
    }

    console.writeln("Exclusion areas:");
    for (let i = 0; i < exclusionAreas.length; i++) {
        console.writeln("Exclusion Area " + (i + 1) + ": (" + exclusionAreas[i].left + ", " + exclusionAreas[i].top + ") to (" + exclusionAreas[i].right + ", " + exclusionAreas[i].bottom + ")");
    }

    let debugImage = new ImageWindow(image_width, image_height, 1, 8, false, false, "debugPoints");
    debugImage.mainView.beginProcess(UndoFlag_NoSwapFile);
    debugImage.mainView.image.fill(0); // Set the background to black
    debugImage.mainView.endProcess();

    debugImage.mainView.beginProcess();
    for (let i = 0; i < points.length; i++) {
        let startX = Math.max(0, points[i].x - 4);
        let startY = Math.max(0, points[i].y - 4);
        let endX = Math.min(image_width - 1, points[i].x + 4);
        let endY = Math.min(image_height - 1, points[i].y + 4);

        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                debugImage.mainView.image.setSample(1, x, y); // Set the point to white
            }
        }
    }

    for (let i = 0; i < exclusionAreas.length; i++) {
        for (let x = exclusionAreas[i].left; x < exclusionAreas[i].right; x++) {
            for (let y = exclusionAreas[i].top; y < exclusionAreas[i].bottom; y++) {
                debugImage.mainView.image.setSample(0.5, x, y); // Set the exclusion area to grey
            }
        }
    }
    debugImage.mainView.endProcess();

    debugImage.show();
}



// Ensure points do not overlap exclusion zones
function isPointValid(point, window_size, exclusionAreas) {
    let pointRect = {
        left: point.x,
        top: point.y,
        right: point.x + window_size,
        bottom: point.y + window_size
    };

    return !exclusionAreas.some(exclusionArea => isOverlapping(pointRect, exclusionArea));
}

function find_best_window(var_image, start_x, start_y, window_size, spacing, channels, tolerance) {
    let best_window = {
        average: [],
        stddev: [],
        mad: [],
        mean: [],
        x: start_x,
        y: start_y
    };
    for (let c = 0; c < channels; c++) {
        best_window.average.push(1000000000);
        best_window.stddev.push(1000000000);
        best_window.mad.push(1000000000);
        best_window.mean.push(1000000000);
    }

    let current_x = start_x;
    let current_y = start_y;
    let improved = true;

    while (improved) {
        improved = false;
        for (let offset_x = -1; offset_x <= 1; offset_x++) {
            for (let offset_y = -1; offset_y <= 1; offset_y++) {
                let new_x = current_x + offset_x * spacing;
                let new_y = current_y + offset_y * spacing;
                if (new_x >= 0 && new_x + window_size <= var_image.width &&
                    new_y >= 0 && new_y + window_size <= var_image.height) {
                    let stats = get_window_stats(var_image, new_x, new_y, window_size, channels, tolerance);
                    let stats_mean_sum = stats.average.reduce((a, b) => a + b, 0);
                    let best_window_mean_sum = best_window.mean.reduce((a, b) => a + b, 0);
                    let stats_stddev_sum = stats.stddev.reduce((a, b) => a + b, 0);
                    let best_window_stddev_sum = best_window.stddev.reduce((a, b) => a + b, 0);

                    if (stats_mean_sum < best_window_mean_sum ||
                        (stats_mean_sum === best_window_mean_sum && stats_stddev_sum < best_window_stddev_sum)) {
                        best_window = {
                            average: stats.average,
                            stddev: stats.stddev,
                            mad: stats.mad,
                            mean: stats.average,
                            x: new_x,
                            y: new_y
                        };
                        improved = true;
                    }
                }
            }
        }
        current_x = best_window.x;
        current_y = best_window.y;
    }

    // Store the end point of this path with its average values and MAD for each channel
    endPoints.push({ x: best_window.x, y: best_window.y, average: best_window.average, mad: best_window.mad });

    return best_window;
}


// Updated function to calculate the median of the entire image
function calculate_image_median(var_image) {
    return var_image.median();
}

// Function to calculate standard deviation for the entire image
function calculate_image_stddev(var_image) {
    return var_image.stdDev();
}

function random_starting_point(image_width, image_height, window_size, exclusionAreas) {
    let point;
    do {
        let x = Math.floor(Math.random() * (image_width - window_size));
        let y = Math.floor(Math.random() * (image_height - window_size));
        point = { x: x, y: y };
    } while (!isPointValid(point, window_size, exclusionAreas));
    return point;
}

// Function to get the current list of image window IDs
function getImageWindowIds() {
    return ImageWindow.windows.map(window => window.mainView.id);
}



// Function to execute Gradient Descent
function executeGradientDescent(targetView, exclusionAreas) {
    if (!targetView) throw new Error("No target image selected!");

    let sourceImage = targetView.image;
    if (sourceImage.isNull) throw new Error("No image found in the target view!");

    let channels = sourceImage.numberOfChannels;

    // Ensure `exclusionAreas` is an array
    exclusionAreas = exclusionAreas || [];

    // Function to get all existing image IDs
    function getAllImageIDs() {
        var windows = ImageWindow.windows;
        var ids = [];
        for (var i = 0; i < windows.length; ++i) {
            ids.push(windows[i].mainView.id);
        }
        return ids;
    }

    // Function to check if an ID exists in an array
    function idExists(id, idArray) {
        for (var i = 0; i < idArray.length; i++) {
            if (idArray[i] === id) {
                return true;
            }
        }
        return false;
    }

    // Function to generate a unique ID with the _ADBE suffix
    function getUniqueID(baseID, existingIDs) {
        let uniqueID = baseID;
        let counter = 1;

        // Generate a list of potential IDs
        let potentialIDs = [baseID];
        for (var i = 1; i <= 99; i++) {
            potentialIDs.push(baseID + "_" + (i < 10 ? "0" : "") + i);
        }

        // Find the first unique ID that is not in the existing IDs
        for (var j = 0; j < potentialIDs.length; j++) {
            if (!idExists(potentialIDs[j], existingIDs)) {
                return potentialIDs[j];
            }
        }

        // If all potential IDs are taken, return a default ID (fallback)
        return baseID + "_99";
    }

    // Ensure that the source image is correctly assigned
    let activeWindow = ImageWindow.activeWindow;
    sourceImage = activeWindow.mainView.image;  // V8: reassign (sourceImage already declared with let above); a second `let` is a redeclaration error.

    // If replaceTarget is unchecked, create a new image and use it for all operations
    if (!GradientDescentParameters.replaceTarget) {
        var existingIDs = getAllImageIDs(); // Get all image IDs before creating the new image

        let originalID = targetView.id; // Ensure correct retrieval of original image ID
        if (!originalID) {
            console.criticalln("Error: Unable to retrieve the original image ID.");
        } else {
            console.writeln("Original Image ID: " + originalID); // Debug output
        }

        let baseID = originalID + "_ADBE";
        let newID = getUniqueID(baseID, existingIDs);

        let newWindow = new ImageWindow(
            sourceImage.width,
            sourceImage.height,
            sourceImage.numberOfChannels,
            sourceImage.bitsPerSample,
            sourceImage.isReal,
            sourceImage.isColor
        );

        newWindow.mainView.beginProcess();
        newWindow.mainView.image.assign(sourceImage);
        newWindow.mainView.endProcess();
        newWindow.mainView.id = newID;  // Assign the unique ID here
        newWindow.show();

        console.writeln("New Image ID: " + newID); // Debug output

        targetView = newWindow.mainView;
        sourceImage = targetView.image;

        // Copy astrometric solution from the original image to the new image
        if (activeWindow.hasAstrometricSolution) {
            newWindow.copyAstrometricSolution(activeWindow);
            console.noteln("Astrometric solution copied from: ", activeWindow.mainView.id);
            console.noteln("Astrometric solution copied to: ", newWindow.mainView.id);
        } else {
            console.warningln("Original image has no astrometric solution to copy.");
        }

        // Copy FITS header keywords from the original image to the new image
        newWindow.keywords = activeWindow.keywords;
        console.noteln("FITS header keywords copied from: ", activeWindow.mainView.id);
        console.noteln("FITS header keywords copied to: ", newWindow.mainView.id);
    }

    if (channels > 1) {
        var P = new BackgroundNeutralization;
        P.backgroundReferenceViewId = "";
        P.backgroundLow = 0.0000000;
        P.backgroundHigh = 0.1200000;
        P.useROI = false;
        P.roiX0 = 0;
        P.roiY0 = 0;
        P.roiX1 = 0;
        P.roiY1 = 0;
        P.mode = piEnum(BackgroundNeutralization, "RescaleAsNeeded");
        P.targetBackground = 0.0010000;
        P.executeOn(targetView);
    }

    // Get the list of image windows before ABE execution
    let windowsBeforeABE = getAllImageIDs();
    let abeBackgroundWindow = null;

    // Execute ABE and generate its background image only if enabled
    if (GradientDescentParameters.enableSimplifiedInitialModelling) {
        var P = new AutomaticBackgroundExtractor;
        P.tolerance = 1.000;
        P.deviation = 0.800;
        P.unbalance = 1.800;
        P.minBoxFraction = 0.050;
        P.maxBackground = 1.0000;
        P.minBackground = 0.0000;
        P.useBrightnessLimits = false;
        P.polyDegree = GradientDescentParameters.polynomialDegree; // Updated here
        P.boxSize = 5;
        P.boxSeparation = 5;
        P.modelImageSampleFormat = piEnum(AutomaticBackgroundExtractor, "f32", "ModelFormat");
        P.abeDownsample = 2.00;
        P.writeSampleBoxes = false;
        P.justTrySamples = false;
        P.targetCorrection = piEnum(AutomaticBackgroundExtractor, "Subtract", "Correction");
        P.normalize = true;
        P.discardModel = GradientDescentParameters.discardModel;
        P.replaceTarget = true;
        P.correctedImageId = "";
        P.correctedImageSampleFormat = piEnum(AutomaticBackgroundExtractor, "SameAsTarget", "CorrectedFormat");
        P.verboseCoefficients = false;
        P.compareModel = false;
        P.compareFactor = 10.00;
        P.executeOn(targetView);

        // Get the list of image windows after ABE execution
        let windowsAfterABE = getAllImageIDs();

        // Find the new ABE background image window
        for (let id of windowsAfterABE) {
            if (windowsBeforeABE.indexOf(id) === -1) {
                abeBackgroundWindow = ImageWindow.windowById(id);
                break;
            }
        }

        if (abeBackgroundWindow) {
            abeBackgroundWindow.hide();
        }
    }

    console.show();
    console.noteln("Calculating Image Statistics");
    console.flush();
    let window_size = calculate_window_size(
        sourceImage.height,
        GradientDescentParameters.overrideSampleRadius,
        GradientDescentParameters.defaultSampleRadius
        );
    let spacing = calculate_spacing(window_size);

    if (window_size <= 0 || spacing <= 0) throw new Error("Invalid window size or spacing!");

    let best_overall_window = null;
    let completed_paths = 0;
    let final_brightnesses = [];
    let endPoints = [];

    console.noteln("Exclusion Areas: ", JSON.stringify(exclusionAreas));

   let user_defined_paths = parseInt(GradientDescentParameters.descentPathsInput, 10);
    if (isNaN(user_defined_paths) || user_defined_paths < 0) {
        user_defined_paths = 50; // Default value if input is invalid or less than 0
    }
    let total_paths = user_defined_paths + 12;

    let random_points = generate_starting_points_with_brightness(
        sourceImage.width,
        sourceImage.height,
        window_size,
        user_defined_paths,
        sourceImage,
        channels,
        exclusionAreas
    );

    // Debug display of points
    //debugDisplayPoints(random_points, sourceImage.width, sourceImage.height, exclusionAreas);

    let edge_points = [
        { x: 10, y: 10 }, // Top-left corner
        { x: sourceImage.width - window_size - 10, y: 10 }, // Top-right corner
        { x: 10, y: sourceImage.height - window_size - 10 }, // Bottom-left corner
        { x: sourceImage.width - window_size - 10, y: sourceImage.height - window_size - 10 }, // Bottom-right corner
        { x: sourceImage.width / 2 - window_size / 2, y: 10 },
        { x: sourceImage.width / 2 - window_size / 2, y: sourceImage.height - window_size - 10 },
        { x: 10, y: sourceImage.height / 2 - window_size / 2 },
        { x: sourceImage.width - window_size - 10, y: sourceImage.height / 2 - window_size / 2 },
        { x: sourceImage.width / 4 - window_size / 2, y: 10 },
        { x: 3 * sourceImage.width / 4 - window_size / 2, y: 10 },
        { x: sourceImage.width / 4 - window_size / 2, y: sourceImage.height - window_size - 10 },
        { x: 3 * sourceImage.width / 4 - window_size / 2, y: sourceImage.height - window_size - 10 }
    ];

    let starting_points = edge_points.concat(random_points);

    let tolerance = GradientDescentParameters.tolerance;

    function performGradientDescent(threshold, max_threshold, starting_points) {
        console.noteln("Starting Gradient Descent Path Algorithm");
        console.write(starting_points.length + " total paths (User Defined Amount plus 12 Edge Starting Paths). Completed: ");
        console.flush();

        let progress_interval = Math.ceil(starting_points.length / 10);
        completed_paths = 0;

        for (let i = 0; i < starting_points.length; i++) {
            let starting_point = starting_points[i];

            // Check if the starting point is in the exclusion zone
            if (isPointInExclusionZone(starting_point.x, starting_point.y, exclusionAreas)) {
                continue; // Skip this starting point
            }

            while (get_window_stats(sourceImage, starting_point.x, starting_point.y, window_size, channels).average.some(avg => avg >= threshold)) {
                starting_point = random_starting_point(sourceImage.width, sourceImage.height, window_size, exclusionAreas);

                // Check if the new random starting point is in the exclusion zone
                if (isPointInExclusionZone(starting_point.x, starting_point.y, exclusionAreas)) {
                    continue; // Skip this starting point
                }
            }

            let best_window = find_best_window(sourceImage, starting_point.x, starting_point.y, window_size, spacing, channels, tolerance);

            let exceeds_max_threshold = best_window.average.some(avg => avg > max_threshold);
            if (!exceeds_max_threshold) {
                if (!best_overall_window ||
                    best_window.average.reduce((sum, val) => sum + val, 0) < best_overall_window.average.reduce((sum, val) => sum + val, 0) ||
                    (best_window.average.reduce((sum, val) => sum + val, 0) === best_overall_window.average.reduce((sum, val) => sum + val, 0) &&
                        best_window.stddev.reduce((sum, val) => sum + val, 0) < best_overall_window.stddev.reduce((sum, val) => sum + val, 0))) {
                    best_overall_window = best_window;
                }

                completed_paths++;

                let region_brightness = best_window.average.reduce((sum, val) => sum + val, 0) / channels;
                final_brightnesses.push(region_brightness);

                // Store the end point with channel-specific weights based on mean brightness
                let weights = best_window.average.map(avg => avg / image_median);
                endPoints.push({
                    x: best_window.x,
                    y: best_window.y,
                    average: best_window.average,
                    mad: best_window.mad,
                    weights: weights
                });
            }

            if ((i + 1) % progress_interval === 0 || i === starting_points.length - 1) {
                console.write(Math.ceil(((i + 1) / starting_points.length) * 100) + "%... ");
                console.flush();
            }
        }
    }

    function isPointInExclusionZone(x, y, exclusionAreas) {
        for (let area of exclusionAreas) {
            if (x >= area.left && x <= area.right && y >= area.top && y <= area.bottom) {
                return true;
            }
        }
        return false;
    }

    let image_median = calculate_image_median(sourceImage);
    let image_stddev = calculate_image_stddev(sourceImage);
    let threshold = image_median + 0.3 * image_stddev;
    let max_threshold = image_median + 0.15 * image_stddev;

    console.writeln("Image median: " + image_median);
    console.writeln("Image standard deviation: " + image_stddev);

    performGradientDescent(threshold, max_threshold, starting_points);

    if (!best_overall_window) {
        console.noteln("All Starting Points Rejected, Restarting with Expanded Tolerances");
        threshold = 2 * image_median;
        max_threshold = image_median + 2 * image_stddev;
        performGradientDescent(threshold, max_threshold, starting_points);
    }

    if (!best_overall_window) {
        throw new Error("All starting points were rejected, even with expanded tolerances.");
    }

    let center_x = best_overall_window.x + window_size / 2;
    let center_y = best_overall_window.y + window_size / 2;

    let median_brightness = calculate_median(final_brightnesses);
    let mad = calculate_mad(final_brightnesses, median_brightness);
    console.writeln("calculated MAD: " + mad);

    let normalized_mad = 15 * 1.4826 * mad / image_median;
    console.writeln("Normalized MAD :" + normalized_mad);

    let smoothing_factor = 0.15 + (0.5 - 0.15) * (1 - normalized_mad);
    console.writeln("Calculated smoothing factor: " + smoothing_factor);

    smoothing_factor = Math.max(0.15, Math.min(0.5, smoothing_factor));

    let brightness_array = [];
    for (let c = 0; c < channels; c++) {
        brightness_array[c] = 0;
    }

    for (let offset_x = 0; offset_x < window_size; offset_x++) {
        for (let offset_y = 0; offset_y < window_size; offset_y++) {
            for (let c = 0; c < channels; c++) {
                brightness_array[c] += sourceImage.sample(best_overall_window.x + offset_x, best_overall_window.y + offset_y, c);
            }
        }
    }

    for (let c = 0; c < channels; c++) brightness_array[c] /= window_size;

    let highest_value = brightness_array[0];
    for (let c = 1; c < channels; c++) {
        if (brightness_array[c] > highest_value) highest_value = brightness_array[c];
    }

    if (GradientDescentParameters.rigidlyFixCornerPoints) {
        // Add corner points to the endPoints array with calculated weights
        let gap = 15;
        let corner_points = [
            { x: gap, y: gap },
            { x: sourceImage.width - window_size - gap, y: gap },
            { x: gap, y: sourceImage.height - window_size - gap },
            { x: sourceImage.width - window_size - gap, y: sourceImage.height - window_size - gap }
        ];

        for (let point of corner_points) {
            let average = [];
            let mad = [];
            for (let c = 0; c < channels; c++) {
                let avg = sourceImage.sample(point.x, point.y, c);
                average.push(avg);
                mad.push(0); // Assuming no mad value for corners
            }
            endPoints.push({
                x: point.x,
                y: point.y,
                average: average,
                mad: mad,
                weights: calculate_noise_weight(average, image_median, average, mad)
            });
        }
    }

    console.show();

    console.noteln("\n\nGradient Descent finished!");
    console.writeln("Total paths completed: " + completed_paths);

    let best_window_params = {
        center_x: center_x,
        center_y: center_y,
        smoothing_factor: smoothing_factor,
        window_size: window_size,
        tolerance: GradientDescentParameters.tolerance,
        defaultSampleRadius: window_size / 2 // Set defaultSampleRadius as half of window_size
    };

    executeDBEWithEndPoints(endPoints, targetView, abeBackgroundWindow, best_window_params);
}

// Helper function to calculate the median
function calculate_median(values) {
    values.sort(function(a, b) { return a - b; });
    let half = Math.floor(values.length / 2);
    if (values.length % 2) return values[half];
    return (values[half - 1] + values[half]) / 2.0;
}

// Helper function to calculate the MAD
function calculate_mad(values, median) {
    let deviations = values.map(function(value) { return Math.abs(value - median); });
    return calculate_median(deviations);
}

function calculate_noise_weight(avg_brightness, median_brightness, endpoint_brightness, mad_brightness) {
    if (!Array.isArray(avg_brightness)) {
        avg_brightness = [avg_brightness, avg_brightness, avg_brightness];
    }
    if (!Array.isArray(median_brightness)) {
        median_brightness = [median_brightness, median_brightness, median_brightness];
    }
    if (!Array.isArray(endpoint_brightness)) {
        endpoint_brightness = [endpoint_brightness, endpoint_brightness, endpoint_brightness];
    }
    if (!Array.isArray(mad_brightness)) {
        mad_brightness = [mad_brightness, mad_brightness, mad_brightness];
    }

    let weights = avg_brightness.map((avg, index) => {
        let median = median_brightness[index];
        let mad = mad_brightness[index];

        if (median === 0) {
            console.warningln("Warning: Median brightness for channel " + index + " is zero. Adjusting to a small non-zero value to avoid division by zero.");
            median = 0.0001;
        }

        let noise_factor = 1.0 - (mad / median);
        return Math.max(0.0, Math.min(1.0, noise_factor));
    });

    return weights;
}

// Updated `calculate_brightness_weight` function
function calculate_brightness_weight(avg_brightness, median_brightness, endpoint_brightness) {
    if (!Array.isArray(avg_brightness)) {
        avg_brightness = [avg_brightness, avg_brightness, avg_brightness];
    }
    if (!Array.isArray(median_brightness)) {
        median_brightness = [median_brightness, median_brightness, median_brightness];
    }
    if (!Array.isArray(endpoint_brightness)) {
        endpoint_brightness = [endpoint_brightness, endpoint_brightness, endpoint_brightness];
    }

    let weights = avg_brightness.map((avg, index) => {
        let median = median_brightness[index];
        let endpoint = endpoint_brightness[index];

        if (median === 0) {
            console.warningln("Warning: Median brightness for channel " + index + " is zero. Adjusting to a small non-zero value to avoid division by zero.");
            median = 0.0001;
        }

        let start_weight = Math.max(0.97, 1.0 - Math.min(0.03, Math.max(0, (avg - median) / median)));
        let end_weight = Math.max(0.97, 1.0 - Math.min(0.03, Math.max(0, (endpoint - median) / median)));
        return start_weight * end_weight;
    });

    return weights;
}

// Alternative method to create arrays filled with a value
function createFilledArray(length, value) {
    let arr = [];
    for (let i = 0; i < length; i++) {
        arr.push(value);
    }
    return arr;
}

// Function to generate weight based on brightness with safety checks
function calculate_weight(avg_brightness, median_brightness, endpoint_brightness) {
    if (!Array.isArray(avg_brightness)) {
        avg_brightness = [avg_brightness, avg_brightness, avg_brightness];
    }
    if (!Array.isArray(median_brightness)) {
        median_brightness = [median_brightness, median_brightness, median_brightness];
    }
    if (!Array.isArray(endpoint_brightness)) {
        endpoint_brightness = [endpoint_brightness, endpoint_brightness, endpoint_brightness];
    }

    let weights = avg_brightness.map((avg, index) => {
        let median = median_brightness[index];
        let endpoint = endpoint_brightness[index];

        if (median === 0) {
            console.warningln("Warning: Median brightness for channel " + index + " is zero. Adjusting to a small non-zero value to avoid division by zero.");
            median = 0.0001;
        }

        let start_weight = Math.max(0.97, 1.0 - Math.min(0.03, Math.max(0, (avg - median) / median)));
        let end_weight = Math.max(0.97, 1.0 - Math.min(0.03, Math.max(0, (endpoint - median) / median)));
        return start_weight * end_weight;
    });

    return weights;
}

// Function to calculate the spatial weight (varying from 1.0 at the edge to 0.8 in the middle)
function calculate_spatial_weight(x, y, width, height) {
    let centerX = width / 2;
    let centerY = height / 2;
    let distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
    let maxDistance = Math.sqrt(Math.pow(centerX, 2) + Math.pow(centerY, 2));
    let normalizedDistance = distance / maxDistance;
    let centerWeight = 0.95 + 0.05 * normalizedDistance; // Weight ranges from 0.8 to 1.0

    let edgeThresholdX = width * 0.1;
    let edgeThresholdY = height * 0.1;
    let edgeWeight = (x < edgeThresholdX || x > width - edgeThresholdX || y < edgeThresholdY || y > height - edgeThresholdY) ? 0.95 : 1.0;

    return centerWeight * edgeWeight;
}

// Function to close the ABE background window
function closeWindowById(windowId) {
    let window = ImageWindow.windowById(windowId);
    if (window !== null) {
        window.forceClose();
    }
}

// Function to calculate the Median Absolute Deviation (MAD) for the entire image
function calculate_image_mad(var_image) {
    let channels = var_image.numberOfChannels;
    let mad_values = [];

    for (let c = 0; c < channels; c++) {
        let channel_values = [];
        for (let y = 0; y < var_image.height; y++) {
            for (let x = 0; x < var_image.width; x++) {
                channel_values.push(var_image.sample(x, y, c));
            }
        }
        let median = calculate_median(channel_values);
        let deviations = channel_values.map(value => Math.abs(value - median));
        mad_values.push(calculate_median(deviations));
    }

    return mad_values;
}

// Function to execute DBE with Endpoints
function executeDBEWithEndPoints(endPoints, targetView, abeBackgroundWindow, best_window_params) {
    let channels = targetView.image.numberOfChannels;
    let radius = best_window_params.window_size / 2;

    let median = calculate_image_median(targetView.image);
    let stddev = calculate_image_stddev(targetView.image);

    // Ensure median and stddev are arrays
    if (!Array.isArray(median)) {
        median = [median, median, median];
    }
    if (!Array.isArray(stddev)) {
        stddev = [stddev, stddev, stddev];
    }

    // Ensure there are at least 3 end points
    while (endPoints.length < 3) {
        // Add more points if necessary
        endPoints.push({
            x: Math.random() * (targetView.image.width - radius * 2) + radius,
            y: Math.random() * (targetView.image.height - radius * 2) + radius,
            average: median,
            mad: [0, 0, 0]
        });
    }

    // Get the list of image windows before DBE execution
    let windowsBeforeDBE = getImageWindowIds();

    let P = new DynamicBackgroundExtraction;
    P.data = endPoints.map(point => {
        let row = [
            point.x / targetView.image.width,
            point.y / targetView.image.height
        ];

        // Ensure point.average is an array
        let avg_brightness = Array.isArray(point.average) ? point.average : [point.average, point.average, point.average];
        let mad = point.mad || [0, 0, 0]; // Ensure mad is an array

        let noise_weights = calculate_noise_weight(avg_brightness, median, avg_brightness, mad); // Using noise-based weights

        // DBE's data table has a fixed 3-channel schema (x, y, then z+w per channel = 8 values),
        // independent of numberOfChannels. For mono/2-channel images, replicate the last real
        // channel into the unused columns; DBE only reads numberOfChannels of them.
        for (let c = 0; c < 3; c++) {
            let dc = Math.min(c, channels - 1); // source channel for this (possibly phantom) column
            let spatial_weight = calculate_spatial_weight(point.x, point.y, targetView.image.width, targetView.image.height);
            let weight = noise_weights[dc] * spatial_weight;
            if (isNaN(weight) || !isFinite(weight)) { // Check for invalid weight
                console.warningln("Invalid weight detected: " + weight);
                weight = 1.0; // Set a default valid weight
            }
            row.push(avg_brightness[dc], weight); // z and calculated weight for each channel
        }
        return row;
    });

    // Include weights in P.samples
    P.samples = P.data.map(point => {
        let row = [
            point[0] * targetView.image.width,  // x
            point[1] * targetView.image.height, // y
            GradientDescentParameters.overrideSampleRadius ? GradientDescentParameters.defaultSampleRadius : best_window_params.defaultSampleRadius, // radius
            0,                                  // symmetries
            6,                                  // axialCount
            0                                   // isFixed
        ];
        // P.data rows now always carry 3 channels (8 values), so emit the full fixed 3-channel
        // samples schema (x, y, radius, symmetries, axialCount, isFixed, then z+w per channel = 12).
        for (let c = 0; c < 3; c++) {
            row.push(point[2 + c * 2]); // z0, z1, z2 for each channel
            row.push(point[3 + c * 2]); // w0, w1, w2 for each channel
        }
        return row;
    });

    P.numberOfChannels = channels;
    P.derivativeOrder = 2;
    P.smoothing = GradientDescentParameters.overrideSmoothing ? GradientDescentParameters.smoothing : best_window_params.smoothing_factor; // Use user-defined or calculated smoothing factor
    P.ignoreWeights = false;
    P.modelId = "";
    P.modelWidth = 0;
    P.modelHeight = 0;
    P.downsample = 2;
    P.modelSampleFormat = piEnum(DynamicBackgroundExtraction, "f32", "ModelFormat");
    P.targetCorrection = GradientDescentParameters.correctionType;
    P.normalize = true;
    P.discardModel = GradientDescentParameters.discardModel;
    P.replaceTarget = true;
    P.correctedImageId = "";
    P.correctedImageSampleFormat = piEnum(DynamicBackgroundExtraction, "SameAsTarget", "CorrectedFormat");
    P.imageWidth = targetView.image.width;
    P.imageHeight = targetView.image.height;
    P.symmetryCenterX = 0.500000;
    P.symmetryCenterY = 0.500000;
    P.tolerance = best_window_params.tolerance;
    P.shadowsRelaxation = 5.000;
    P.minSampleFraction = 0.050;
    P.defaultSampleRadius = GradientDescentParameters.overrideSampleRadius ? GradientDescentParameters.defaultSampleRadius : best_window_params.defaultSampleRadius;
    P.samplesPerRow = 10;
    P.minWeight = 0.400;
    P.sampleColor = 4292927712;
    P.selectedSampleColor = 4278255360;
    P.selectedSampleFillColor = 0;
    P.badSampleColor = 4294901760;
    P.badSampleFillColor = 2164195328;
    P.axisColor = 4292927712;

    // Execute the DBE process
    P.executeOn(targetView);

    // Get the list of image windows after DBE execution
    let windowsAfterDBE = getImageWindowIds();

    // Find the new DBE background image window
    let dbeBackgroundWindow = null;
    for (let id of windowsAfterDBE) {
        if (windowsBeforeDBE.indexOf(id) === -1) {
            dbeBackgroundWindow = ImageWindow.windowById(id);
            break;
        }
    }

    if (dbeBackgroundWindow) {
        if (!GradientDescentParameters.discardModel) {
            dbeBackgroundWindow.hide();
        }
    }

      // Use PixelMath to add the ABE and DBE background images together if both exist
      if (abeBackgroundWindow && dbeBackgroundWindow) {
          console.writeln("Adding ABE and DBE Background images using PixelMath."); // Debug line

          let abeBackgroundId = abeBackgroundWindow.mainView.id;
          let dbeBackgroundId = dbeBackgroundWindow.mainView.id;

          var pixelMath = new PixelMath;
          pixelMath.expression = abeBackgroundId + " + " + dbeBackgroundId;
          pixelMath.expression1 = "";
          pixelMath.expression2 = "";
          pixelMath.expression3 = "";
          pixelMath.useSingleExpression = true;
          pixelMath.symbols = "";
          pixelMath.clearImageCacheAndExit = false;
          pixelMath.cacheGeneratedImages = false;
          pixelMath.generateOutput = true;
          pixelMath.singleThreaded = false;
          pixelMath.optimization = true;
          pixelMath.use64BitWorkingImage = false;
          pixelMath.rescale = false;
          pixelMath.rescaleLower = 0;
          pixelMath.rescaleUpper = 1;
          pixelMath.truncate = true;
          pixelMath.truncateLower = 0;
          pixelMath.truncateUpper = 1;
          pixelMath.createNewImage = true;
          pixelMath.showNewImage = true;
          pixelMath.newImageId = "Extracted_Background";
          pixelMath.newImageWidth = 0;
          pixelMath.newImageHeight = 0;
          pixelMath.newImageAlpha = false;
          pixelMath.newImageColorSpace = piEnum(PixelMath, "SameAsTarget");
          pixelMath.newImageSampleFormat = piEnum(PixelMath, "SameAsTarget");
          pixelMath.executeOn(dbeBackgroundWindow.mainView, false);

          // Close the ABE background window after PixelMath operation
          closeWindowById(abeBackgroundWindow.mainView.id);
          closeWindowById(dbeBackgroundWindow.mainView.id);
      } else {
          if (!abeBackgroundWindow) {
              console.writeln("ABE Background Window was not found for addition."); // Debug line
          }
          if (!dbeBackgroundWindow) {
              console.writeln("DBE Background Window was not found for addition."); // Debug line
          } else {
              dbeBackgroundWindow.show(); // Ensure the DBE background window is shown if ABE background is not found
          }
       }
}

function processMonoImage(targetView, targetMedian) {
    var P = new ProcessContainer;

    var P001 = new PixelMath;
    P001.expression = "BlackPoint = iif((med($T) - 2.7*sdev($T))<min($T),min($T),med($T) - 2.7*sdev($T));\n" +
                      "Rescaled = ($T - BlackPoint) / (1 - BlackPoint);";
    P001.useSingleExpression = true;
    P001.symbols = "BlackPoint, Rescaled, CurrentMedian, DesiredMedian, Alpha";
    P001.clearImageCacheAndExit = false;
    P001.cacheGeneratedImages = false;
    P001.generateOutput = true;
    P001.singleThreaded = false;
    P001.optimization = true;
    P001.use64BitWorkingImage = false;
    P001.rescale = false;
    P001.rescaleLower = 0;
    P001.rescaleUpper = 1;
    P001.truncate = true;
    P001.truncateLower = 0;
    P001.truncateUpper = 1;
    P001.createNewImage = false;
    P001.showNewImage = true;
    P.add(P001);

    var P002 = new PixelMath;
    P002.expression = "((Med($T)-1)*" + targetMedian + "*$T)/(Med($T)*(" + targetMedian + "+$T-1)-" + targetMedian + "*$T)";
    P002.useSingleExpression = true;
    P002.symbols = "L, S";
    P002.clearImageCacheAndExit = false;
    P002.cacheGeneratedImages = false;
    P002.generateOutput = true;
    P002.singleThreaded = false;
    P002.optimization = true;
    P002.use64BitWorkingImage = false;
    P002.rescale = false;
    P002.rescaleLower = 0;
    P002.rescaleUpper = 1;
    P002.truncate = true;
    P002.truncateLower = 0;
    P002.truncateUpper = 1;
    P002.createNewImage = false;
    P002.showNewImage = true;
    P.add(P002);

    // Execute the process container on the selected target image
 P.executeOn(targetView);
}


function processUnlinkedColorImage(targetView, targetMedian) {
    var P = new ProcessContainer;

    var P001 = new PixelMath;
    P001.useSingleExpression = false;
    P001.expression = "BlackPoint = iif((med($T[0]) - 2.7*sdev($T[0]))<min($T[0]),min($T[0]),med($T[0]) - 2.7*sdev($T[0]));\n" +
                      "Rescaled = ($T[0] - BlackPoint) / (1 - BlackPoint);";
    P001.expression1 = "BlackPoint = iif((med($T[1]) - 2.7*sdev($T[1]))<min($T[1]),min($T[1]),med($T[1]) - 2.7*sdev($T[1]));\n" +
                       "Rescaled = ($T[1] - BlackPoint) / (1 - BlackPoint);";
    P001.expression2 = "BlackPoint = iif((med($T[2]) - 2.7*sdev($T[2]))<min($T[2]),min($T[2]),med($T[2]) - 2.7*sdev($T[2]));\n" +
                       "Rescaled = ($T[2] - BlackPoint) / (1 - BlackPoint);";
    P001.symbols = "BlackPoint, Rescaled";
    configurePixelMath(P001);
    P.add(P001);

    var P002 = new PixelMath;
    P002.useSingleExpression = false;
    P002.expression = "((Med($T[0])-1)*" + targetMedian + "*$T[0])/(Med($T[0])*(" + targetMedian + "+$T[0]-1)-" + targetMedian + "*$T[0])";
    P002.expression1 = "((Med($T[1])-1)*" + targetMedian + "*$T[1])/(Med($T[1])*(" + targetMedian + "+$T[1]-1)-" + targetMedian + "*$T[1])";
    P002.expression2 = "((Med($T[2])-1)*" + targetMedian + "*$T[2])/(Med($T[2])*(" + targetMedian + "+$T[2]-1)-" + targetMedian + "*$T[2])";
    P002.symbols = "L, S";
    configurePixelMath(P002);
    P.add(P002);

    P.executeOn(targetView);
}

function configurePixelMath(P) {
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
}

function getFinderInstance(userDefinedRegion) {
    let window = parameters.targetWindow;

    if (!window || window.isNull) {
        console.show();
        console.criticalln("No target window selected or the selected window is invalid. Please select a valid window and try again.");
        return null;
    }

    let finder;
    if (userDefinedRegion) {
        finder = new FindBackgroundUserDefined(parameters.size, parameters.spacingRate, userDefinedRegion);
    } else {
        finder = new FindBackground(parameters.size, parameters.spacingRate);
    }

    finder.filterAverage = parameters.filterAvg;
    finder.filterStandardDeviation = parameters.filterSdev;
    finder.filterMedianAverageAbsoluteDifference = parameters.filterMAAD;
    finder.filterPoissonIndex = parameters.filterPoisonIndex;
    finder.filterForObjects = parameters.filterObjects;

    finder.setTarget(window);

    return finder;
}

class ADBEDialog extends Dialog {  // V8: Dialog is a real ES6 class; the __base__ idiom fails. Use class/super.
  constructor() {
    super();

    this.title = new Label(this);
    this.title.text = "Auto DBE V" + VERSION;
    this.title.textAlignment = TextAlign_Center;
    this.title.styleSheet = "font-weight: bold; font-size: 14pt; background-color: #f0f0f0;";
    this.title.minHeight = 40;
    this.title.maxHeight = 40;

    this.description = new TextBox(this);
    this.description.text = "Script to remove the Gradient in an image.\nThis utilizes gradient descent to define DBE points automatically.\n\nIt then runs DBE utilizing those points with custom weighting.\n\nIf you have dark nebula (or other area) that need to be excluded click the checkbox.\nShift+Click and Drag to Define Exclusion Areas (multiple areas allowed).\n\nIf you Find the corner correction not correct use checkbox\n\ to rigidly affix corner points.";
    this.description.readOnly = true;
    this.description.backgroundColor = 0xd3d3d3; // Grey background
    this.description.maxHeight = 170;

    this.windowLabel = new Label(this);
    this.windowLabel.text = "Select Image:";
    this.windowLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;

    this.windowComboBox = new ComboBox(this);
    this.windowComboBox.editEnabled = false;

    let windows = ImageWindow.windows;
    this.windowComboBox.addItem("Select an image");

    var activeWindow = ImageWindow.activeWindow;
    var activeWindowId = activeWindow ? activeWindow.mainView.id : null;
    var foundActive = false; // Flag to check if active window is found

    for (var i = 0; i < windows.length; ++i) {
        this.windowComboBox.addItem(windows[i].mainView.id);
        if (windows[i].mainView.id === activeWindowId) {
            this.windowComboBox.currentItem = i + 1;
            foundActive = true;
        }
    }

    if (!foundActive) {
        this.windowComboBox.currentItem = 0; // No active window found, default to "Select an image"
    } else {
        GradientDescentParameters.targetView = activeWindow.mainView;
    }

this.windowComboBox.onItemSelected = function (index) {
    if (index > 0) {
        GradientDescentParameters.targetView = View.viewById(this.itemText(index));
    } else {
        GradientDescentParameters.targetView = undefined;
    }
};

    // User Defined Exclusion Area Checkbox below the Select Image dropdown
    this.userDefinedExclusionCheckbox = new CheckBox(this);
    this.userDefinedExclusionCheckbox.text = "User Defined Exclusion Area";
    this.userDefinedExclusionCheckbox.checked = false;
    this.userDefinedExclusionCheckbox.onCheck = (checked) => {
        this.previewControl.visible = checked;
        this.zoomSizer.visible = checked;
        if (checked && GradientDescentParameters.targetView) {
            let selectedImage = GradientDescentParameters.targetView.image;
            if (selectedImage) {
                var tmpImage = this.createAndDisplayTemporaryImage(selectedImage);
                this.previewControl.displayImage = tmpImage;
                this.previewControl.initScrollBars();
                this.previewControl.viewport.update();
            }
        }
        this.adjustToContents();
    };

    // Reset Button
    this.resetButton = new ToolButton(this);
    this.resetButton.icon = this.scaledResource(":/icons/reload.png");
    this.resetButton.toolTip = "User Area Reset";
    this.resetButton.onMousePress = function () {
        this.dialog.previewControl.userDefinedRegions = [];  // Clear all regions
        this.dialog.previewControl.viewport.update();
    };

    this.descentPathsLabel = new Label(this);
    this.descentPathsLabel.text = "Number of Descent Paths:";
    this.descentPathsLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;

    this.descentPathsInput = new Edit(this);
    this.descentPathsInput.text = GradientDescentParameters.descentPathsInput.toString();
    this.descentPathsInput.toolTip = "User defined number of starting points that\ngradient descent will flow down.  This is in addition\nto 12 framing points on the edges of the image.";
    this.descentPathsInput.onTextUpdated = function (text) {
        GradientDescentParameters.descentPathsInput = parseInt(text) || GradientDescentParameters.descentPathsInput;
    };

    this.toleranceLabel = new Label(this);
    this.toleranceLabel.text = "Tolerance:";
    this.toleranceLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;

    this.toleranceInput = new NumericControl(this);
    this.toleranceInput.label.text = "";
    this.toleranceInput.setRange(0, 10);
    this.toleranceInput.slider.setRange(0, 100);
    this.toleranceInput.setPrecision(2);
    this.toleranceInput.setValue(GradientDescentParameters.tolerance);
    this.toleranceInput.toolTip = "Increasing this value favors inclusion of more pixels in\nthebackground model, but at the risk of including pixels\n that don't pertain to true background.";
    this.toleranceInput.onValueUpdated = function (value) {
        GradientDescentParameters.tolerance = value;
    };

    this.overrideSampleRadiusCheckbox = new CheckBox(this);
    this.overrideSampleRadiusCheckbox.text = "Override Calculated Sample Radius";
    this.overrideSampleRadiusCheckbox.checked = false;
    this.overrideSampleRadiusCheckbox.toolTip = "Calculated based on window size not to exceed 25.\n Override for very dense star fields to use smaller values.";
    this.overrideSampleRadiusCheckbox.onCheck = function (checked) {
        GradientDescentParameters.overrideSampleRadius = checked;
        this.dialog.defaultSampleRadiusInput.enabled = checked;
    };

    this.defaultSampleRadiusLabel = new Label(this);
    this.defaultSampleRadiusLabel.text = ":";
    this.defaultSampleRadiusLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;

    this.defaultSampleRadiusInput = new NumericControl(this);
    this.defaultSampleRadiusInput.label.text = "";
    this.defaultSampleRadiusInput.setRange(1, 100);
    this.defaultSampleRadiusInput.slider.setRange(1, 100);
    this.defaultSampleRadiusInput.setPrecision(0);
    this.defaultSampleRadiusInput.setValue(GradientDescentParameters.defaultSampleRadius);
    this.defaultSampleRadiusInput.enabled = false;
    this.defaultSampleRadiusInput.onValueUpdated = function (value) {
        GradientDescentParameters.defaultSampleRadius = value;
    };

    this.overrideSmoothingCheckbox = new CheckBox(this);
    this.overrideSmoothingCheckbox.text = "Override Calculated Smoothing";
    this.overrideSmoothingCheckbox.checked = false;
    this.overrideSmoothingCheckbox.toolTip = "Controls the adaptability of the 2-D surface modeling algorithm\n used to build the background model.  This is automatically \ncalculated to be controlled between 0.15 and 0.5 depending\n on the variability in the dynamically found points.";
    this.overrideSmoothingCheckbox.onCheck = function (checked) {
        GradientDescentParameters.overrideSmoothing = checked;
        this.dialog.smoothingInput.enabled = checked;
    };

    this.smoothingLabel = new Label(this);
    this.smoothingLabel.text = ":";
    this.smoothingLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;

    this.smoothingInput = new Edit(this);
    this.smoothingInput.text = GradientDescentParameters.smoothing.toString();
    this.smoothingInput.setFixedWidth(60);
    this.smoothingInput.enabled = false;
    this.smoothingInput.onTextUpdated = function (value) {
        GradientDescentParameters.smoothing = parseFloat(value);
    };

    this.replaceTargetCheckbox = new CheckBox(this);
    this.replaceTargetCheckbox.text = "Replace Target Image";
    this.replaceTargetCheckbox.checked = GradientDescentParameters.replaceTarget;
    this.replaceTargetCheckbox.onCheck = (checked) => {
        GradientDescentParameters.replaceTarget = checked;
    };

        // Check if the script is running in the global context
    if (Parameters.isGlobalTarget) {
        this.replaceTargetCheckbox.checked = false;
        this.replaceTargetCheckbox.enabled = false;
        this.replaceTargetCheckbox.toolTip = "Replace Target cannot be performed when running in the Global Context.\n\nIf needed, please open the Script from the Script menu.";
    }

      this.enableSimplifiedInitialModellingCheckbox = new CheckBox(this);
      this.enableSimplifiedInitialModellingCheckbox.text = "Enable Simplified Initial Modelling";
      this.enableSimplifiedInitialModellingCheckbox.checked = GradientDescentParameters.enableSimplifiedInitialModelling;
      this.enableSimplifiedInitialModellingCheckbox.toolTip = "<p>Disable if initial gradient appears fairly minimal.</p>";
      this.enableSimplifiedInitialModellingCheckbox.onCheck = (checked) => {
          GradientDescentParameters.enableSimplifiedInitialModelling = checked;
      };

      // Add the Polynomial Degree Dropdown
      this.polynomialDegreeLabel = new Label(this);
      this.polynomialDegreeLabel.text = "Polynomial Degree:";
      this.polynomialDegreeLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;

      this.polynomialDegreeComboBox = new ComboBox(this);
      this.polynomialDegreeComboBox.addItem("0");
      this.polynomialDegreeComboBox.addItem("1");
      this.polynomialDegreeComboBox.addItem("2");
      this.polynomialDegreeComboBox.currentItem = 1; // Default to 1
      this.polynomialDegreeComboBox.toolTip = "Select the polynomial degree for the initial model.";
      this.polynomialDegreeComboBox.onItemSelected = (index) => {
          GradientDescentParameters.polynomialDegree = parseInt(this.polynomialDegreeComboBox.itemText(index));
      };

      // Correction Type Dropdown Label
this.correctionTypeLabel = new Label(this);
this.correctionTypeLabel.text = "Correction Type:";
this.correctionTypeLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;

// Correction Type Dropdown
this.correctionTypeComboBox = new ComboBox(this);
this.correctionTypeComboBox.addItem("Subtract");
this.correctionTypeComboBox.addItem("Division");
this.correctionTypeComboBox.currentItem = 0; // Default to Subtract
this.correctionTypeComboBox.toolTip = "Select the correction type for Dynamic Background Extraction.";
this.correctionTypeComboBox.onItemSelected = (index) => {
    GradientDescentParameters.correctionType = (index === 0)
        ? piEnum(DynamicBackgroundExtraction, "Subtract", "Correction")
        : piEnum(DynamicBackgroundExtraction, "Divide", "Correction");
};

// Horizontal sizer for the correction label and dropdown
this.correctionTypeSizer = new HorizontalSizer;
this.correctionTypeSizer.spacing = 4;
this.correctionTypeSizer.add(this.correctionTypeLabel);
this.correctionTypeSizer.add(this.correctionTypeComboBox);
this.correctionTypeSizer.addStretch();

      // Add Rigidly Fix Corner Points checkbox
      this.rigidlyFixCornerPointsCheckbox = new CheckBox(this);
      this.rigidlyFixCornerPointsCheckbox.text = "Rigidly Fix Corner Points";
      this.rigidlyFixCornerPointsCheckbox.checked = GradientDescentParameters.rigidlyFixCornerPoints;
      this.rigidlyFixCornerPointsCheckbox.toolTip = "<p>Check this if you find the corners not corrected properly, this will place a point at each corner and not perform gradient descent on them.</p>";
      this.rigidlyFixCornerPointsCheckbox.onCheck = (checked) => {
          GradientDescentParameters.rigidlyFixCornerPoints = checked;
      };

      this.showGradientExtractedCheckbox = new CheckBox(this);
      this.showGradientExtractedCheckbox.text = "Show Gradient Extracted";
      this.showGradientExtractedCheckbox.checked = !GradientDescentParameters.discardModel;
      this.showGradientExtractedCheckbox.onCheck = (checked) => {
          GradientDescentParameters.discardModel = !checked;
      };

      this.checkboxesSizer = new HorizontalSizer;
      this.checkboxesSizer.spacing = 10;
      this.checkboxesSizer.add(this.replaceTargetCheckbox);
      this.checkboxesSizer.add(this.showGradientExtractedCheckbox);

      // Footer with authorship and website information
      this.authorshipLabel = new Label(this);
      this.authorshipLabel.text = "Written by Franklin Marek\nCopyright 2024";
      this.authorshipLabel.textAlignment = TextAlign_Center;

      this.newInstance_Button = new ToolButton(this);
      this.newInstance_Button.icon = this.scaledResource(":/process-interface/new-instance.png");
      this.newInstance_Button.setScaledFixedSize(24, 24);
      this.newInstance_Button.toolTip = "<p>Create a new instance of this process.</p>";
      this.newInstance_Button.onMousePress = function () {
          GradientDescentParameters.save();
          this.dialog.newInstance();
      };

      this.ok_Button = new PushButton(this);
      this.ok_Button.text = "Execute";
      this.ok_Button.onClick = () => {
          console.noteln("ADBE Starting...");
          GradientDescentParameters.descentPathsInput = parseInt(this.descentPathsInput.text);
          GradientDescentParameters.save();
          let exclusionAreas = this.previewControl.userDefinedRegions.map(function(region) {
              return new Rect(
                  region.left * this.downsamplingFactor,
                  region.top * this.downsamplingFactor,
                  region.right * this.downsamplingFactor,
                  region.bottom * this.downsamplingFactor
              );
          }.bind(this)); // Ensure correct `this` context
          this.dialog.ok(); // Close the dialog after executing
          executeGradientDescent(GradientDescentParameters.targetView, exclusionAreas); // Only pass exclusionAreas
      };

      this.imageSelectionSizer = new HorizontalSizer;
      this.imageSelectionSizer.spacing = 4;
      this.imageSelectionSizer.add(this.windowLabel);
      this.imageSelectionSizer.add(this.windowComboBox);
      this.imageSelectionSizer.add(this.userDefinedExclusionCheckbox);
      this.imageSelectionSizer.add(this.resetButton);

      this.pathsSizer = new HorizontalSizer;
      this.pathsSizer.spacing = 4;
      this.pathsSizer.add(this.descentPathsLabel);
      this.pathsSizer.add(this.descentPathsInput);

      this.toleranceSizer = new HorizontalSizer;
      this.toleranceSizer.spacing = 4;
      this.toleranceSizer.add(this.toleranceLabel);
      this.toleranceSizer.add(this.toleranceInput);

      this.sampleRadiusSizer = new HorizontalSizer;
      this.sampleRadiusSizer.spacing = 4;
      this.sampleRadiusSizer.add(this.overrideSampleRadiusCheckbox);
      this.sampleRadiusSizer.add(this.defaultSampleRadiusLabel);
      this.sampleRadiusSizer.add(this.defaultSampleRadiusInput);

      this.smoothingSizer = new HorizontalSizer;
      this.smoothingSizer.spacing = 4;
      this.smoothingSizer.add(this.overrideSmoothingCheckbox);
      this.smoothingSizer.add(this.smoothingLabel);
      this.smoothingSizer.add(this.smoothingInput);
      this.smoothingSizer.addStretch();

      this.zoomSizer = new HorizontalSizer;
      this.zoomSizer.spacing = 4;
      this.zoomLabel = new Label(this);
      this.zoomLabel.text = "Preview Zoom Level: ";
      this.zoomLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;
      this.zoomSizer.add(this.zoomLabel);

      this.refreshPreviewButton = new ToolButton(this);
      this.refreshPreviewButton.icon = this.scaledResource(":/icons/refresh.png");
      this.refreshPreviewButton.toolTip = "Refresh Preview";
      this.refreshPreviewButton.onMousePress = () => {
          if (GradientDescentParameters.targetView) {
              let selectedImage = GradientDescentParameters.targetView.image;
              if (selectedImage) {
                  let tmpImage = this.createAndDisplayTemporaryImage(selectedImage);
                  this.previewControl.displayImage = tmpImage;
                  this.previewControl.viewport.update();
              }
          }
      };

      this.zoomLevelComboBox = new ComboBox(this);
      this.zoomLevelComboBox.addItem("1:1");
      this.zoomLevelComboBox.addItem("1:2");
      this.zoomLevelComboBox.addItem("1:4");
      this.zoomLevelComboBox.addItem("1:8");
      this.zoomLevelComboBox.addItem("Fit to Preview");
      this.zoomLevelComboBox.currentItem = 4;
      this.zoomSizer.add(this.zoomLevelComboBox, 1);
      this.zoomSizer.add(this.refreshPreviewButton);

      this.footerLine = new HorizontalSizer();
      this.footerLine.spacing = 8;
      this.footerLine.addStretch();
      this.footerLine.add(this.authorshipLabel);
      this.footerLine.addStretch();

      this.buttonsSizer = new HorizontalSizer;
      this.buttonsSizer.spacing = 8;
      this.buttonsSizer.add(this.newInstance_Button);
      this.buttonsSizer.addStretch();
      this.buttonsSizer.add(this.zoomSizer);  // Add the zoomSizer between newInstance and ok_Button
      this.buttonsSizer.addStretch();
      this.buttonsSizer.add(this.ok_Button);

      this.previewControl = new ScrollControl(this);
      this.previewControl.setMinWidth(640);
      this.previewControl.setMinHeight(480);

      this.mainSizer = new HorizontalSizer;
      this.mainSizer.spacing = 12;

      this.leftSizer = new VerticalSizer;
      this.leftSizer.margin = 8;
      this.leftSizer.spacing = 6;
      this.leftSizer.add(this.title);
      this.leftSizer.addSpacing(8);
      this.leftSizer.add(this.description);
      this.leftSizer.addSpacing(8);
      this.leftSizer.add(this.imageSelectionSizer);
      this.leftSizer.addSpacing(12);
      this.leftSizer.addStretch();
      this.leftSizer.add(this.pathsSizer); // Add the paths input to the sizer
      this.leftSizer.add(this.toleranceSizer); // Add the tolerance input to the sizer
      this.leftSizer.addStretch();
      this.leftSizer.add(this.sampleRadiusSizer); // Add the sample radius input to the sizer
      this.leftSizer.add(this.smoothingSizer);

      // Add the Polynomial Degree dropdown and Enable Simplified Initial Modelling checkbox
      this.enableSimplifiedInitialModellingSizer = new HorizontalSizer;
      this.enableSimplifiedInitialModellingSizer.spacing = 4;
      this.enableSimplifiedInitialModellingSizer.add(this.enableSimplifiedInitialModellingCheckbox);
      this.enableSimplifiedInitialModellingSizer.add(this.polynomialDegreeLabel);
      this.enableSimplifiedInitialModellingSizer.add(this.polynomialDegreeComboBox);
      this.enableSimplifiedInitialModellingSizer.addStretch();

      this.leftSizer.add(this.enableSimplifiedInitialModellingSizer); // Add the new sizer here
      this.leftSizer.add(this.correctionTypeSizer);
      this.leftSizer.add(this.rigidlyFixCornerPointsCheckbox); // Add the checkbox below the Enable Simplified Initial Modelling sizer
      this.leftSizer.addStretch();
      this.leftSizer.add(this.checkboxesSizer);
      this.leftSizer.addStretch();
      this.leftSizer.add(this.footerLine); // Add the footerLine
      this.leftSizer.add(this.buttonsSizer);

      this.mainSizer.add(this.leftSizer);
      this.mainSizer.add(this.previewControl, 1, Align_Expand);

      this.sizer = this.mainSizer;

      this.windowTitle = "Auto DBE";

      this.onShow = () => {
          if (this.windowComboBox.currentItem >= 0) {
              let window = ImageWindow.windowById(this.windowComboBox.itemText(this.windowComboBox.currentItem));
              if (window && !window.isNull) {
              }
          } else {
              console.noteln("No image selected for preview.");
              this.previewControl.visible = false;
              this.zoomSizer.visible = false;
              this.adjustToContents(); // Adjust the dialog size to fit the initial content
          }
          this.previewControl.visible = false;
          this.zoomSizer.visible = false;
          this.adjustToContents();
      };

      this.adjustToContents();

      this.downsamplingFactor = 1;

      this.createAndDisplayTemporaryImage = function (selectedImage) {
          let window = new ImageWindow(selectedImage.width, selectedImage.height,
              selectedImage.numberOfChannels,
              selectedImage.bitsPerSample,
              selectedImage.isReal,
              selectedImage.isColor
          );

          window.mainView.beginProcess();
          window.mainView.image.assign(selectedImage);
          window.mainView.endProcess();

          if (selectedImage.numberOfChannels == 1) {
              processMonoImage(window.mainView, 0.25);
          } else {
              processUnlinkedColorImage(window.mainView, 0.25);
          }

          var P = new IntegerResample;
          switch (this.zoomLevelComboBox.currentItem) {
              case 0: // 1:1
                  P.zoomFactor = -1;
                  this.downsamplingFactor = 1;
                  break;
              case 1: // 1:2
                  P.zoomFactor = -2;
                  this.downsamplingFactor = 2;
                  break;
              case 2: // 1:4
                  P.zoomFactor = -4;
                  this.downsamplingFactor = 4;
                  break;
              case 3: // 1:8
                  P.zoomFactor = -8;
                  this.downsamplingFactor = 8;
                  break;
              case 4: // Fit to Preview
                  const previewWidth = this.previewControl.width;
                  const widthScale = Math.floor(selectedImage.width / previewWidth);
                  P.zoomFactor = -Math.max(widthScale, 1);
                  this.downsamplingFactor = Math.max(widthScale, 1);
                  break;
              default:
                  P.zoomFactor = -2; // Default to 1:2 if nothing is selected
                  this.downsamplingFactor = 2;
                  break;
          }

          P.executeOn(window.mainView);

          let resizedImage = new Image(window.mainView.image);

          if (resizedImage.width > 0 && resizedImage.height > 0) {
              this.previewControl.displayImage = resizedImage;
              this.previewControl.doUpdateImage(resizedImage);
              this.previewControl.initScrollBars();
          } else {
              console.error("Resized image has invalid dimensions.");
          }

          window.forceClose();

          return resizedImage;
      };

      this.zoomLevelComboBox.onItemSelected = (index) => {
          console.noteln("Zoom Level Changed. Refreshing preview...");
          if (GradientDescentParameters.targetView) {
              var selectedImage = GradientDescentParameters.targetView.image;
              if (selectedImage) {
                  console.writeln("Adjusting preview for image with ID: " + GradientDescentParameters.targetView.id);
                  let tmpImage = this.createAndDisplayTemporaryImage(selectedImage);
                  this.previewControl.displayImage = tmpImage;
                  this.previewControl.viewport.update();
              } else {
                  console.error("Selected image is undefined.");
              }
          } else {
              console.writeln("No image selected for preview!");
          }
      };

      this.adjustToContents();
  }
}


function main() {
    // Require PixInsight 1.9.4 or later (V8 JavaScript runtime).
    CoreApplication.ensureMinimumVersion(1, 9, 4);
    Console.show();  // Show the console
Console.criticalln("   ____    __  _   ___       __         \n  / __/__ / /_(_) / _ | ___ / /_______ ");
Console.warningln(" _\\ \\/ -_) __/ / / __ |(_-</ __/ __/ _ \\ \n/___/\\__/\\__/_/ /_/ |_/__/\\__/_/  \\___/ \n                                         ");
    // Perform the script on the target view when dragged and dropped
    if (Parameters.isViewTarget) {
        GradientDescentParameters.load();

        GradientDescentParameters.targetView = Parameters.targetView;
        if (GradientDescentParameters.targetView) {
            console.noteln("ADBE Starting...");
            // In target view mode, exclusion areas should be null
            let exclusionAreas = [];

            executeGradientDescent(GradientDescentParameters.targetView, exclusionAreas);
            console.noteln("Gradient Removal Complete!");
        } else {
            console.writeln("No valid target view specified, opening dialog");
            // If no valid target view specified, open the dialog
            let dialog = new ADBEDialog();
            dialog.execute();
        }
        return;
    }

    // Check if there is an active window
    if (ImageWindow.activeWindow.isNull) {
        Console.show();
        Console.warningln("No active window found. Please select an active image window.");
        return;
    }

    // Check if the script is running in the global context
    if (Parameters.isGlobalTarget) {
        let dialog = new ADBEDialog();
        dialog.execute();
        return;
    }

    // Direct context, create and show the dialog
    let dialog = new ADBEDialog();
    if (dialog.execute()) {
        if (GradientDescentParameters.targetView) {
            console.noteln("Gradient Removal Complete!");
        } else {
            Console.show();
            Console.warningln("No target view is specified.");
        }
    } else {
        Console.show();
        Console.noteln("ADBE Script Dialog Closed.");
    }
}

main();

