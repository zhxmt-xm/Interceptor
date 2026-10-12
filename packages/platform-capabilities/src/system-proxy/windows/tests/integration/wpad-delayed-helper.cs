using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text;
using System.Threading;

internal static class Program
{
    // Remains alive beyond the product deadline, but exits independently if the tested deadline is missing.
    private static int Main(string[] args)
    {
        if (args.Length != 1 || args[0] != "discover-wpad") return 2;
        string pidPath = Path.ChangeExtension(typeof(Program).Assembly.Location, ".pid");
        File.WriteAllText(pidPath, Process.GetCurrentProcess().Id.ToString(CultureInfo.InvariantCulture), new UTF8Encoding(false));
        Thread.Sleep(40000);
        Console.WriteLine("{\"pacUrl\":\"http://wpad.fixture.test/wpad.dat\"}");
        return 0;
    }
}
