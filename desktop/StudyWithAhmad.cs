// Study with Ahmad for Windows: a small launcher that opens the planner in its own app window
// (Microsoft Edge or Chrome "app mode": no tabs, no address bar).
// The first run copies the app to %LOCALAPPDATA%\Programs\StudyWithAhmad and adds Start Menu and
// Desktop shortcuts. Run with /uninstall to remove it again.
//
// Build (no Visual Studio needed): see desktop/build.sh

using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("Study with Ahmad")]
[assembly: AssemblyProduct("Study with Ahmad")]
[assembly: AssemblyDescription("Study planner for Punjab Board Matric and Inter students")]
[assembly: AssemblyCompany("Ahmad Ansari")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

static class Program
{
    const string AppName = "Study with Ahmad";
    const string SiteUrl = "https://study-with-ahmad.vercel.app/?source=desktop";

    static readonly string InstallDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "StudyWithAhmad");
    static readonly string InstalledExe = Path.Combine(InstallDir, "StudyWithAhmad.exe");
    static readonly string StartMenuLink = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.Programs), AppName + ".lnk");
    static readonly string DesktopLink = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), AppName + ".lnk");

    [STAThread]
    static void Main(string[] args)
    {
        try
        {
            if (args.Length > 0 && args[0].Trim('/', '-').ToLowerInvariant() == "uninstall")
            {
                Uninstall();
                return;
            }
            string self = Assembly.GetExecutingAssembly().Location;
            if (!string.Equals(Path.GetFullPath(self), Path.GetFullPath(InstalledExe), StringComparison.OrdinalIgnoreCase))
                Install(self);
            Launch();
        }
        catch (Exception ex)
        {
            MessageBox.Show("Could not start " + AppName + ":\n\n" + ex.Message, AppName,
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    static void Install(string self)
    {
        Directory.CreateDirectory(InstallDir);
        File.Copy(self, InstalledExe, true);
        CreateShortcut(StartMenuLink);
        CreateShortcut(DesktopLink);
    }

    static void Uninstall()
    {
        foreach (string link in new[] { StartMenuLink, DesktopLink })
            if (File.Exists(link)) File.Delete(link);
        // The running exe cannot delete itself, so cmd removes the folder a moment after we exit.
        Process.Start(new ProcessStartInfo("cmd.exe",
            "/c timeout /t 2 >nul & rmdir /s /q \"" + InstallDir + "\"") { CreateNoWindow = true, UseShellExecute = false });
        MessageBox.Show(AppName + " has been removed from this PC.", AppName);
    }

    static void CreateShortcut(string path)
    {
        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        object shell = Activator.CreateInstance(shellType);
        object link = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { path });
        Type linkType = link.GetType();
        linkType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, link, new object[] { InstalledExe });
        linkType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, link, new object[] { InstallDir });
        linkType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, link, new object[] { InstalledExe + ",0" });
        linkType.InvokeMember("Description", BindingFlags.SetProperty, null, link, new object[] { "Study planner for PTB Matric and Inter" });
        linkType.InvokeMember("Save", BindingFlags.InvokeMethod, null, link, null);
    }

    static void Launch()
    {
        string browser = FindBrowser();
        if (browser == null)
        {
            // No Edge or Chrome: fall back to the default browser.
            Process.Start(SiteUrl);
            return;
        }
        // A separate profile keeps the app in its own window and remembers the sign-in.
        string profile = Path.Combine(InstallDir, "profile");
        Process.Start(new ProcessStartInfo(browser,
            "--app=\"" + SiteUrl + "\" --user-data-dir=\"" + profile + "\" --window-size=1280,820 --no-first-run --no-default-browser-check")
            { UseShellExecute = false });
    }

    static string FindBrowser()
    {
        string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string[] candidates =
        {
            Path.Combine(pf86, @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(pf, @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(pf, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(pf86, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(local, @"Google\Chrome\Application\chrome.exe"),
        };
        foreach (string c in candidates)
            if (File.Exists(c)) return c;
        return null;
    }
}
