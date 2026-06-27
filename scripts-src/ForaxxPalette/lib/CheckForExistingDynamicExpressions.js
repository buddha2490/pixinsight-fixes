function checkForExistingDynamicExpressions( id )
{
   var v = View.viewById(id);
   return v != null && !v.isNull;
}

function uniqueViewId( baseId )
{
   var id = baseId;
   for ( var count = 0;  checkForExistingDynamicExpressions( id ); )
      id = baseId + format( "%02d", ++count );
   return id;
}

function updateFileNames()
{
   var oViewId = uniqueViewId("o");
   var hoViewId = uniqueViewId("ho");
   var foraxxViewId = uniqueViewId("Foraxx");

   ForaxxParameters.oFactorView = oViewId;
   ForaxxParameters.hoFactorView = hoViewId;
   ForaxxParameters.foraxxView = foraxxViewId;

}
