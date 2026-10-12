using System;
using System.ComponentModel;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;

internal static class Program
{
    // Broadcasts a WinINet settings refresh.
    private const int InternetOptionRefresh = 37;
    // Broadcasts that WinINet settings changed.
    private const int InternetOptionSettingsChanged = 39;
    // Reads or writes per-connection proxy options.
    private const int InternetOptionPerConnectionOption = 75;
    // Identifies the per-connection flags option.
    private const int InternetPerConnFlags = 1;
    // Reads the configured connection flags independently of WinINet detection state.
    private const int InternetPerConnFlagsUi = 10;
    // Identifies the explicit proxy server option.
    private const int InternetPerConnProxyServer = 2;
    // Identifies the proxy bypass list option.
    private const int InternetPerConnProxyBypass = 3;
    // Identifies the PAC URL option.
    private const int InternetPerConnAutoConfigUrl = 4;
    // Indicates that an explicit proxy is enabled.
    private const int ProxyTypeProxy = 2;
    // Indicates that automatic proxy discovery is enabled.
    private const int ProxyTypeAutoDetect = 8;
    // Requests DHCP discovery before DNS discovery.
    private const uint WinHttpAutoDetectTypeDhcp = 1;
    private const uint WinHttpAutoDetectTypeDnsA = 2;

    private sealed class ProxySettings
    {
        // Complete WinINet per-connection flags.
        internal int Flags;
        // Explicit proxy server string.
        internal string ProxyServer;
        // Proxy bypass list.
        internal string BypassList;
        // PAC URL.
        internal string PacUrl;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InternetPerConnOptionValue
    {
        // Numeric option payload.
        [FieldOffset(0)] internal int DwordValue;
        // String option payload.
        [FieldOffset(0)] internal IntPtr StringValue;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct InternetPerConnOption
    {
        // WinINet option identifier.
        internal int Option;
        // Value associated with the option identifier.
        internal InternetPerConnOptionValue Value;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct InternetPerConnOptionList
    {
        // Native structure size.
        internal int Size;
        // Null selects the default LAN connection.
        internal IntPtr Connection;
        // Number of entries in Options.
        internal int OptionCount;
        // WinINet error index populated on failure.
        internal int OptionError;
        // Pointer to the contiguous option array.
        internal IntPtr Options;
    }

    [DllImport("wininet.dll", CharSet = CharSet.Unicode, EntryPoint = "InternetQueryOptionW", SetLastError = true)]
    private static extern bool InternetQueryOption(
        IntPtr internet,
        int option,
        ref InternetPerConnOptionList buffer,
        ref int bufferLength);

    [DllImport("wininet.dll", CharSet = CharSet.Unicode, EntryPoint = "InternetSetOptionW", SetLastError = true)]
    private static extern bool InternetSetPerConnectionOption(
        IntPtr internet,
        int option,
        ref InternetPerConnOptionList buffer,
        int bufferLength);

    [DllImport("wininet.dll", CharSet = CharSet.Unicode, EntryPoint = "InternetSetOptionW", SetLastError = true)]
    private static extern bool InternetSetNotification(
        IntPtr internet,
        int option,
        IntPtr buffer,
        int bufferLength);

    [DllImport("winhttp.dll", SetLastError = true)]
    private static extern bool WinHttpDetectAutoProxyConfigUrl(uint flags, out IntPtr autoConfigUrl);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr GlobalFree(IntPtr memory);

    private static int Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        try
        {
            if (args.Length == 1 && args[0] == "get")
            {
                Console.WriteLine(ToJson(ReadSettings()));
                return 0;
            }

            if (args.Length == 1 && args[0] == "discover-wpad")
            {
                return DiscoverWpadPacUrl();
            }

            if (args.Length == 5 && args[0] == "set")
            {
                int flags = int.Parse(args[1], NumberStyles.None, CultureInfo.InvariantCulture);
                SetSettings(new ProxySettings
                {
                    Flags = flags,
                    ProxyServer = Decode(args[2]),
                    BypassList = Decode(args[3]),
                    PacUrl = Decode(args[4]),
                });
                Console.WriteLine(ToJson(ReadSettings()));
                return 0;
            }

            Console.Error.WriteLine("Usage: wininet-proxy-helper get | discover-wpad | set <flags> <proxy> <bypass> <pac>");
            return 2;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.GetType().Name + ": " + error.Message);
            return 1;
        }
    }

    // Returns only the discovered URL; PAC retrieval and evaluation remain in Core.
    private static int DiscoverWpadPacUrl()
    {
        IntPtr autoConfigUrl = IntPtr.Zero;
        try
        {
            if (!WinHttpDetectAutoProxyConfigUrl(
                WinHttpAutoDetectTypeDhcp | WinHttpAutoDetectTypeDnsA,
                out autoConfigUrl))
            {
                int error = Marshal.GetLastWin32Error();
                Console.Error.WriteLine("{\"win32Error\":" + error.ToString(CultureInfo.InvariantCulture) + "}");
                return 1;
            }
            Console.WriteLine("{\"pacUrl\":" + JsonString(Marshal.PtrToStringUni(autoConfigUrl)) + "}");
            return 0;
        }
        finally
        {
            if (autoConfigUrl != IntPtr.Zero) GlobalFree(autoConfigUrl);
        }
    }

