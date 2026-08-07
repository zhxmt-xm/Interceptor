using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;

internal static class Program
{
    private const uint ErrorSuccess = 0;
    private const uint NetIsoFlagForceComputeBinaries = 1;

    private sealed class AppContainerInfo
    {
        internal string AppContainerSid;
        internal string UserSid;
        internal string PackageFamilyName;
        internal string DisplayName;
        internal string Description;
        internal string PackageFullName;
        internal string WorkingDirectory;
        internal List<string> Binaries;
        internal List<string> Capabilities;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SidAndAttributes
    {
        internal IntPtr Sid;
        internal uint Attributes;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct AppContainerCapabilities
    {
        internal uint Count;
        internal IntPtr Capabilities;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct AppContainerBinaries
    {
        internal uint Count;
        internal IntPtr Binaries;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeAppContainer
    {
        internal IntPtr AppContainerSid;
        internal IntPtr UserSid;
        internal IntPtr AppContainerName;
        internal IntPtr DisplayName;
        internal IntPtr Description;
        internal AppContainerCapabilities Capabilities;
        internal AppContainerBinaries Binaries;
        internal IntPtr WorkingDirectory;
        internal IntPtr PackageFullName;
    }

    [DllImport("FirewallAPI.dll")]
    private static extern uint NetworkIsolationEnumAppContainers(
        uint flags,
        out uint count,
        out IntPtr appContainers);

    [DllImport("FirewallAPI.dll")]
    private static extern uint NetworkIsolationGetAppContainerConfig(
        out uint count,
        out IntPtr appContainerSids);

    [DllImport("FirewallAPI.dll")]
    private static extern uint NetworkIsolationSetAppContainerConfig(
        uint count,
        IntPtr appContainerSids);

    [DllImport("FirewallAPI.dll")]
    private static extern uint NetworkIsolationFreeAppContainers(IntPtr appContainers);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool ConvertSidToStringSid(
        IntPtr sid,
        out IntPtr stringSid);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool ConvertStringSidToSid(
        string stringSid,
        out IntPtr sid);

    [DllImport("shlwapi.dll", CharSet = CharSet.Unicode)]
    private static extern int SHLoadIndirectString(
        string source,
        StringBuilder output,
        uint outputLength,
        IntPtr reserved);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetProcessHeap();

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool HeapFree(
        IntPtr heap,
        uint flags,
        IntPtr memory);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr LocalFree(IntPtr memory);

    private static int Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        try
        {
            if (args.Length == 1 && args[0] == "list")
            {
                List<string> exemptSids = ReadExemptSids();
                List<AppContainerInfo> appContainers = ReadAppContainers();
                Console.WriteLine(ToJson(appContainers, exemptSids));
                return 0;
            }

            if (args.Length == 3 && args[0] == "set")
            {
                bool enabled;
                if (args[2] == "enabled")
                {
                    enabled = true;
                }
                else if (args[2] == "disabled")
                {
                    enabled = false;
                }
                else
                {
                    throw new ArgumentException("AppContainer state must be enabled or disabled.");
                }

                List<AppContainerInfo> appContainers = ReadAppContainers();
                SetExemption(appContainers, args[1], enabled);
                Console.WriteLine(ToJson(appContainers, ReadExemptSids()));
                return 0;
            }

            Console.Error.WriteLine("Usage: app-container-helper list | set <app-container-sid> <enabled|disabled>");
            return 2;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.GetType().Name + ": " + error.Message);
            return 1;
        }
    }

    private static List<AppContainerInfo> ReadAppContainers()
    {
        uint count;
        IntPtr appContainers;
        uint error = NetworkIsolationEnumAppContainers(
            NetIsoFlagForceComputeBinaries,
            out count,
            out appContainers);
        if (error != ErrorSuccess)
        {
            throw new Win32Exception((int)error, "Unable to enumerate Windows app containers.");
        }

        List<AppContainerInfo> result = new List<AppContainerInfo>();
        try
        {
            int itemSize = Marshal.SizeOf(typeof(NativeAppContainer));
            for (uint index = 0; index < count; index++)
            {
                NativeAppContainer appContainer = (NativeAppContainer)Marshal.PtrToStructure(
                    IntPtr.Add(appContainers, checked((int)index * itemSize)),
                    typeof(NativeAppContainer));
                result.Add(new AppContainerInfo
                {
                    AppContainerSid = SidString(appContainer.AppContainerSid),
                    UserSid = NullableSidString(appContainer.UserSid),
                    PackageFamilyName = NativeString(appContainer.AppContainerName),
                    DisplayName = ResolveIndirectString(NativeString(appContainer.DisplayName)),
                    Description = ResolveIndirectString(NativeString(appContainer.Description)),
                    PackageFullName = NativeString(appContainer.PackageFullName),
                    WorkingDirectory = NativeString(appContainer.WorkingDirectory),
                    Binaries = ReadBinaries(appContainer.Binaries),
                    Capabilities = ReadCapabilities(appContainer.Capabilities),
                });
            }
        }
        finally
        {
            if (appContainers != IntPtr.Zero)
            {
                NetworkIsolationFreeAppContainers(appContainers);
            }
        }

        result.Sort(delegate(AppContainerInfo left, AppContainerInfo right)
        {
            string leftName = left.DisplayName ?? left.PackageFamilyName ?? left.AppContainerSid;
            string rightName = right.DisplayName ?? right.PackageFamilyName ?? right.AppContainerSid;
            return StringComparer.OrdinalIgnoreCase.Compare(leftName, rightName);
        });
        return result;
    }

    private static List<string> ReadExemptSids()
    {
        uint count;
        IntPtr appContainerSids;
        uint error = NetworkIsolationGetAppContainerConfig(out count, out appContainerSids);
        if (error != ErrorSuccess)
        {
            throw new Win32Exception((int)error, "Unable to read AppContainer loopback exemptions.");
        }

        List<string> result = new List<string>();
        IntPtr processHeap = GetProcessHeap();
        int itemSize = Marshal.SizeOf(typeof(SidAndAttributes));
        try
        {
            for (uint index = 0; index < count; index++)
            {
                SidAndAttributes item = (SidAndAttributes)Marshal.PtrToStructure(
                    IntPtr.Add(appContainerSids, checked((int)index * itemSize)),
                    typeof(SidAndAttributes));
                result.Add(SidString(item.Sid));
            }
        }
        finally
        {
            if (appContainerSids != IntPtr.Zero)
            {
                for (uint index = 0; index < count; index++)
                {
                    SidAndAttributes item = (SidAndAttributes)Marshal.PtrToStructure(
                        IntPtr.Add(appContainerSids, checked((int)index * itemSize)),
                        typeof(SidAndAttributes));
                    if (item.Sid != IntPtr.Zero)
                    {
                        HeapFree(processHeap, 0, item.Sid);
                    }
                }
                HeapFree(processHeap, 0, appContainerSids);
            }
        }

        result.Sort(StringComparer.OrdinalIgnoreCase);
        return result;
    }

    private static void SetExemption(
        List<AppContainerInfo> appContainers,
        string targetSid,
        bool enabled)
    {
        if (!targetSid.StartsWith("S-1-15-2-", StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException("Target SID is not an AppContainer SID.");
        }

        bool found = false;
        foreach (AppContainerInfo appContainer in appContainers)
        {
            if (StringComparer.OrdinalIgnoreCase.Equals(appContainer.AppContainerSid, targetSid))
            {
                targetSid = appContainer.AppContainerSid;
                found = true;
                break;
            }
        }
        if (!found)
        {
            throw new ArgumentException("Target AppContainer SID is not present on this system.");
        }

        List<string> current = ReadExemptSids();
        HashSet<string> intendedSet = new HashSet<string>(current, StringComparer.OrdinalIgnoreCase);
        if (enabled)
        {
            intendedSet.Add(targetSid);
        }
        else
        {
            intendedSet.Remove(targetSid);
        }
        List<string> intended = new List<string>(intendedSet);
        intended.Sort(StringComparer.OrdinalIgnoreCase);

        if (!StringSetsEqual(current, intended))
        {
            WriteExemptSids(intended);
        }
        List<string> verified = ReadExemptSids();
        if (!StringSetsEqual(intended, verified))
        {
            throw new InvalidOperationException("AppContainer exemptions did not match after write.");
        }
    }

    private static void WriteExemptSids(List<string> exemptSids)
    {
        List<IntPtr> nativeSids = new List<IntPtr>();
        IntPtr items = IntPtr.Zero;
        try
        {
            int itemSize = Marshal.SizeOf(typeof(SidAndAttributes));
            if (exemptSids.Count > 0)
            {
                items = Marshal.AllocHGlobal(checked(itemSize * exemptSids.Count));
            }
            for (int index = 0; index < exemptSids.Count; index++)
            {
                IntPtr nativeSid;
                if (!ConvertStringSidToSid(exemptSids[index], out nativeSid))
                {
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to parse an AppContainer SID.");
                }
                nativeSids.Add(nativeSid);
                SidAndAttributes item = new SidAndAttributes
                {
                    Sid = nativeSid,
                    Attributes = 0,
                };
                Marshal.StructureToPtr(item, IntPtr.Add(items, index * itemSize), false);
            }

            uint error = NetworkIsolationSetAppContainerConfig((uint)exemptSids.Count, items);
            if (error != ErrorSuccess)
            {
                throw new Win32Exception((int)error, "Unable to write AppContainer loopback exemptions.");
            }
        }
        finally
        {
            foreach (IntPtr nativeSid in nativeSids)
            {
                LocalFree(nativeSid);
            }
            if (items != IntPtr.Zero)
            {
                Marshal.FreeHGlobal(items);
            }
        }
    }

    private static bool StringSetsEqual(List<string> left, List<string> right)
    {
        return left.Count == right.Count &&
            new HashSet<string>(left, StringComparer.OrdinalIgnoreCase).SetEquals(right);
    }

    private static List<string> ReadBinaries(AppContainerBinaries binaries)
    {
        List<string> result = new List<string>();
        for (uint index = 0; index < binaries.Count; index++)
        {
            IntPtr value = Marshal.ReadIntPtr(
                binaries.Binaries,
                checked((int)index * IntPtr.Size));
            string path = NativeString(value);
            if (path != null)
            {
                result.Add(path);
            }
        }
        return result;
    }

    private static List<string> ReadCapabilities(AppContainerCapabilities capabilities)
    {
        List<string> result = new List<string>();
        int itemSize = Marshal.SizeOf(typeof(SidAndAttributes));
        for (uint index = 0; index < capabilities.Count; index++)
        {
            SidAndAttributes item = (SidAndAttributes)Marshal.PtrToStructure(
                IntPtr.Add(capabilities.Capabilities, checked((int)index * itemSize)),
                typeof(SidAndAttributes));
            result.Add(SidString(item.Sid));
        }
        return result;
    }

    private static string SidString(IntPtr sid)
    {
        if (sid == IntPtr.Zero)
        {
            throw new InvalidOperationException("Windows returned an empty AppContainer SID.");
        }

        IntPtr stringSid;
        if (!ConvertSidToStringSid(sid, out stringSid))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to format an AppContainer SID.");
        }
        try
        {
            return Marshal.PtrToStringUni(stringSid);
        }
        finally
        {
            LocalFree(stringSid);
        }
    }

    private static string NullableSidString(IntPtr sid)
    {
        return sid == IntPtr.Zero ? null : SidString(sid);
    }

    private static string NativeString(IntPtr value)
    {
        return value == IntPtr.Zero ? null : Marshal.PtrToStringUni(value);
    }

    private static string ResolveIndirectString(string value)
    {
        if (value == null || !value.StartsWith("@{", StringComparison.Ordinal))
        {
            return value;
        }

        StringBuilder output = new StringBuilder(2048);
        return SHLoadIndirectString(value, output, (uint)output.Capacity, IntPtr.Zero) == 0
            ? output.ToString()
            : value;
    }

    private static string ToJson(
        List<AppContainerInfo> appContainers,
        List<string> exemptSids)
    {
        StringBuilder result = new StringBuilder("{\"containers\":[");
        for (int index = 0; index < appContainers.Count; index++)
        {
            if (index > 0)
            {
                result.Append(',');
            }
            result.Append(AppContainerJson(appContainers[index]));
        }
        result.Append("],\"exemptSids\":");
        result.Append(StringArrayJson(exemptSids));
        result.Append('}');
        return result.ToString();
    }

    private static string AppContainerJson(AppContainerInfo appContainer)
    {
        return "{" +
            "\"appContainerSid\":" + JsonString(appContainer.AppContainerSid) + "," +
            "\"userSid\":" + JsonString(appContainer.UserSid) + "," +
            "\"packageFamilyName\":" + JsonString(appContainer.PackageFamilyName) + "," +
            "\"displayName\":" + JsonString(appContainer.DisplayName) + "," +
            "\"description\":" + JsonString(appContainer.Description) + "," +
            "\"packageFullName\":" + JsonString(appContainer.PackageFullName) + "," +
            "\"workingDirectory\":" + JsonString(appContainer.WorkingDirectory) + "," +
            "\"binaries\":" + StringArrayJson(appContainer.Binaries) + "," +
            "\"capabilities\":" + StringArrayJson(appContainer.Capabilities) +
            "}";
    }

    private static string StringArrayJson(List<string> values)
    {
        StringBuilder result = new StringBuilder("[");
        for (int index = 0; index < values.Count; index++)
        {
            if (index > 0)
            {
                result.Append(',');
            }
            result.Append(JsonString(values[index]));
        }
        result.Append(']');
        return result.ToString();
    }

    private static string JsonString(string value)
    {
        if (value == null)
        {
            return "null";
        }

        StringBuilder result = new StringBuilder("\"");
        foreach (char character in value)
        {
            switch (character)
            {
                case '\\': result.Append("\\\\"); break;
                case '"': result.Append("\\\""); break;
                case '\b': result.Append("\\b"); break;
                case '\f': result.Append("\\f"); break;
                case '\n': result.Append("\\n"); break;
                case '\r': result.Append("\\r"); break;
                case '\t': result.Append("\\t"); break;
                default:
                    if (character < 32)
                    {
                        result.Append("\\u" + ((int)character).ToString("x4", CultureInfo.InvariantCulture));
                    }
                    else
                    {
                        result.Append(character);
                    }
                    break;
            }
        }
        result.Append('"');
        return result.ToString();
    }
}