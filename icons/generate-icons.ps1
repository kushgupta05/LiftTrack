param()

Add-Type -AssemblyName System.Drawing

function New-LiftTrackIcon {
  param(
    [int]$Size,
    [string]$OutputPath,
    [bool]$Maskable = $false
  )

  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#171a16"))

  $scale = $Size / 512.0
  $inset = if ($Maskable) { 82 * $scale } else { 48 * $scale }
  $green = [System.Drawing.ColorTranslator]::FromHtml("#a8ec46")
  $cream = [System.Drawing.ColorTranslator]::FromHtml("#f3f1eb")
  $ringPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(52, $green), 18 * $scale)
  $graphics.DrawEllipse($ringPen, $inset, $inset, $Size - 2 * $inset, $Size - 2 * $inset)

  $greenBrush = [System.Drawing.SolidBrush]::new($green)
  $creamBrush = [System.Drawing.SolidBrush]::new($cream)
  $factor = if ($Maskable) { 0.82 } else { 1.0 }
  $center = $Size / 2.0
  function X([double]$value) { return $center + (($value - 256) * $scale * $factor) }
  function W([double]$value) { return $value * $scale * $factor }

  $graphics.FillRectangle($greenBrush, (X 112), (X 222), (W 54), (W 68))
  $graphics.FillRectangle($greenBrush, (X 346), (X 222), (W 54), (W 68))
  $graphics.FillRectangle($greenBrush, (X 166), (X 244), (W 180), (W 24))
  $graphics.FillRectangle($creamBrush, (X 138), (X 193), (W 28), (W 126))
  $graphics.FillRectangle($creamBrush, (X 346), (X 193), (W 28), (W 126))

  $fontSize = [Math]::Max(18, 62 * $scale * $factor)
  $font = [System.Drawing.Font]::new("Arial", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $format = [System.Drawing.StringFormat]::new()
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $textY = if ($Maskable) { 374 } else { 386 }
  $graphics.DrawString("LT", $font, $creamBrush, [System.Drawing.RectangleF]::new(0, (X ($textY - 45)), $Size, (W 90)), $format)

  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $format.Dispose(); $font.Dispose(); $ringPen.Dispose(); $greenBrush.Dispose(); $creamBrush.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}

$iconDirectory = $PSScriptRoot
New-LiftTrackIcon -Size 192 -OutputPath (Join-Path $iconDirectory "lifttrack-192.png")
New-LiftTrackIcon -Size 512 -OutputPath (Join-Path $iconDirectory "lifttrack-512.png")
New-LiftTrackIcon -Size 512 -OutputPath (Join-Path $iconDirectory "lifttrack-maskable-512.png") -Maskable $true
