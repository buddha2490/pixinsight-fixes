pixinsight-fixes

This repo is for editting Pixinsight scripts that no longer work after updating to 9.4.  Pixinsight 9.4 change the JS engine and it broke a lot of scripts and processes.  Pixinsight has provided a tool for developers to migrate their products, but we are still waiting on these developers to actually update their tools.

Most of these scripts are available in the script editor via PixInsight, so we can make the required changes directly.  This repo will host any of these changes we make so we can continue to use our required scripts.

Note:  Pixinsight will not use these scripts with the pair security signing.  You will need to go into the /applications/pixinsight/src/scripts and delete the security signing file.

To import these scripts:

Scripts --> feature scripts --> add

Select the scripts folder and import everything.  They will be available in the /.../scripts folder and should show up in the Scripts dropdown in PixInsight.


