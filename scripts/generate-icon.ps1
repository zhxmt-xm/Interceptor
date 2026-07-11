param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\apps\desktop\assets')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function New-RoundedRectanglePath {
    param(
        [float]$X,
        [float]$Y,
        [float]$Width,
        [float]$Height,
        [float]$Radius
    )

    $diameter = $Radius * 2
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
    $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
    $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-InterceptorBitmap {
    param([int]$Size)

    $scale = $Size / 512.0
    $bitmap = New-Object System.Drawing.Bitmap(
        $Size,
        $Size,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $backgroundPath = New-RoundedRectanglePath `
        -X (28 * $scale) `
        -Y (28 * $scale) `
        -Width (456 * $scale) `
        -Height (456 * $scale) `
        -Radius (112 * $scale)
    $backgroundBrush = New-Object System.Drawing.SolidBrush(
        [System.Drawing.ColorTranslator]::FromHtml('#24292f')
    )
    $graphics.FillPath($backgroundBrush, $backgroundPath)

    $bracketPen = New-Object System.Drawing.Pen(
        [System.Drawing.ColorTranslator]::FromHtml('#f5f7f8'),
        (34 * $scale)
    )
    $bracketPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $bracketPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $leftBracket = New-Object System.Drawing.Drawing2D.GraphicsPath
    $leftBracket.AddBezier(
        (174 * $scale), (132 * $scale),
        (126 * $scale), (154 * $scale),
        (96 * $scale), (201 * $scale),
        (96 * $scale), (256 * $scale)
    )
    $leftBracket.AddBezier(
        (96 * $scale), (256 * $scale),
        (96 * $scale), (311 * $scale),
        (126 * $scale), (358 * $scale),
        (174 * $scale), (380 * $scale)
    )
    $graphics.DrawPath($bracketPen, $leftBracket)

    $rightBracket = New-Object System.Drawing.Drawing2D.GraphicsPath
    $rightBracket.AddBezier(
        (338 * $scale), (132 * $scale),
        (386 * $scale), (154 * $scale),
        (416 * $scale), (201 * $scale),
        (416 * $scale), (256 * $scale)
    )
    $rightBracket.AddBezier(
        (416 * $scale), (256 * $scale),
        (416 * $scale), (311 * $scale),
        (386 * $scale), (358 * $scale),
        (338 * $scale), (380 * $scale)
    )
    $graphics.DrawPath($bracketPen, $rightBracket)

    $pulsePen = New-Object System.Drawing.Pen(
        [System.Drawing.ColorTranslator]::FromHtml('#50c9bb'),
        (24 * $scale)
    )
    $pulsePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pulsePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pulsePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $pulsePoints = @(
        (New-Object System.Drawing.PointF((94 * $scale), (258 * $scale))),
        (New-Object System.Drawing.PointF((188 * $scale), (258 * $scale))),
        (New-Object System.Drawing.PointF((217 * $scale), (187 * $scale))),
        (New-Object System.Drawing.PointF((260 * $scale), (327 * $scale))),
        (New-Object System.Drawing.PointF((296 * $scale), (228 * $scale))),
        (New-Object System.Drawing.PointF((324 * $scale), (258 * $scale))),
        (New-Object System.Drawing.PointF((418 * $scale), (258 * $scale)))
    )
    $graphics.DrawLines($pulsePen, $pulsePoints)

    $centerBrush = New-Object System.Drawing.SolidBrush(
        [System.Drawing.ColorTranslator]::FromHtml('#f5f7f8')
    )
    $graphics.FillEllipse(
        $centerBrush,
        (246 * $scale),
        (244 * $scale),
        (28 * $scale),
        (28 * $scale)
    )

    $centerBrush.Dispose()
    $pulsePen.Dispose()
    $rightBracket.Dispose()
    $leftBracket.Dispose()
    $bracketPen.Dispose()
    $backgroundBrush.Dispose()
    $backgroundPath.Dispose()
    $graphics.Dispose()

    return $bitmap
}

function Get-PngBytes {
    param([int]$Size)

    $bitmap = New-InterceptorBitmap -Size $Size
    $stream = New-Object System.IO.MemoryStream
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $stream.ToArray()
    $stream.Dispose()
    $bitmap.Dispose()
    return $bytes
}

function Write-BigEndianUInt32 {
    param(
        [System.IO.BinaryWriter]$Writer,
        [uint32]$Value
    )

    $bytes = [System.BitConverter]::GetBytes($Value)
    if ([System.BitConverter]::IsLittleEndian) {
        [Array]::Reverse($bytes)
    }
    $Writer.Write($bytes)
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$pngPath = Join-Path $OutputDirectory 'interceptor-icon.png'
$pngBytes = Get-PngBytes -Size 512
[System.IO.File]::WriteAllBytes($pngPath, $pngBytes)

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$images = foreach ($size in $sizes) {
    [PSCustomObject]@{
        Size = $size
        Bytes = Get-PngBytes -Size $size
    }
}

$icoPath = Join-Path $OutputDirectory 'interceptor-icon.ico'
$fileStream = [System.IO.File]::Open(
    $icoPath,
    [System.IO.FileMode]::Create,
    [System.IO.FileAccess]::Write
)
$writer = New-Object System.IO.BinaryWriter($fileStream)
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]$images.Count)

$offset = 6 + (16 * $images.Count)
foreach ($image in $images) {
    $dimension = if ($image.Size -eq 256) { 0 } else { $image.Size }
    $writer.Write([byte]$dimension)
    $writer.Write([byte]$dimension)
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$image.Bytes.Length)
    $writer.Write([uint32]$offset)
    $offset += $image.Bytes.Length
}

foreach ($image in $images) {
    $writer.Write([byte[]]$image.Bytes)
}

$writer.Dispose()
$fileStream.Dispose()

$icnsImages = @(
    [PSCustomObject]@{ Type = 'icp4'; Size = 16 },
    [PSCustomObject]@{ Type = 'icp5'; Size = 32 },
    [PSCustomObject]@{ Type = 'icp6'; Size = 64 },
    [PSCustomObject]@{ Type = 'ic07'; Size = 128 },
    [PSCustomObject]@{ Type = 'ic08'; Size = 256 },
    [PSCustomObject]@{ Type = 'ic09'; Size = 512 },
    [PSCustomObject]@{ Type = 'ic10'; Size = 1024 },
    [PSCustomObject]@{ Type = 'ic11'; Size = 32 },
    [PSCustomObject]@{ Type = 'ic12'; Size = 64 },
    [PSCustomObject]@{ Type = 'ic13'; Size = 256 },
    [PSCustomObject]@{ Type = 'ic14'; Size = 512 }
) | ForEach-Object {
    [PSCustomObject]@{
        Type = $_.Type
        Bytes = Get-PngBytes -Size $_.Size
    }
}

$icnsPath = Join-Path $OutputDirectory 'interceptor-icon.icns'
$icnsLength = 8
foreach ($image in $icnsImages) {
    $icnsLength += 8 + $image.Bytes.Length
}

$icnsStream = [System.IO.File]::Open(
    $icnsPath,
    [System.IO.FileMode]::Create,
    [System.IO.FileAccess]::Write
)
$icnsWriter = New-Object System.IO.BinaryWriter($icnsStream)
$icnsWriter.Write([System.Text.Encoding]::ASCII.GetBytes('icns'))
Write-BigEndianUInt32 -Writer $icnsWriter -Value $icnsLength

foreach ($image in $icnsImages) {
    $icnsWriter.Write([System.Text.Encoding]::ASCII.GetBytes($image.Type))
    Write-BigEndianUInt32 -Writer $icnsWriter -Value (8 + $image.Bytes.Length)
    $icnsWriter.Write([byte[]]$image.Bytes)
}

$icnsWriter.Dispose()
$icnsStream.Dispose()

Write-Output "Generated $pngPath"
Write-Output "Generated $icoPath"
Write-Output "Generated $icnsPath"