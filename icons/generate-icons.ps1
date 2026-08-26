param()

Add-Type -AssemblyName System.Drawing

$sourcePath = Join-Path $PSScriptRoot "lifttrack-icon.svg"
[xml]$sourceSvg = Get-Content -Raw -Encoding utf8 $sourcePath
$svg = $sourceSvg.svg
$viewBox = @($svg.viewBox -split '\s+' | ForEach-Object { [double]$_ })
$sourceSize = $viewBox[2]
$background = $svg.rect | Where-Object { $_.id -eq "background" }
$backgroundColor = [System.Drawing.ColorTranslator]::FromHtml([string]$background.fill)

function New-RoundedRectanglePath {
  param([single]$X, [single]$Y, [single]$Width, [single]$Height, [single]$Radius)
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-LiftTrackIcon {
  param([int]$Size, [string]$OutputPath)
  $scale = $Size / $sourceSize
  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $backgroundBrush = [System.Drawing.SolidBrush]::new($backgroundColor)
  $radius = [single]([double]$background.rx * $scale)
  $backgroundPath = New-RoundedRectanglePath 0 0 $Size $Size $radius
  $graphics.FillPath($backgroundBrush, $backgroundPath)
  $backgroundPath.Dispose()

  foreach ($group in $svg.g) {
    $strokeColor = [System.Drawing.ColorTranslator]::FromHtml([string]$group.stroke)
    foreach ($line in $group.line) {
      $widthValue = if ($line.'stroke-width') { [double]$line.'stroke-width' } else { [double]$group.'stroke-width' }
      $pen = [System.Drawing.Pen]::new($strokeColor, [single]($widthValue * $scale))
      $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round; $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
      $graphics.DrawLine($pen, [single]([double]$line.x1 * $scale), [single]([double]$line.y1 * $scale), [single]([double]$line.x2 * $scale), [single]([double]$line.y2 * $scale))
      $pen.Dispose()
    }
  }

  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $backgroundBrush.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}

function Add-MaskableBackground {
  param([string]$ImagePath)
  $source = [System.Drawing.Bitmap]::FromFile($ImagePath)
  $bitmap = [System.Drawing.Bitmap]::new($source.Width, $source.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear($backgroundColor)
  $graphics.DrawImageUnscaled($source, 0, 0)
  $source.Dispose(); $graphics.Dispose()
  $bitmap.Save($ImagePath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
}

New-LiftTrackIcon -Size 192 -OutputPath (Join-Path $PSScriptRoot "lifttrack-192.png")
New-LiftTrackIcon -Size 512 -OutputPath (Join-Path $PSScriptRoot "lifttrack-maskable-512.png")
Add-MaskableBackground -ImagePath (Join-Path $PSScriptRoot "lifttrack-maskable-512.png")
New-LiftTrackIcon -Size 512 -OutputPath (Join-Path $PSScriptRoot "lifttrack-512.png")
