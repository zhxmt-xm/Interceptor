using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32;

/// <summary>
/// 反查本机发起流量的客户端进程：给定代理监听端口，输出所有连向该端口的 TCP
/// 连接的“客户端源端口 → 进程 ID + 可执行文件路径”。Proxy Core 用 Mockttp 报告的
/// remotePort 查这张表，即可判断某条请求由哪个本地应用发出。
/// </summary>
internal static class Program
{
    private const int AddressFamilyIpv4 = 2;
    private const int AddressFamilyIpv6 = 23;
    private const int TcpTableOwnerPidAll = 5;
    private const int ProcessQueryLimitedInformation = 0x1000;
    private const uint NoError = 0;
    private const uint ErrorInsufficientBuffer = 122;
    private const int MaxImagePathLength = 32768;
    /// SIIGBF_ICONONLY：只要图标，不要文件内容缩略图。
    private const int ShellIconOnly = 0x4;
    private const uint SnapshotProcesses = 0x2;
    /// MSIX/UWP 包登记表；每个子键是一个包全名，带包根目录与显示名。
    private const string PackageRepositoryPath =
        @"Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\Repository\Packages";

    /// 缓存的进程 ID → 父进程 ID 映射；按需建立一次。
    private static Dictionary<int, int> parentProcessIds;
    /// 缓存的进程 ID → 可执行文件名（不含路径）；系统权限进程打不开句柄时只能靠它。
    private static Dictionary<int, string> processFileNames;
    /// 已安装应用索引：安装目录 → 系统登记名（前缀匹配；名字为空表示只用于归属判定）。
    private static Dictionary<string, string> installedAppDirectories;
    /// 已安装应用索引：主程序完整路径 → 系统登记名（精确匹配，优先于目录）。
    private static Dictionary<string, string> installedAppFiles;
    /// 已安装应用索引：安装目录 → 代表该应用的标识（主程序路径或 shell:AppsFolder\<AUMID>）。
    private static Dictionary<string, string> installedAppIdentities;
    /// Windows 目录；追溯不得跨过系统进程（services、svchost、explorer 等）。
    private static readonly string WindowsDirectory =
        Environment.GetFolderPath(Environment.SpecialFolder.Windows);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct ProcessEntry32
    {
        internal uint Size;
        internal uint Usage;
        internal uint ProcessId;
        internal IntPtr DefaultHeapId;
        internal uint ModuleId;
        internal uint Threads;
        internal uint ParentProcessId;
        internal int PriorityClassBase;
        internal uint Flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        internal string ExeFile;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint processId);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, EntryPoint = "Process32FirstW")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool Process32First(IntPtr snapshot, ref ProcessEntry32 entry);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, EntryPoint = "Process32NextW")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool Process32Next(IntPtr snapshot, ref ProcessEntry32 entry);

    [ComImport]
    [Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItemImageFactory
    {
        void GetImage(ShellSize size, int flags, out IntPtr bitmapHandle);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ShellSize
    {
        internal int Width;
        internal int Height;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BitmapInfo
    {
        internal int Type;
        internal int Width;
        internal int Height;
        internal int WidthBytes;
        internal ushort Planes;
        internal ushort BitsPerPixel;
        internal IntPtr Bits;
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    private static extern void SHCreateItemFromParsingName(
        [MarshalAs(UnmanagedType.LPWStr)] string path,
        IntPtr bindContext,
        ref Guid interfaceId,
        [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory factory);

    [DllImport("shlwapi.dll", CharSet = CharSet.Unicode)]
    private static extern int SHLoadIndirectString(
        string source,
        StringBuilder output,
        int outputLength,
        IntPtr reserved);

    /// 开始菜单快捷方式的 COM 解析器。
    [ComImport]
    [Guid("00021401-0000-0000-C000-000000000046")]
    private class ShellLink
    {
    }

    [ComImport]
    [Guid("000214F9-0000-0000-C000-000000000046")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellLinkW
    {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder file, int maxPath, IntPtr findData, int flags);
        void GetIDList(out IntPtr idList);
        void SetIDList(IntPtr idList);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder name, int maxName);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string name);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder directory, int maxPath);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string directory);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder arguments, int maxArguments);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string arguments);
        void GetHotkey(out short hotkey);
        void SetHotkey(short hotkey);
        void GetShowCmd(out int showCommand);
        void SetShowCmd(int showCommand);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder icon, int maxIcon, out int index);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string icon, int index);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string relativePath, int reserved);
        void Resolve(IntPtr window, int flags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string file);
    }

    [DllImport("gdi32.dll")]
    private static extern int GetObject(IntPtr handle, int size, ref BitmapInfo info);

    [DllImport("gdi32.dll")]
    private static extern bool DeleteObject(IntPtr handle);

    [DllImport("iphlpapi.dll", SetLastError = true)]
    private static extern uint GetExtendedTcpTable(
        IntPtr table,
        ref int size,
        bool sortOrder,
        int addressFamily,
        int tableClass,
        int reserved);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(
        int access,
        [MarshalAs(UnmanagedType.Bool)] bool inheritHandle,
        int processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetProcessTimes(
        IntPtr process,
        out long creationTime,
        out long exitTime,
        out long kernelTime,
        out long userTime);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseHandle(IntPtr handle);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, EntryPoint = "QueryFullProcessImageNameW", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool QueryFullProcessImageName(
        IntPtr process,
        int flags,
        StringBuilder buffer,
        ref int size);

    /// MIB_TCPROW_OWNER_PID：IPv4 连接行，端口字段低 16 位为网络字节序。
    [StructLayout(LayoutKind.Sequential)]
    private struct TcpRowOwnerPid
    {
        internal uint State;
        internal uint LocalAddress;
        internal uint LocalPort;
        internal uint RemoteAddress;
        internal uint RemotePort;
        internal uint OwningProcessId;
    }

    /// MIB_TCP6ROW_OWNER_PID：IPv6 连接行，地址为 16 字节且带 scope id。
    [StructLayout(LayoutKind.Sequential)]
    private struct Tcp6RowOwnerPid
    {
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 16)]
        internal byte[] LocalAddress;
        internal uint LocalScopeId;
        internal uint LocalPort;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 16)]
        internal byte[] RemoteAddress;
        internal uint RemoteScopeId;
        internal uint RemotePort;
        internal uint State;
        internal uint OwningProcessId;
    }

    /// 一个进程的可执行文件路径、用于展示的应用名与创建时间。
    private struct ProcessImage
    {
        internal string Path;
        internal string DisplayName;
        internal long CreatedAt;
    }

    internal static int Main(string[] args)
    {
        if (args.Length == 2 && args[0] == "--icon")
        {
            return WriteApplicationIcon(args[1]);
        }
        if (args.Length == 2 && args[0] == "--resolve")
        {
            return WriteResolvedProcess(args[1]);
        }
        if (args.Length == 1 && args[0] == "--apps")
        {
            return WriteInstalledApps();
        }

        int proxyPort;
        if (args.Length != 1 ||
            !int.TryParse(args[0], NumberStyles.None, CultureInfo.InvariantCulture, out proxyPort) ||
            proxyPort <= 0 ||
            proxyPort > 65535)
        {
            Console.Error.WriteLine("Usage: client-app-helper <proxyPort> | --icon <path> | --resolve <pid> | --apps");
            return 2;
        }

        try
        {
            Dictionary<int, int> processIdBySourcePort = new Dictionary<int, int>();
            CollectIpv4(proxyPort, processIdBySourcePort);
            CollectIpv6(proxyPort, processIdBySourcePort);
            WriteTable(processIdBySourcePort);
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.Message);
            return 1;
        }
    }

    /// 输出 TSV：源端口 \t 进程 ID \t 应用显示名 \t 应用标识（不可读时为空）。
    private static void WriteTable(Dictionary<int, int> processIdBySourcePort)
    {
        Dictionary<int, ProcessImage> imageByProcessId = new Dictionary<int, ProcessImage>();
        StringBuilder output = new StringBuilder();
        foreach (KeyValuePair<int, int> entry in processIdBySourcePort)
        {
            ProcessImage image;
            if (!imageByProcessId.TryGetValue(entry.Value, out image))
            {
                image = ResolveProcessImage(entry.Value);
                imageByProcessId[entry.Value] = image;
            }
            output.Append(entry.Key.ToString(CultureInfo.InvariantCulture));
            output.Append('\t');
            output.Append(entry.Value.ToString(CultureInfo.InvariantCulture));
            output.Append('\t');
            output.Append(image.DisplayName);
            output.Append('\t');
            output.Append(image.Path);
            output.Append('\n');
        }
        WriteUtf8(output.ToString());
    }

    /// 应用名与路径常含非 ASCII 字符，固定用无 BOM 的 UTF-8 输出，不受控制台代码页影响。
    private static void WriteUtf8(string text)
    {
        using (Stream standardOutput = Console.OpenStandardOutput())
        using (StreamWriter writer = new StreamWriter(standardOutput, new UTF8Encoding(false)))
        {
            writer.Write(text);
        }
    }

    /// 读取 IPv4 TCP 表，收集远端为 loopback 且远端端口等于代理端口的连接。
    private static void CollectIpv4(int proxyPort, Dictionary<int, int> processIdBySourcePort)
    {
        IntPtr table = ReadTcpTable(AddressFamilyIpv4);
        if (table == IntPtr.Zero)
        {
            return;
        }
        try
        {
            int rowSize = Marshal.SizeOf(typeof(TcpRowOwnerPid));
            int count = Marshal.ReadInt32(table);
            IntPtr cursor = new IntPtr(table.ToInt64() + Marshal.SizeOf(typeof(uint)));
            for (int index = 0; index < count; index++)
            {
                TcpRowOwnerPid row = (TcpRowOwnerPid)Marshal.PtrToStructure(cursor, typeof(TcpRowOwnerPid));
                cursor = new IntPtr(cursor.ToInt64() + rowSize);
                if (ToPort(row.RemotePort) != proxyPort || (row.RemoteAddress & 0xFF) != 127)
                {
                    continue;
                }
                processIdBySourcePort[ToPort(row.LocalPort)] = (int)row.OwningProcessId;
            }
        }
        finally
        {
            Marshal.FreeHGlobal(table);
        }
    }

    /// 读取 IPv6 TCP 表，收集远端为 ::1 且远端端口等于代理端口的连接。
    private static void CollectIpv6(int proxyPort, Dictionary<int, int> processIdBySourcePort)
    {
        IntPtr table = ReadTcpTable(AddressFamilyIpv6);
        if (table == IntPtr.Zero)
        {
            return;
        }
        try
        {
            int rowSize = Marshal.SizeOf(typeof(Tcp6RowOwnerPid));
            int count = Marshal.ReadInt32(table);
            IntPtr cursor = new IntPtr(table.ToInt64() + Marshal.SizeOf(typeof(uint)));
            for (int index = 0; index < count; index++)
            {
                Tcp6RowOwnerPid row = (Tcp6RowOwnerPid)Marshal.PtrToStructure(cursor, typeof(Tcp6RowOwnerPid));
                cursor = new IntPtr(cursor.ToInt64() + rowSize);
                if (ToPort(row.RemotePort) != proxyPort || !IsIpv6Loopback(row.RemoteAddress))
                {
                    continue;
                }
                processIdBySourcePort[ToPort(row.LocalPort)] = (int)row.OwningProcessId;
            }
        }
        finally
        {
            Marshal.FreeHGlobal(table);
        }
    }

    /// 按所需大小分配并读取扩展 TCP 表；地址族不可用时返回 IntPtr.Zero。
    private static IntPtr ReadTcpTable(int addressFamily)
    {
        int size = 0;
        uint status = GetExtendedTcpTable(
            IntPtr.Zero,
            ref size,
            false,
            addressFamily,
            TcpTableOwnerPidAll,
            0);
        if (status != ErrorInsufficientBuffer && status != NoError)
        {
            return IntPtr.Zero;
        }
        IntPtr table = Marshal.AllocHGlobal(size);
        status = GetExtendedTcpTable(
            table,
            ref size,
            false,
            addressFamily,
            TcpTableOwnerPidAll,
            0);
        if (status != NoError)
        {
            Marshal.FreeHGlobal(table);
            return IntPtr.Zero;
        }
        return table;
    }

    /// <summary>
    /// 解析发起连接的进程属于哪个应用。
    ///
    /// 容器型进程（WebView2 宿主、微信小程序容器等）自己不是用户心目中的应用，
    /// 因此沿调用链一路向上找，一旦命中系统已安装应用就停。
    /// 不比较发布者：宿主应用经常使用别家的运行时（如 GlobalProtect 用微软的 WebView2）。
    /// 已安装应用索引不可能覆盖所有安装方式（MSI 安装常常不登记安装目录），因此一路
    /// 都没命中时停在最后一个可信祖先上，而不是断言起始进程就是应用。
    /// </summary>
    private static ProcessImage ResolveProcessImage(int processId)
    {
        ProcessImage current = ReadProcessImage(processId);
        int currentId = processId;
        while (current.Path.Length > 0 && !IsInstalledApp(current.Path))
        {
            int parentId;
            if (!GetParentProcessIds().TryGetValue(currentId, out parentId) || parentId <= 0)
            {
                break;
            }
            ProcessImage parent = ReadProcessImage(parentId);
            // ParentProcessId 是创建时的快照，父进程退出后 PID 会被复用；创建时间晚于子进程
            // 就说明这不是真父进程，继续上溯只会认错，甚至沿 PID 复用形成的环兜圈子。
            if (parent.Path.Length == 0 || parent.CreatedAt > current.CreatedAt)
            {
                break;
            }
            // 系统目录里的进程只有本身就是已安装应用（SystemApps 下的打包应用）时才配当宿主，
            // 否则归属会被 explorer.exe / services.exe 这类系统宿主吞掉。
            if (IsUnderWindowsDirectory(parent.Path) && !IsInstalledApp(parent.Path))
            {
                break;
            }
            current = parent;
            currentId = parentId;
        }
        current.DisplayName = ResolveDisplayName(current);
        current.Path = ResolveIdentityPath(current.Path);
        return current;
    }

    /// <summary>
    /// 把归属结果换成应用的代表标识，让名称、图标、appId 三者同源。
    /// 同一个应用的后台组件（OneDrive 的 FileCoAuth.exe、Outlook 的 olkexthost.exe）自身
    /// 没有图标资源，直接取会拿到通用图标，还会因路径不同在 UI 里裂成独立条目。
    /// </summary>
    private static string ResolveIdentityPath(string imagePath)
    {
        if (imagePath.Length == 0)
        {
            return imagePath;
        }
        GetInstalledApps();
        if (installedAppFiles.ContainsKey(imagePath))
        {
            return imagePath;
        }
        string directory = MatchInstalledDirectory(imagePath);
        string identity;
        if (directory != null &&
            installedAppIdentities.TryGetValue(directory, out identity) &&
            identity.Length > 0)
        {
            return identity;
        }
        return imagePath;
    }

    /// <summary>
    /// 显示名优先取系统登记的应用名，让 UI 与“设置 → 应用 → 安装的应用”对得上；
    /// 主程序精确匹配优先于安装目录，否则套件类安装（Office 在卸载表里只有一个
    /// 条目）会把 Word、OneNote 一律叫成套件名。两者都没有时才回退到 exe 版本资源。
    /// </summary>
    private static string ResolveDisplayName(ProcessImage image)
    {
        if (image.Path.Length == 0)
        {
            return image.DisplayName;
        }
        string registered = ReadInstalledFileName(image.Path);
        if (registered.Length == 0)
        {
            registered = ReadInstalledDirectoryName(image.Path);
        }
        if (registered.Length > 0)
        {
            return registered;
        }
        if (image.DisplayName.Length > 0)
        {
            return image.DisplayName;
        }
        return Sanitize(System.IO.Path.GetFileNameWithoutExtension(image.Path));
    }

    /// 主程序精确匹配的登记名；这是最强证据——该 exe 就是这个应用的入口。
    private static string ReadInstalledFileName(string imagePath)
    {
        GetInstalledApps();
        string name;
        if (!installedAppFiles.TryGetValue(imagePath, out name))
        {
            return string.Empty;
        }
        return Sanitize(ReadPackageDisplayName(name));
    }

    /// exe 所在安装目录的登记名。
    private static string ReadInstalledDirectoryName(string imagePath)
    {
        GetInstalledApps();
        string directory = MatchInstalledDirectory(imagePath);
        if (directory == null)
        {
            return string.Empty;
        }
        return Sanitize(ReadPackageDisplayName(installedAppDirectories[directory]));
    }

    /// exe 是否属于某个系统已安装应用。
    private static bool IsInstalledApp(string imagePath)
    {
        GetInstalledApps();
        return installedAppFiles.ContainsKey(imagePath) || MatchInstalledDirectory(imagePath) != null;
    }

    /// 可执行文件是否位于 Windows 目录下。
    private static bool IsUnderWindowsDirectory(string imagePath)
    {
        return WindowsDirectory.Length > 0
            && imagePath.StartsWith(WindowsDirectory + "\\", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// 返回 exe 所属已安装应用的登记目录，不属于任何已安装应用时返回 null。
    /// 目录可能嵌套（套件目录套子应用包目录），取最长匹配才是真正的归属者。
    /// </summary>
    private static string MatchInstalledDirectory(string imagePath)
    {
        string matched = null;
        foreach (KeyValuePair<string, string> app in installedAppDirectories)
        {
            if (!imagePath.StartsWith(app.Key + "\\", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }
            if (matched == null || app.Key.Length > matched.Length)
            {
                matched = app.Key;
            }
        }
        return matched;
    }

    /// <summary>
    /// 收集系统已安装应用，覆盖“设置 → 应用 → 安装的应用”里的每一类安装方式：
    /// 打包应用取包登记表，传统桌面应用取卸载登记表，再用 App Paths 与开始菜单
    /// 快捷方式补上那些没有登记安装目录的（MSI 安装常常如此）。
    /// 跳过 SystemComponent=1 的登记项——那是 Windows 用来标记运行时组件（如 WebView2
    /// Runtime）的官方标志，它们不会出现在“应用和功能”里，也不是用户心目中的应用。
    /// </summary>
    private static void GetInstalledApps()
    {
        if (installedAppDirectories != null)
        {
            return;
        }
        installedAppDirectories = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        installedAppFiles = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        installedAppIdentities = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        CollectPackagedApps();
        CollectInstalledApps(Registry.LocalMachine, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall");
        CollectInstalledApps(Registry.LocalMachine, @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall");
        CollectInstalledApps(Registry.CurrentUser, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall");
        CollectAppPaths(Registry.LocalMachine, @"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths");
        CollectAppPaths(Registry.LocalMachine, @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths");
        CollectAppPaths(Registry.CurrentUser, @"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths");
        CollectStartMenuApps(Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu));
        CollectStartMenuApps(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu));
    }

    /// <summary>
    /// 从 App Paths 登记表收集应用主程序。这里补的是卸载登记表里没写 InstallLocation 的应用；
    /// 该表只有路径没有应用名，因此只参与归属判定。
    /// </summary>
    private static void CollectAppPaths(RegistryKey root, string subKeyPath)
    {
        try
        {
            using (RegistryKey appPaths = root.OpenSubKey(subKeyPath))
            {
                if (appPaths == null)
                {
                    return;
                }
                foreach (string name in appPaths.GetSubKeyNames())
                {
                    using (RegistryKey entry = appPaths.OpenSubKey(name))
                    {
                        if (entry == null)
                        {
                            continue;
                        }
                        AddInstalledFile(entry.GetValue(null) as string, null, null);
                    }
                }
            }
        }
        catch (Exception)
        {
            // 注册表不可读时归属退化为“少一个来源”，不影响反查本身。
        }
    }

    /// <summary>
    /// 从开始菜单快捷方式收集应用主程序，快捷方式名就是用户心目中的应用名。
    /// 名字只落在主程序上、不落在目录上：一个目录常有多个快捷方式（Office 的 Word、
    /// Excel、OneNote 同在 Office16 下），拿其中一个去命名整个目录必然张冠李戴。
    /// </summary>
    private static void CollectStartMenuApps(string startMenu)
    {
        if (startMenu.Length == 0 || !Directory.Exists(startMenu))
        {
            return;
        }
        string[] shortcuts;
        try
        {
            shortcuts = Directory.GetFiles(startMenu, "*.lnk", SearchOption.AllDirectories);
        }
        catch (Exception)
        {
            return;
        }
        foreach (string shortcut in shortcuts)
        {
            AddInstalledFile(
                ReadShortcutTarget(shortcut),
                System.IO.Path.GetFileNameWithoutExtension(shortcut),
                null);
        }
    }

    /// 读取快捷方式指向的可执行文件；无法解析时返回空串。
    private static string ReadShortcutTarget(string shortcutPath)
    {
        IShellLinkW link = null;
        try
        {
            link = (IShellLinkW)new ShellLink();
            ((System.Runtime.InteropServices.ComTypes.IPersistFile)link).Load(shortcutPath, 0);
            StringBuilder buffer = new StringBuilder(MaxImagePathLength);
            link.GetPath(buffer, buffer.Capacity, IntPtr.Zero, 0);
            return buffer.ToString();
        }
        catch (Exception)
        {
            return string.Empty;
        }
        finally
        {
            if (link != null)
            {
                Marshal.ReleaseComObject(link);
            }
        }
    }

    /// <summary>
    /// 从 AppModel 包登记表收集 MSIX/UWP 应用的包根目录。
    /// 必须按包根目录判定归属：打包应用派生的运行时进程（如 msedgewebview2.exe）会继承
    /// 宿主的包身份，改用 AUMID 判定会把这些运行时进程本身错认成应用。
    /// </summary>
    private static void CollectPackagedApps()
    {
        try
        {
            using (RegistryKey packages = Registry.CurrentUser.OpenSubKey(PackageRepositoryPath))
            {
                if (packages == null)
                {
                    return;
                }
                foreach (string name in packages.GetSubKeyNames())
                {
                    using (RegistryKey entry = packages.OpenSubKey(name))
                    {
                        if (entry == null)
                        {
                            continue;
                        }
                        string root = entry.GetValue("PackageRootFolder") as string;
                        if (!AddPackagedDirectory(root, entry.GetValue("DisplayName") as string))
                        {
                            continue;
                        }
                        // 包内 exe 常在子目录里，shell 认不出包身份只能给通用图标；
                        // 改用 AUMID 才能取到包的真图标（实测 Windows365、Widgets 均如此）。
                        string aumid = ReadPackageAumid(entry, name);
                        if (aumid.Length > 0)
                        {
                            AddInstalledIdentity(root, "shell:AppsFolder\\" + aumid);
                        }
                    }
                }
            }
        }
        catch (Exception)
        {
            // 注册表不可读时归属退化为“不追溯”，不影响反查本身。
        }
    }

    /// 包显示名常是 ms-resource 间接字符串，交给 shell 解析成用户可见的应用名；
    /// 解析要加载包的资源 DLL，因此只在真正用得上那一条时才做。
    private static string ReadPackageDisplayName(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }
        if (!value.StartsWith("@{", StringComparison.Ordinal))
        {
            return value;
        }
        try
        {
            StringBuilder buffer = new StringBuilder(1024);
            if (SHLoadIndirectString(value, buffer, buffer.Capacity, IntPtr.Zero) == 0)
            {
                return buffer.ToString();
            }
        }
        catch (Exception)
        {
            // 解析不出就当作没有登记名，由 exe 版本信息兜底。
        }
        return string.Empty;
    }

    /// 从一个 Uninstall 注册表分支里收集安装目录与主程序。
    private static void CollectInstalledApps(RegistryKey root, string subKeyPath)
    {
        try
        {
            using (RegistryKey uninstall = root.OpenSubKey(subKeyPath))
            {
                if (uninstall == null)
                {
                    return;
                }
                foreach (string name in uninstall.GetSubKeyNames())
                {
                    using (RegistryKey entry = uninstall.OpenSubKey(name))
                    {
                        string displayName = entry == null ? null : entry.GetValue("DisplayName") as string;
                        if (string.IsNullOrEmpty(displayName))
                        {
                            continue;
                        }
                        object systemComponent = entry.GetValue("SystemComponent");
                        if (systemComponent != null && Convert.ToInt32(systemComponent, CultureInfo.InvariantCulture) == 1)
                        {
                            continue;
                        }
                        AddInstalledDirectory(entry.GetValue("InstallLocation") as string, displayName);
                        // DisplayIcon 指向的是这次安装的主程序，因此它的目录也能代表整个应用。
                        AddInstalledFile(ReadIconFilePath(entry.GetValue("DisplayIcon") as string), displayName, displayName);
                    }
                }
            }
        }
        catch (Exception)
        {
            // 注册表不可读时归属退化为“不追溯”，不影响反查本身。
        }
    }

    /// 从 DisplayIcon 这类“文件路径[,图标序号]”值里取出文件路径。
    private static string ReadIconFilePath(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return null;
        }
        string trimmed = value.Trim().Trim('"');
        int comma = trimmed.LastIndexOf(',');
        if (comma > 2)
        {
            trimmed = trimmed.Substring(0, comma).Trim().Trim('"');
        }
        return trimmed;
    }

    /// <summary>
    /// 登记一个应用主程序：文件路径参与精确匹配，其所在目录参与前缀匹配。
    /// directoryName 只有来自包与卸载登记表这类权威来源时才给——快捷方式名属于单个入口，
    /// 拿它命名整个目录会张冠李戴。
    /// </summary>
    private static void AddInstalledFile(string filePath, string fileName, string directoryName)
    {
        if (string.IsNullOrEmpty(filePath) || !filePath.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }
        string directory;
        try
        {
            directory = System.IO.Path.GetDirectoryName(filePath);
        }
        catch (Exception)
        {
            return;
        }
        if (!AddInstalledDirectory(directory, directoryName))
        {
            return;
        }
        // 只有权威来源（卸载登记表的 DisplayIcon，代表整次安装）才能代表整个目录；
        // App Paths 与快捷方式只代表单个入口，Office16 下 Word、Excel、OneNote 共存。
        if (directoryName != null)
        {
            AddInstalledIdentity(directory, filePath);
        }
        string existing;
        if (installedAppFiles.TryGetValue(filePath, out existing) && existing.Length > 0)
        {
            return;
        }
        installedAppFiles[filePath] = Sanitize(fileName);
    }

    /// 登记一个目录的代表标识；先到先得，包与卸载登记表比快捷方式更权威。
    private static void AddInstalledIdentity(string directory, string identity)
    {
        if (string.IsNullOrEmpty(directory) || string.IsNullOrEmpty(identity))
        {
            return;
        }
        string trimmed = directory.Trim().Trim('"').TrimEnd('\\');
        if (trimmed.Length == 0 || installedAppIdentities.ContainsKey(trimmed))
        {
            return;
        }
        installedAppIdentities[trimmed] = identity;
    }

    /// <summary>
    /// 取包的 AUMID（PackageFamilyName!AppId），仅当包恰好只有一个应用时才给。
    /// 多应用包（CBS 有 23 个）无法判定哪个代表它，随便取一个会拿到无关
    /// 后台组件的图标。子键有两种摄法：放在 Applications 下，或直接以 AppId 为子键。
    /// </summary>
    private static string ReadPackageAumid(RegistryKey packageKey, string packageFullName)
    {
        string family = ToPackageFamilyName(packageFullName);
        if (family.Length == 0)
        {
            return string.Empty;
        }
        using (RegistryKey applications = packageKey.OpenSubKey("Applications"))
        {
            if (applications != null)
            {
                string[] names = applications.GetSubKeyNames();
                return names.Length == 1 ? ToAumid(family, names[0]) : string.Empty;
            }
        }
        List<string> children = new List<string>();
        foreach (string child in packageKey.GetSubKeyNames())
        {
            children.Add(child);
        }
        return children.Count == 1 ? ToAumid(family, children[0]) : string.Empty;
    }

    /// 应用子键名可能已是完整 AUMID，也可能只是 AppId。
    private static string ToAumid(string family, string application)
    {
        return application.IndexOf('!') >= 0 ? application : family + "!" + application;
    }

    /// 包全名形如 Name_Version_Arch_ResourceId_PublisherId，家族名取首尾两段。
    private static string ToPackageFamilyName(string packageFullName)
    {
        if (string.IsNullOrEmpty(packageFullName))
        {
            return string.Empty;
        }
        string[] parts = packageFullName.Split('_');
        return parts.Length < 2 ? string.Empty : parts[0] + "_" + parts[parts.Length - 1];
    }

    /// <summary>
    /// 登记一个安装目录；系统目录下只有打包应用才算应用，否则 System32 会整个
    /// 被当成应用目录，svchost.exe 之类会立刻命中。
    /// </summary>
    private static bool AddInstalledDirectory(string directory, string displayName)
    {
        if (string.IsNullOrEmpty(directory) || IsUnderWindowsDirectory(directory))
        {
            return false;
        }
        return AddPackagedDirectory(directory, displayName);
    }

    /// <summary>
    /// 登记一个安装目录；太浅的路径（如 C:\Program Files）会误包含无关应用，丢弃。
    /// 先登记的名字不被后来的来源覆盖：包与卸载登记表的名字比快捷方式名更权威。
    /// </summary>
    private static bool AddPackagedDirectory(string directory, string displayName)
    {
        if (string.IsNullOrEmpty(directory))
        {
            return false;
        }
        string trimmed = directory.Trim().Trim('"').TrimEnd('\\');
        if (trimmed.Length == 0 || trimmed.Split('\\').Length < 3)
        {
            return false;
        }
        string existing;
        if (!installedAppDirectories.TryGetValue(trimmed, out existing) || existing.Length == 0)
        {
            installedAppDirectories[trimmed] = Sanitize(displayName);
        }
        return true;
    }

    /// 全系统进程 ID → 父进程 ID 映射。
    private static Dictionary<int, int> GetParentProcessIds()
    {
        EnsureProcessSnapshot();
        return parentProcessIds;
    }

    /// 打不开进程句柄时的兜底显示名：进程快照里的可执行文件名。
    private static string ReadSnapshotName(int processId)
    {
        EnsureProcessSnapshot();
        string fileName;
        if (!processFileNames.TryGetValue(processId, out fileName) || fileName.Length == 0)
        {
            return string.Empty;
        }
        return Sanitize(System.IO.Path.GetFileNameWithoutExtension(fileName));
    }

    /// 建立并缓存全系统进程快照：父进程关系与可执行文件名。
    private static void EnsureProcessSnapshot()
    {
        if (parentProcessIds != null)
        {
            return;
        }
        parentProcessIds = new Dictionary<int, int>();
        processFileNames = new Dictionary<int, string>();
        IntPtr snapshot = CreateToolhelp32Snapshot(SnapshotProcesses, 0);
        if (snapshot == IntPtr.Zero || snapshot == new IntPtr(-1))
        {
            return;
        }
        try
        {
            ProcessEntry32 entry = new ProcessEntry32();
            entry.Size = (uint)Marshal.SizeOf(typeof(ProcessEntry32));
            if (!Process32First(snapshot, ref entry))
            {
                return;
            }
            do
            {
                parentProcessIds[(int)entry.ProcessId] = (int)entry.ParentProcessId;
                processFileNames[(int)entry.ProcessId] = entry.ExeFile ?? string.Empty;
            }
            while (Process32Next(snapshot, ref entry));
        }
        finally
        {
            CloseHandle(snapshot);
        }
    }

    /// 读取单个进程自身的可执行文件路径、显示名与创建时间。
    private static ProcessImage ReadProcessImage(int processId)
    {
        ProcessImage image = new ProcessImage();
        image.Path = string.Empty;
        image.DisplayName = string.Empty;
        IntPtr process = OpenProcess(ProcessQueryLimitedInformation, false, processId);
        if (process == IntPtr.Zero)
        {
            // 88 个 svchost 里有 80 个跑在 SYSTEM 下打不开，退而用进程快照里的文件名；
            // 没有路径就取不到图标，但至少能告诉用户请求是谁发的。
            image.DisplayName = ReadSnapshotName(processId);
            return image;
        }
        try
        {
            StringBuilder buffer = new StringBuilder(MaxImagePathLength);
            int size = buffer.Capacity;
            if (!QueryFullProcessImageName(process, 0, buffer, ref size))
            {
                return image;
            }
            image.Path = Sanitize(buffer.ToString(0, size));
            image.DisplayName = Sanitize(ReadFileDescription(image.Path));
            long creationTime, exitTime, kernelTime, userTime;
            if (GetProcessTimes(process, out creationTime, out exitTime, out kernelTime, out userTime))
            {
                image.CreatedAt = creationTime;
            }
            return image;
        }
        finally
        {
            CloseHandle(process);
        }
    }

    /// 读 exe 版本资源里的 FileDescription（这个可执行文件是什么）；只在没有系统登记名时用得上。
    private static string ReadFileDescription(string imagePath)
    {
        if (imagePath.Length == 0)
        {
            return string.Empty;
        }
        try
        {
            FileVersionInfo info = FileVersionInfo.GetVersionInfo(imagePath);
            if (info.FileDescription != null)
            {
                return info.FileDescription.Trim();
            }
        }
        catch (Exception)
        {
            // 显示名是可选信息，读不到就交由调用方回退。
        }
        return string.Empty;
    }

    /// 去掉会破坏 TSV 行格式的字符。
    private static string Sanitize(string value)
    {
        if (value == null)
        {
            return string.Empty;
        }
        return value.Replace('\t', ' ').Replace('\r', ' ').Replace('\n', ' ');
    }

    /// Windows TCP 表的端口字段低 16 位为网络字节序，需交换高低字节。
    private static int ToPort(uint value)
    {
        return (int)(((value & 0xFF) << 8) | ((value >> 8) & 0xFF));
    }

    /// 诊断用：输出指定进程的归属结果（显示名 \t 可执行文件路径）。
    private static int WriteResolvedProcess(string processIdText)
    {
        int processId;
        if (!int.TryParse(processIdText, NumberStyles.None, CultureInfo.InvariantCulture, out processId))
        {
            return 2;
        }
        ProcessImage image = ResolveProcessImage(processId);
        WriteUtf8(image.DisplayName + "\t" + image.Path);
        return 0;
    }

    /// 诊断用：输出已安装应用索引（EXE|DIR \t 路径 \t 系统登记名），每行一个。
    private static int WriteInstalledApps()
    {
        GetInstalledApps();
        StringBuilder output = new StringBuilder();
        foreach (KeyValuePair<string, string> app in installedAppFiles)
        {
            output.Append("EXE\t");
            output.Append(app.Key);
            output.Append('\t');
            output.Append(ReadPackageDisplayName(app.Value));
            output.Append('\n');
        }
        foreach (KeyValuePair<string, string> app in installedAppDirectories)
        {
            output.Append("DIR\t");
            output.Append(app.Key);
            output.Append('\t');
            output.Append(ReadPackageDisplayName(app.Value));
            output.Append('\n');
        }
        WriteUtf8(output.ToString());
        return 0;
    }

    /// 输出应用图标的 base64 PNG。
    private static int WriteApplicationIcon(string imagePath)    {
        try
        {
            using (Bitmap icon = LoadShellIcon(imagePath))
            {
                if (icon == null)
                {
                    return 1;
                }
                using (MemoryStream buffer = new MemoryStream())
                {
                    icon.Save(buffer, ImageFormat.Png);
                    using (Stream standardOutput = Console.OpenStandardOutput())
                    using (StreamWriter writer = new StreamWriter(standardOutput, new UTF8Encoding(false)))
                    {
                        writer.Write(Convert.ToBase64String(buffer.ToArray()));
                    }
                }
            }
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.Message);
            return 1;
        }
    }

    /// <summary>
    /// 经 shell 取应用图标。必须走 IShellItemImageFactory 而不是 exe 资源：MSIX/UWP 应用
    /// （如新版 Teams）的 exe 只是 stub，图标存在包的 Assets 里，读 exe 资源只会得到通用图标。
    /// </summary>
    private static Bitmap LoadShellIcon(string imagePath)
    {
        Guid factoryId = new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b");
        IShellItemImageFactory factory;
        SHCreateItemFromParsingName(imagePath, IntPtr.Zero, ref factoryId, out factory);
        if (factory == null)
        {
            return null;
        }
        IntPtr bitmapHandle = IntPtr.Zero;
        try
        {
            ShellSize size;
            size.Width = 32;
            size.Height = 32;
            factory.GetImage(size, ShellIconOnly, out bitmapHandle);
            return FromBitmapHandle(bitmapHandle);
        }
        finally
        {
            if (bitmapHandle != IntPtr.Zero)
            {
                DeleteObject(bitmapHandle);
            }
            Marshal.ReleaseComObject(factory);
        }
    }

    /// 把 HBITMAP 复制成托管位图；32 位源保留 alpha，否则应用图标的透明背景会变成黑块。
    private static Bitmap FromBitmapHandle(IntPtr bitmapHandle)
    {
        if (bitmapHandle == IntPtr.Zero)
        {
            return null;
        }
        BitmapInfo info = new BitmapInfo();
        if (GetObject(bitmapHandle, Marshal.SizeOf(typeof(BitmapInfo)), ref info) == 0)
        {
            return null;
        }
        if (info.BitsPerPixel != 32 || info.Bits == IntPtr.Zero)
        {
            using (Bitmap opaque = Image.FromHbitmap(bitmapHandle))
            {
                return new Bitmap(opaque);
            }
        }
        // GDI 的 DIB 自下而上存储，用负步长直接按自上而下读取。
        using (Bitmap mapped = new Bitmap(
            info.Width,
            info.Height,
            -info.WidthBytes,
            PixelFormat.Format32bppArgb,
            new IntPtr(info.Bits.ToInt64() + (long)(info.Height - 1) * info.WidthBytes)))
        {
            return new Bitmap(mapped);
        }
    }

    /// 判断 16 字节 IPv6 地址是否为 ::1。
    private static bool IsIpv6Loopback(byte[] address)
    {
        if (address == null || address.Length != 16)
        {
            return false;
        }
        for (int index = 0; index < 15; index++)
        {
            if (address[index] != 0)
            {
                return false;
            }
        }
        return address[15] == 1;
    }
}
