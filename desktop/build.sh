#!/bin/sh
# Builds public/downloads/StudyWithAhmad.exe with the C# compiler that ships with Windows (.NET Framework 4).
# Run from the project root in Git Bash:  sh desktop/build.sh
set -e
CSC=/c/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe
mkdir -p public/downloads
# csc wants Windows-style paths
"$CSC" -nologo -target:winexe -optimize+ \
  "-win32icon:desktop\\app.ico" \
  "-out:public\\downloads\\StudyWithAhmad.exe" \
  -r:System.Windows.Forms.dll \
  "desktop\\StudyWithAhmad.cs"
echo "Built public/downloads/StudyWithAhmad.exe"
