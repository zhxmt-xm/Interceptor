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
    $gradientBounds = New-Object System.Drawing.RectangleF(
        (28 * $scale),
        (28 * $scale),
        (456 * $scale),
        (456 * $scale)
    )
    $backgroundBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $gradientBounds,
        [System.Drawing.ColorTranslator]::FromHtml('#2fd4b8'),
        [System.Drawing.ColorTranslator]::FromHtml('#c07cff'),
        [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal
    )
    $graphics.FillPath($backgroundBrush, $backgroundPath)

    $boltPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $boltPoints = @(
        (New-Object System.Drawing.PointF((272 * $scale), (96 * $scale))),
        (New-Object System.Drawing.PointF((112 * $scale), (288 * $scale))),
        (New-Object System.Drawing.PointF((256 * $scale), (288 * $scale))),
        (New-Object System.Drawing.PointF((240 * $scale), (416 * $scale))),
        (New-Object System.Drawing.PointF((400 * $scale), (224 * $scale))),
        (New-Object System.Drawing.PointF((256 * $scale), (224 * $scale)))
    )
    $boltPath.AddPolygon($boltPoints)
    $boltPen = New-Object System.Drawing.Pen(
        [System.Drawing.ColorTranslator]::FromHtml('#ffffff'),
        (32 * $scale)
    )
    $boltPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $boltPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $boltPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $graphics.DrawPath($boltPen, $boltPath)

    $boltPen.Dispose()
    $boltPath.Dispose()
    $backgroundBrush.Dispose()
    $gradientBounds = $null
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