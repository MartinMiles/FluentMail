Add-Type -AssemblyName System.Drawing
$taskRoot = Split-Path -Parent $PSScriptRoot
$resourceDir = Join-Path $taskRoot 'resources'
New-Item -ItemType Directory -Path $resourceDir -Force | Out-Null
$bitmap = New-Object System.Drawing.Bitmap 256,256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)
$shape = New-Object System.Drawing.Drawing2D.GraphicsPath
$shape.AddArc(8,8,64,64,180,90)
$shape.AddArc(184,8,64,64,270,90)
$shape.AddArc(184,184,64,64,0,90)
$shape.AddArc(8,184,64,64,90,90)
$shape.CloseFigure()
$brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(53,109,196))
$graphics.FillPath($brush,$shape)
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White),10
$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$graphics.DrawRectangle($pen,55,78,146,104)
$graphics.DrawLines($pen,[System.Drawing.Point[]]@([System.Drawing.Point]::new(57,82),[System.Drawing.Point]::new(128,137),[System.Drawing.Point]::new(199,82)))
function Write-MailIcon([string]$Name) {
  $stream = New-Object System.IO.MemoryStream
  $bitmap.Save($stream,[System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $stream.ToArray()
  $writer = New-Object System.IO.BinaryWriter ([System.IO.File]::Create((Join-Path $resourceDir $Name)))
  $writer.Write([UInt16]0); $writer.Write([UInt16]1); $writer.Write([UInt16]1)
  $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
  $writer.Write([UInt16]1); $writer.Write([UInt16]32); $writer.Write([UInt32]$bytes.Length); $writer.Write([UInt32]22)
  $writer.Write($bytes)
  $writer.Dispose(); $stream.Dispose()
}
Write-MailIcon 'app.ico'
$badgeBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255,195,62))
$graphics.FillEllipse($badgeBrush,165,164,82,82)
$graphics.DrawEllipse($pen,165,164,82,82)
Write-MailIcon 'app-unread.ico'
$badgeBrush.Dispose(); $pen.Dispose(); $brush.Dispose(); $shape.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
