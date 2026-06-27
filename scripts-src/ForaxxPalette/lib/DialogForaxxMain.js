 /*
 * *****************************************************************************
 *
 * MAIN ForaxxPalette DIALOG
 * This dialog forms part of the ForaxxPalette.js
 * Version 1.12
 *
 * Copyright (C) 2023 Paul Hancock
 *
 * *****************************************************************************
 */

#include "PixelMathConstructor.js"
#include "ImageConstructor.js"
#include "CurvesAdjustments.js"

class ForaxxDialog extends Dialog {
   constructor() {
   super();
   var dlg = this;


   //Set Dialog Width and Height
   this.minHeight = 200;
   this.minWidth=660;

   //The Main instructional textbox
   this.title = new TextBox(this);
   this.title.text = "<b>Foraxx Palette Construction " + VERSION + "</b> <br><br>" +
                     "This script provides an environment within which to create a Foraxx Palette image. " +
                     "<br><br>" +
                     "For more in depth information about the Foraxx Palette, you should visit the Coldest Nights website, " +
                     "use the button below (bottom left) to navigate to the website." +
                     "<br><br>" +
                     "The script expects stretched starless images along with, (optionally) stretched images of the stars. " +
                     "<br><br>" +
                     "First select how many channels of data you have in the Number of Channels Tab Box. " +
                     "If you have gathered Sii, Ha and Oiii data then choose 3 Channels, if you have only " +
                     "gathered Ha and Oiii (either via mono imaging or OSC with a dual narrowband filter), " +
                     "then choose 2 Channels, this will grey out the Sii boxes. " +
                     "<br><br>" +
                     "Once you have chosen the appropriate number of channels you need to select each of your " +
                     "starless images, and the respective star images or check the box to disable star images. " +
                     "<br><br>" +
                     "Once you press the Execute button, the script will produce the relevant dynamic pixelmath " +
                     "intermediary images. " +
                     "It will then run the appropriate Foraxx expressions depending on the number of filters used. " +
                     "<br><br>" +
                     "Once Complete, you will have a final Foraxx image along with the colour stars image, " +
                     "named Foraxx and Foraxx_stars respectively. " +
                     "<br><br>" +
                     "Copyright &copy; 2023 Paul Hancock. All Rights Reserved.";

   this.title.readOnly = true;
   this.title.minHeight = 380;
   this.title.maxHeight = 380;
   this.title

   /**********************************************************************************************************
    *
    *  Create options for 2 or 3 channel Foraxx without risk of user adding files to the wrong drop downs.
    *
    * ********************************************************************************************************/

   //Create the Two Channel Radio Button
   this.twoChannel = new RadioButton(this);
   this.twoChannel.text = "Choose this option if you only have two channels.";
   this.twoChannel.toolTip = "Select this option if you have dual narrowband OSC data or only collected Ha and Oiii data.";
   this.twoChannel.onCheck = function ( checked )
      {
         ForaxxParameters.twoChannels = checked;
         checkButtonLogic();
         dlg.viewlistSII.enabled = !checked;
         dlg.viewlistSIIStars.enabled = !checked;

         ForaxxParameters.siiView = undefined;
         ForaxxParameters.siiViewStars = undefined;
         dlg.viewlistHA.enabled = true;
         dlg.viewlistOIII.enabled = true;
         //dlg.onlyForaxx.enabled = true;
         if (ForaxxParameters.buttonLogic == "0")
         {
            dlg.viewlistHAStars.enabled = true;
            dlg.viewlistOIIIStars.enabled = true;
         }
         else if (ForaxxParameters.buttonLogic == "1")
         {
            dlg.viewlistHAStars.enabled = false;
            dlg.viewlistOIIIStars.enabled = false;
         }
         //Console.noteln("The 2 Channel Foraxx Variant has been Selected.");
      };

   //Create the Three Channel Radio Button
   this.threeChannel = new RadioButton(this);
   this.threeChannel.text = "Choose this option if you have three channels.";
   this.threeChannel.toolTip = "Select this option if you collected Sii, Ha and Oiii data.";
   this.threeChannel.onCheck = function ( checked )
      {
         ForaxxParameters.twoChannels = !checked;
         checkButtonLogic();
         dlg.viewlistSII.enabled = true;
         dlg.viewlistHA.enabled = true;
         dlg.viewlistOIII.enabled = true;
         //dlg.viewlistSIIStars.enabled = true;
         //dlg.onlyForaxx.enabled = true;
         if (ForaxxParameters.buttonLogic == "2")
         {
            dlg.viewlistHAStars.enabled = true;
            dlg.viewlistOIIIStars.enabled = true;
            dlg.viewlistSIIStars.enabled = true;
         }
         else if (ForaxxParameters.buttonLogic == "3")
         {
            dlg.viewlistHAStars.enabled = false;
            dlg.viewlistOIIIStars.enabled = false;
            dlg.viewlistSIIStars.enabled = false;
         }
         //Console.noteln("The 3 Channel Foraxx Variant has been Selected.");
      };

   /**********************************************************************************************************
    *
    *  Create an optional checkbox to only create a Foraxx image, no extra stars image.
    *
    * ********************************************************************************************************/

   //Create the optional only Foraxx Button
   this.onlyForaxx = new CheckBox(this);
   //this.onlyForaxx.enabled = false;
   this.onlyForaxx.text = "Check this box if you only want a single Foraxx Image and don't need any stars images created.";
   this.onlyForaxx.toolTip = "If your images have not had the stars removed, or you don't want a Foraxx stars image created then check this box.";
   this.onlyForaxx.onCheck = function ( checked )
      {
         if (checked && !ForaxxParameters.twoChannels)
         {
            ForaxxParameters.onlyForaxx = true;
            dlg.viewlistHAStars.enabled = false;
            dlg.viewlistOIIIStars.enabled = false;
            dlg.viewlistSIIStars.enabled = false;
         }
         else if (checked && ForaxxParameters.twoChannels)
         {
            ForaxxParameters.onlyForaxx = true;
            dlg.viewlistHAStars.enabled = false;
            dlg.viewlistOIIIStars.enabled = false;
            dlg.viewlistSIIStars.enabled = false;
         }
         else if (!checked && !ForaxxParameters.twoChannels)
         {
            ForaxxParameters.onlyForaxx = false;
            dlg.viewlistHAStars.enabled = true;
            dlg.viewlistOIIIStars.enabled = true;
            dlg.viewlistSIIStars.enabled = true;
         }
         else if (!checked && ForaxxParameters.twoChannels)
         {
               ForaxxParameters.onlyForaxx = false;
               dlg.viewlistHAStars.enabled = true;
               dlg.viewlistOIIIStars.enabled = true;
               dlg.viewlistSIIStars.enabled = false;
         }
         checkButtonLogic();
         //Console.noteln("A Foraxx star image will be created.")
      };


  /************************************************************************************************************
   * **********************************************************************************************************
   *
   * The view Lists for the Starless and Star Images
   *
   *
   *
   * **********************************************************************************************************
   * *********************************************************************************************************/

   //Create the Ha list view
   this.textHA = new Label(this);
   this.textHA.text = "Ha: "
   this.viewlistHA = new ViewList(this);
   this.viewlistHA.getMainViews();
   this.viewlistHA.enabled = false;
   this.viewlistHA.onViewSelected = function(view) {
      ForaxxParameters.haView = view;
   }

   //Create the Ha Stars list view
   this.textHAStars = new Label(this);
   this.textHAStars.text = "Ha Stars: "
   this.viewlistHAStars = new ViewList(this);
   this.viewlistHAStars.getMainViews();
   this.viewlistHAStars.enabled = false;
   this.viewlistHAStars.onViewSelected = function(view) {
      ForaxxParameters.haStarsView = view;
   }

   //Create the Oiii list view
   this.textOIII = new Label(this);
   this.textOIII.text = "Oiii: "
   this.viewlistOIII = new ViewList(this);
   this.viewlistOIII.getMainViews();
   this.viewlistOIII.enabled = false;
   this.viewlistOIII.onViewSelected = function(view) {
      ForaxxParameters.oiiiView = view;
   }

    //Create the Oiii Stars list view
   this.textOIIIStars = new Label(this);
   this.textOIIIStars.text = "Oiii Stars: "
   this.viewlistOIIIStars = new ViewList(this);
   this.viewlistOIIIStars.getMainViews();
   this.viewlistOIIIStars.enabled = false;
   this.viewlistOIIIStars.onViewSelected = function(view) {
      ForaxxParameters.oiiiStarsView = view;
   }

   //Create the Sii list view
   this.textSII = new Label(this);
   this.textSII.text = "Sii: "
   this.viewlistSII = new ViewList(this);
   this.viewlistSII.getMainViews();
   this.viewlistSII.enabled = false;
   this.viewlistSII.onViewSelected = function(view) {
      ForaxxParameters.siiView = view;
   }

   //Create the Sii Stars list view
   this.textSIIStars = new Label(this);
   this.textSIIStars.text = "Sii Stars: "
   this.viewlistSIIStars = new ViewList(this);
   this.viewlistSIIStars.getMainViews();
   this.viewlistSIIStars.enabled = false;
   this.viewlistSIIStars.onViewSelected = function(view) {
      ForaxxParameters.siiStarsView = view;
   }


   /*********************************************************************************************************
    * *******************************************************************************************************
    *
    *  The Script Buttons
    *
    *
    * *******************************************************************************************************
    * ******************************************************************************************************/

   //Execute Button
   this.execButton = new PushButton(this);
   this.execButton.text = "Execute";
   this.execButton.width = 40;
   this.execButton.enabled = true;
   this.execButton.onClick = () => {
      this.ok();
   }

   //Browser Button
   this.websiteButton = new ToolButton(this);
   this.websiteButton.icon = this.scaledResource(":/icons/internet.png");
   this.websiteButton.setScaledFixedSize(24, 24);
   this.websiteButton.toolTip = "Opens a browser window pointing to the Coldest Nights - Dynamic Pixelmath Expressions."
   this.websiteButton.onClick = function ()
   {
      Dialog.openBrowser("https://thecoldestnights.com/2020/06/pixinsight-dynamic-narrowband-combinations-with-pixelmath/");
   }

   //VERSION and BUILD Numbers
   this.vBuild = new Label(this);
   this.vBuild.text = "Version - " + VERSION + " Build: " + BUILD;



/*****************************************************************************************************
* * ***************************************************************************************************
* Sizer Arrangement
*
* * ****************************************************************************************************
* ***************************************************************************************************/

   //HA View List
   this.haSizer = new HorizontalSizer;
   this.haSizer.margin = 8;
   this.haSizer.add(this.textHA);
   this.haSizer.addSpacing(2);
   this.haSizer.add(this.viewlistHA);
   this.haSizer.addSpacing(5);
   this.haSizer.addStretch();
   this.haSizer.add(this.textHAStars);
   this.haSizer.addSpacing(2);
   this.haSizer.add(this.viewlistHAStars);

    //oiii View List
   this.oiiiSizer = new HorizontalSizer;
   this.oiiiSizer.margin = 8;
   this.oiiiSizer.add(this.textOIII);
   this.oiiiSizer.addSpacing(2);
   this.oiiiSizer.add(this.viewlistOIII);
   this.oiiiSizer.addSpacing(5);
   this.oiiiSizer.addStretch();
   this.oiiiSizer.add(this.textOIIIStars);
   this.oiiiSizer.addSpacing(2);
   this.oiiiSizer.add(this.viewlistOIIIStars);

    //Sii View List
   this.siiSizer = new HorizontalSizer;
   this.siiSizer.margin = 8;
   this.siiSizer.add(this.textSII);
   this.siiSizer.addSpacing(2);
   this.siiSizer.add(this.viewlistSII);
   this.siiSizer.addSpacing(5);
   this.siiSizer.addStretch();
   this.siiSizer.add(this.textSIIStars);
   this.siiSizer.addSpacing(2);
   this.siiSizer.add(this.viewlistSIIStars);

   //Number of  Channels Selection Pane
   this.channelsHsizer = new HorizontalSizer;
   this.channelsHsizer.add(this.twoChannel);
   this.channelsHsizer.add(this.threeChannel);
   this.channelsVsizer = new VerticalSizer;
   this.channelsVsizer.add(this.channelsHsizer);
   this.channelsVsizer.addSpacing(5);
   this.channelsVsizer.add(this.onlyForaxx);
   this.channelsGroup = new GroupBox( this );
   this.channelsGroup.title = "Number of Channels";
   this.channelsGroup.sizer = this.channelsVsizer;

   //Channel Selection Pane
   this.channelSelectionsizer = new VerticalSizer;
   this.channelSelectionsizer.add(this.siiSizer);
   this.channelSelectionsizer.add(this.haSizer);
   this.channelSelectionsizer.add(this.oiiiSizer);
   this.viewGroup = new GroupBox( this );
   this.viewGroup.title = "Channel Selection";
   this.viewGroup.sizer = this.channelSelectionsizer;

   //Bottom Buttons
   this.bottomSizer = new HorizontalSizer;
   this.bottomSizer.margin = 8;

   this.bottomSizer.add(this.websiteButton);
   this.bottomSizer.addStretch();
   this.bottomSizer.add(this.vBuild);
   this.bottomSizer.addStretch();
   this.bottomSizer.add(this.execButton);


   this.sizer = new VerticalSizer;
   this.sizer.margin = 8;
   this.sizer.add(this.title);
   this.sizer.addSpacing(8);
   this.sizer.add(this.channelsGroup);
   this.sizer.addSpacing(8);
   this.sizer.add(this.viewGroup);
   this.sizer.addSpacing(8);
   this.sizer.add(this.bottomSizer);
   this.sizer.addStretch();


}
}
