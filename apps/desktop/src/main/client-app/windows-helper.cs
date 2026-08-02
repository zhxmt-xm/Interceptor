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
    private const int MaxHostWalkDepth = 4;

    /// 缓存的进程 ID → 父进程 ID 映射；按需建立一次。
    private static Dictionary<int, int> parentProcessIds;
    /// 缓存的已安装应用安装目录；按需建立一次。
    private static HashSet<string> installedAppDirectories;
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

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetApplicationUserModelId(
        IntPtr process,
        ref uint length,
        StringBuilder applicationUserModelId);

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

    /// 一个进程的可执行文件路径与用于展示的应用名。
    private struct ProcessImage
    {
        internal string Path;
        internal string DisplayName;
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

        int proxyPort;
        if (args.Length != 1 ||
            !int.TryParse(args[0], NumberStyles.None, CultureInfo.InvariantCulture, out proxyPort) ||
            proxyPort <= 0 ||
            proxyPort > 65535)
        {
            Console.Error.WriteLine("Usage: client-app-helper <proxyPort> | --icon <path> | --resolve <pid>");
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

    /// 输出 TSV：源端口 \t 进程 ID \t 应用显示名 \t 可执行文件路径（不可读时为空）。
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
        // 应用名与路径常含非 ASCII 字符，固定用无 BOM 的 UTF-8 输出，不受控制台代码页影响。
        using (Stream standardOutput = Console.OpenStandardOutput())
        using (StreamWriter writer = new StreamWriter(standardOutput, new UTF8Encoding(false)))
        {
            writer.Write(output.ToString());
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
    /// 因此沿调用链向上找，一旦命中系统已安装应用就停，不再追到最顶层。
    /// 不比较发布者：宿主应用经常使用别家的运行时（如 GlobalProtect 用微软的 WebView2）。
    /// 但不追进系统目录，否则会归到 services.exe / explorer.exe 这类宿主上。
    /// </summary>
    private static ProcessImage ResolveProcessImage(int processId)
    {
        ProcessImage image = ReadProcessImage(processId);
        int currentId = processId;
        for (int depth = 0; depth < MaxHostWalkDepth; depth++)
        {
            if (image.Path.Length == 0 || IsInstalledApplication(currentId, image))
            {
                break;
            }
            int parentId;
            if (!GetParentProcessIds().TryGetValue(currentId, out parentId) || parentId <= 0)
            {
                break;
            }
            ProcessImage parent = ReadProcessImage(parentId);
            if (parent.Path.Length == 0 || IsUnderWindowsDirectory(parent.Path))
            {
                break;
            }
            image = parent;
            currentId = parentId;
        }
        return image;
    }

    /// 可执行文件是否位于 Windows 目录下。
    private static bool IsUnderWindowsDirectory(string imagePath)
    {
        return WindowsDirectory.Length > 0
            && imagePath.StartsWith(WindowsDirectory + "\\", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// 判断进程是否对应一个系统已安装应用。
    /// 打包应用（MSIX/UWP）看 AUMID；传统桌面应用看可执行文件是否落在已登记的安装目录内。
    /// </summary>
    private static bool IsInstalledApplication(int processId, ProcessImage image)
    {
        if (HasApplicationUserModelId(processId))
        {
            return true;
        }
        foreach (string directory in GetInstalledAppDirectories())
        {
            if (image.Path.StartsWith(directory + "\\", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }
        return false;
    }

    /// <summary>
    /// 收集已安装应用的安装目录。
    /// 跳过 SystemComponent=1 的登记项——那是 Windows 用来标记运行时组件（如 WebView2
    /// Runtime）的官方标志，它们不会出现在“应用和功能”里，也不是用户心目中的应用。
    /// </summary>
    private static HashSet<string> GetInstalledAppDirectories()
    {
        if (installedAppDirectories != null)
        {
            return installedAppDirectories;
        }
        installedAppDirectories = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        CollectInstalledApps(Registry.LocalMachine, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall");
        CollectInstalledApps(Registry.LocalMachine, @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall");
        CollectInstalledApps(Registry.CurrentUser, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall");
        return installedAppDirectories;
    }

    /// 从一个 Uninstall 注册表分支里收集安装目录。
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
                        if (entry == null || entry.GetValue("DisplayName") == null)
                        {
                            continue;
                        }
                        object systemComponent = entry.GetValue("SystemComponent");
                        if (systemComponent != null && Convert.ToInt32(systemComponent, CultureInfo.InvariantCulture) == 1)
                        {
                            continue;
                        }
                        AddInstalledDirectory(entry.GetValue("InstallLocation") as string);
                        AddInstalledFileDirectory(entry.GetValue("DisplayIcon") as string);
                    }
                }
            }
        }
        catch (Exception)
        {
            // 注册表不可读时归属退化为“不追溯”，不影响反查本身。
        }
    }

    /// 登记一个安装目录；太浅的路径（如 C:\Program Files）会误包含无关应用，丢弃。
    private static void AddInstalledDirectory(string directory)
    {
        if (string.IsNullOrEmpty(directory))
        {
            return;
        }
        string trimmed = directory.Trim().Trim('"').TrimEnd('\\');
        if (trimmed.Length == 0 || trimmed.Split('\\').Length < 3)
        {
            return;
        }
        installedAppDirectories.Add(trimmed);
    }

    /// 从 DisplayIcon 这类“文件路径[,图标序号]”值里取出所在目录。
    private static void AddInstalledFileDirectory(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return;
        }
        string trimmed = value.Trim().Trim('"');
        int comma = trimmed.LastIndexOf(',');
        if (comma > 2)
        {
            trimmed = trimmed.Substring(0, comma).Trim().Trim('"');
        }
        try
        {
            AddInstalledDirectory(System.IO.Path.GetDirectoryName(trimmed));
        }
        catch (Exception)
        {
            // 非法路径直接忽略。
        }
    }

    /// 进程是否拥有 AUMID（即属于已安装的打包应用）。
    private static bool HasApplicationUserModelId(int processId)
    {
        IntPtr process = OpenProcess(ProcessQueryLimitedInformation, false, processId);
        if (process == IntPtr.Zero)
        {
            return false;
        }
        try
        {
            uint length = 512;
            StringBuilder buffer = new StringBuilder((int)length);
            return GetApplicationUserModelId(process, ref length, buffer) == 0;
        }
        finally
        {
            CloseHandle(process);
        }
    }

    /// 建立并缓存全系统的进程 ID → 父进程 ID 映射。
    private static Dictionary<int, int> GetParentProcessIds()
    {
        if (parentProcessIds != null)
        {
            return parentProcessIds;
        }
        parentProcessIds = new Dictionary<int, int>();
        IntPtr snapshot = CreateToolhelp32Snapshot(SnapshotProcesses, 0);
        if (snapshot == IntPtr.Zero || snapshot == new IntPtr(-1))
        {
            return parentProcessIds;
        }
        try
        {
            ProcessEntry32 entry = new ProcessEntry32();
            entry.Size = (uint)Marshal.SizeOf(typeof(ProcessEntry32));
            if (!Process32First(snapshot, ref entry))
            {
                return parentProcessIds;
            }
            do
            {
                parentProcessIds[(int)entry.ProcessId] = (int)entry.ParentProcessId;
            }
            while (Process32Next(snapshot, ref entry));
        }
        finally
        {
            CloseHandle(snapshot);
        }
        return parentProcessIds;
    }

    /// 读取单个进程自身的可执行文件路径与显示名。
    private static ProcessImage ReadProcessImage(int processId)
    {
        ProcessImage image = new ProcessImage();
        image.Path = string.Empty;
        image.DisplayName = string.Empty;
        IntPtr process = OpenProcess(ProcessQueryLimitedInformation, false, processId);
        if (process == IntPtr.Zero)
        {
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
            image.DisplayName = Sanitize(ReadDisplayName(image.Path));
            return image;
        }
        finally
        {
            CloseHandle(process);
        }
    }

    /// 读取 exe 的 FileDescription 作为应用显示名；缺失时回退到不含扩展名的文件名。
    private static string ReadDisplayName(string imagePath)    {
        if (imagePath.Length == 0)
        {
            return string.Empty;
        }
        try
        {
            FileVersionInfo info = FileVersionInfo.GetVersionInfo(imagePath);
            if (info.FileDescription != null && info.FileDescription.Trim().Length > 0)
            {
                return info.FileDescription.Trim();
            }
        }
        catch (Exception)
        {
            // 显示名是可选信息，读取失败时回退到文件名。
        }
        return System.IO.Path.GetFileNameWithoutExtension(imagePath);
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
        Console.Out.Write(image.DisplayName + "\t" + image.Path);
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