    private static ProxySettings ReadSettings()
    {
        InternetPerConnOption[] options = CreateOptions();
        IntPtr optionsBuffer = AllocateOptions(options);
        try
        {
            InternetPerConnOptionList list = CreateOptionList(optionsBuffer, options.Length);
            int size = list.Size;
            if (!InternetQueryOption(
                IntPtr.Zero,
                InternetOptionPerConnectionOption,
                ref list,
                ref size))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to read WinINet proxy settings.");
            }

            options = ReadOptions(optionsBuffer, options.Length);
            return new ProxySettings
            {
                Flags = options[0].Value.DwordValue,
                ProxyServer = ReadAndFreeString(options[1].Value.StringValue),
                BypassList = ReadAndFreeString(options[2].Value.StringValue),
                PacUrl = ReadAndFreeString(options[3].Value.StringValue),
            };
        }
        finally
        {
            Marshal.FreeCoTaskMem(optionsBuffer);
        }
    }

    private static void SetSettings(ProxySettings settings)
    {
        IntPtr proxy = AllocateString(settings.ProxyServer);
        IntPtr bypass = AllocateString(settings.BypassList);
        IntPtr pac = AllocateString(settings.PacUrl);
        InternetPerConnOption[] options = new InternetPerConnOption[]
        {
            CreateDwordOption(InternetPerConnFlags, settings.Flags),
            CreateStringOption(InternetPerConnProxyServer, proxy),
            CreateStringOption(InternetPerConnProxyBypass, bypass),
            CreateStringOption(InternetPerConnAutoConfigUrl, pac),
        };
        IntPtr optionsBuffer = AllocateOptions(options);
        try
        {
            InternetPerConnOptionList list = CreateOptionList(optionsBuffer, options.Length);
            if (!InternetSetPerConnectionOption(
                IntPtr.Zero,
                InternetOptionPerConnectionOption,
                ref list,
                list.Size))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to write WinINet proxy settings.");
            }
            NotifySettingsChanged();
        }
        finally
        {
            Marshal.FreeCoTaskMem(optionsBuffer);
            FreeAllocatedString(proxy);
            FreeAllocatedString(bypass);
            FreeAllocatedString(pac);
        }
    }

    private static void NotifySettingsChanged()
    {
        if (!InternetSetNotification(IntPtr.Zero, InternetOptionSettingsChanged, IntPtr.Zero, 0))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to broadcast WinINet settings change.");
        }
        if (!InternetSetNotification(IntPtr.Zero, InternetOptionRefresh, IntPtr.Zero, 0))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to refresh WinINet settings.");
        }
    }

    private static InternetPerConnOption[] CreateOptions()
    {
        return new InternetPerConnOption[]
        {
            CreateDwordOption(InternetPerConnFlagsUi, 0),
            CreateStringOption(InternetPerConnProxyServer, IntPtr.Zero),
            CreateStringOption(InternetPerConnProxyBypass, IntPtr.Zero),
            CreateStringOption(InternetPerConnAutoConfigUrl, IntPtr.Zero),
        };
    }

    private static InternetPerConnOption CreateDwordOption(int option, int value)
    {
        InternetPerConnOption item = new InternetPerConnOption();
        item.Option = option;
        item.Value.DwordValue = value;
        return item;
    }

    private static InternetPerConnOption CreateStringOption(int option, IntPtr value)
    {
        InternetPerConnOption item = new InternetPerConnOption();
        item.Option = option;
        item.Value.StringValue = value;
        return item;
    }

    private static InternetPerConnOptionList CreateOptionList(IntPtr options, int count)
    {
        InternetPerConnOptionList list = new InternetPerConnOptionList();
        list.Size = Marshal.SizeOf(typeof(InternetPerConnOptionList));
        list.Connection = IntPtr.Zero;
        list.OptionCount = count;
        list.OptionError = 0;
        list.Options = options;
        return list;
    }

    private static IntPtr AllocateOptions(InternetPerConnOption[] options)
    {
        int optionSize = Marshal.SizeOf(typeof(InternetPerConnOption));
        IntPtr buffer = Marshal.AllocCoTaskMem(optionSize * options.Length);
        for (int index = 0; index < options.Length; index++)
        {
            Marshal.StructureToPtr(options[index], IntPtr.Add(buffer, index * optionSize), false);
        }
        return buffer;
    }

    private static InternetPerConnOption[] ReadOptions(IntPtr buffer, int count)
    {
        int optionSize = Marshal.SizeOf(typeof(InternetPerConnOption));
        InternetPerConnOption[] options = new InternetPerConnOption[count];
        for (int index = 0; index < count; index++)
        {
            options[index] = (InternetPerConnOption)Marshal.PtrToStructure(
                IntPtr.Add(buffer, index * optionSize),
                typeof(InternetPerConnOption));
        }
        return options;
    }

    private static string ReadAndFreeString(IntPtr value)
    {
        if (value == IntPtr.Zero)
        {
            return null;
        }
        string result = Marshal.PtrToStringUni(value);
        GlobalFree(value);
        return result;
    }

    private static IntPtr AllocateString(string value)
    {
        return value == null ? IntPtr.Zero : Marshal.StringToHGlobalUni(value);
    }

    private static void FreeAllocatedString(IntPtr value)
    {
        if (value != IntPtr.Zero)
        {
            Marshal.FreeHGlobal(value);
        }
    }

    private static string Decode(string value)
    {
        return value == "-" ? null : Encoding.UTF8.GetString(Convert.FromBase64String(value));
    }

    private static string ToJson(ProxySettings settings)
    {
        return "{" +
            "\"flags\":" + settings.Flags.ToString(CultureInfo.InvariantCulture) + "," +
            "\"proxyEnabled\":" + (((settings.Flags & ProxyTypeProxy) != 0) ? "true" : "false") + "," +
            "\"autoDetect\":" + (((settings.Flags & ProxyTypeAutoDetect) != 0) ? "true" : "false") + "," +
            "\"proxyServer\":" + JsonString(settings.ProxyServer) + "," +
            "\"bypassList\":" + JsonString(settings.BypassList) + "," +
            "\"pacUrl\":" + JsonString(settings.PacUrl) +
            "}";
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