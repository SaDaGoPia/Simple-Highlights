Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot "..\src\assets\icons"
if (-not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
}

$background = [System.Drawing.ColorTranslator]::FromHtml("#0f172a")
$stripe = [System.Drawing.ColorTranslator]::FromHtml("#fae082")
$dotColors = @("#b7efc5", "#b9d9ff", "#f9c5d5") | ForEach-Object { [System.Drawing.ColorTranslator]::FromHtml($_) }

function New-RoundedRectPath {
  param([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius)

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $radius * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-Icon {
  param([int]$size)

  $bitmap = New-Object System.Drawing.Bitmap($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $radius = $size * 0.22
  $bgPath = New-RoundedRectPath -x 0 -y 0 -width $size -height $size -radius $radius
  $bgBrush = New-Object System.Drawing.SolidBrush($background)
  $graphics.FillPath($bgBrush, $bgPath)

  $graphics.TranslateTransform($size / 2, $size / 2)
  $graphics.RotateTransform(-40)
  $stripeWidth = $size * 1.35
  $stripeHeight = $size * 0.30
  $stripeRadius = $stripeHeight / 2
  $stripePath = New-RoundedRectPath -x (-$stripeWidth / 2) -y (-$stripeHeight / 2) -width $stripeWidth -height $stripeHeight -radius $stripeRadius
  $stripeBrush = New-Object System.Drawing.SolidBrush($stripe)
  $graphics.FillPath($stripeBrush, $stripePath)
  $graphics.ResetTransform()

  if ($size -ge 32) {
    $dotRadius = $size * 0.075
    $spacing = $dotRadius * 2.6
    $startX = $size / 2 - $spacing
    $dotY = $size * 0.78
    for ($i = 0; $i -lt $dotColors.Count; $i++) {
      $dotBrush = New-Object System.Drawing.SolidBrush($dotColors[$i])
      $cx = $startX + ($i * $spacing)
      $graphics.FillEllipse($dotBrush, $cx - $dotRadius, $dotY - $dotRadius, $dotRadius * 2, $dotRadius * 2)
      $dotBrush.Dispose()
    }
  }

  $path = Join-Path $outDir "icon-$size.png"
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)

  $graphics.Dispose()
  $bitmap.Dispose()
  $bgBrush.Dispose()
  $stripeBrush.Dispose()

  Write-Output "Wrote $path"
}

foreach ($size in 16, 32, 48, 128) {
  New-Icon -size $size
}
