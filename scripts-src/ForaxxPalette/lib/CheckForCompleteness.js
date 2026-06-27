function checkForCompleteness()
{
   if (ForaxxParameters.twoChannels == true && ForaxxParameters.onlyForaxx == false)
   {
      if (ForaxxParameters.haView && ForaxxParameters.haStarsView && ForaxxParameters.oiiiView && ForaxxParameters.oiiiStarsView)
      {
         ForaxxParameters.okToRun = true;
      }
      else
      {
         let warnMessage = "You did not choose the required images to complete a Foraxx expression. Sorry the script cannot continue.";
         let msgReturn = (new MessageBox( warnMessage, "Warning", StdIcon_Warning, StdButton_Ok )).execute();
         return;
      }
   }
   else if (ForaxxParameters.twoChannels == true && ForaxxParameters.onlyForaxx == true)
   {
      if (ForaxxParameters.haView && ForaxxParameters.oiiiView)
      {
         ForaxxParameters.okToRun = true;
      }
      else
      {
         let warnMessage = "You did not choose the required images to complete a Foraxx expression. Sorry the script cannot continue.";
         let msgReturn = (new MessageBox( warnMessage, "Warning", StdIcon_Warning, StdButton_Ok )).execute();
         return;
      }
   }
   else if (ForaxxParameters.twoChannels == false && ForaxxParameters.onlyForaxx == false)
   {
      if (ForaxxParameters.haView && ForaxxParameters.haStarsView && ForaxxParameters.oiiiView && ForaxxParameters.oiiiStarsView && ForaxxParameters.siiView && ForaxxParameters.siiStarsView)
      {
         ForaxxParameters.okToRun = true;
      }
      else
      {
         let warnMessage = "You did not choose the required images to complete a Foraxx expression. Sorry the script cannot continue.";
         let msgReturn = (new MessageBox( warnMessage, "Warning", StdIcon_Warning, StdButton_Ok )).execute();
         return;
      }
   }
    else if (ForaxxParameters.twoChannels == false && ForaxxParameters.onlyForaxx == true)
   {
      if (ForaxxParameters.haView && ForaxxParameters.oiiiView && ForaxxParameters.siiView)
      {
         ForaxxParameters.okToRun = true;
      }
      else
      {
         let warnMessage = "You did not choose the required images to complete a Foraxx expression. Sorry the script cannot continue.";
         let msgReturn = (new MessageBox( warnMessage, "Warning", StdIcon_Warning, StdButton_Ok )).execute();
         return;
      }
   }
}

function checkButtonLogic()
{
   if (ForaxxParameters.twoChannels && !ForaxxParameters.onlyForaxx)
   {
      ForaxxParameters.buttonLogic = "0";
   }
   else if (ForaxxParameters.twoChannels && ForaxxParameters.onlyForaxx)
   {
      ForaxxParameters.buttonLogic = "1";
   }
   else if (!ForaxxParameters.twoChannels && !ForaxxParameters.onlyForaxx)
   {
      ForaxxParameters.buttonLogic = "2";
   }
   else if (!ForaxxParameters.twoChannels && ForaxxParameters.onlyForaxx)
   {
      ForaxxParameters.buttonLogic = "3";
   }
}
