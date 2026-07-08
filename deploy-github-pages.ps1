$ErrorActionPreference = "Stop"

$repoName = "word-chain-game"
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $project

$git = (Get-Command git -ErrorAction Stop).Source
$gh = (Get-Command gh -ErrorAction Stop).Source

$login = & $gh api user --jq ".login"
if (-not $login) {
    throw "GitHub login was not found. Run: gh auth login --web --git-protocol https"
}

$siteUrl = "https://$login.github.io/$repoName/"

$indexPath = Join-Path $project "index.html"
$index = Get-Content -LiteralPath $indexPath -Raw -Encoding UTF8
$index = $index -replace '<link rel="canonical" href="[^"]*">\s*', ''
$index = $index -replace '<meta property="og:url" content="[^"]*">\s*', ''
$index = $index -replace '(<meta name="robots" content="index, follow">\s*)', "`$1    <link rel=`"canonical`" href=`"$siteUrl`">`r`n"
$index = $index -replace '(<meta property="og:type" content="website">\s*)', "`$1    <meta property=`"og:url`" content=`"$siteUrl`">`r`n"
Set-Content -LiteralPath $indexPath -Value $index -Encoding UTF8

$robots = @"
User-agent: *
Allow: /

Sitemap: ${siteUrl}sitemap.xml
"@
Set-Content -LiteralPath (Join-Path $project "robots.txt") -Value $robots -Encoding UTF8

$today = Get-Date -Format "yyyy-MM-dd"
$sitemap = @"
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>$siteUrl</loc>
    <lastmod>$today</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
"@
Set-Content -LiteralPath (Join-Path $project "sitemap.xml") -Value $sitemap -Encoding UTF8
$cnamePath = Join-Path $project "CNAME"
if (Test-Path -LiteralPath $cnamePath) {
    Remove-Item -LiteralPath $cnamePath
}

if (-not (Test-Path -LiteralPath (Join-Path $project ".git"))) {
    & $git init -b main
}

& $git add .
if (-not (& $git diff --cached --quiet)) {
    & $git commit -m "Configure GitHub Pages URL"
}

$repoExists = $true
& $gh repo view "$login/$repoName" *> $null
if ($LASTEXITCODE -ne 0) {
    $repoExists = $false
}

if (-not $repoExists) {
    & $gh repo create "$repoName" --public --source "." --remote origin --push --description "Korean word-chain browser game"
} else {
    $remoteUrl = "https://github.com/$login/$repoName.git"
    & $git remote remove origin 2>$null
    & $git remote add origin $remoteUrl
    & $git push -u origin main
}

& $gh api -X POST "repos/$login/$repoName/pages" -f source='{"branch":"main","path":"/"}' 2>$null
if ($LASTEXITCODE -ne 0) {
    & $gh api -X PUT "repos/$login/$repoName/pages" -f source='{"branch":"main","path":"/"}' 2>$null
}

Write-Host ""
Write-Host "GitHub Pages URL:"
Write-Host $siteUrl
Write-Host ""
Write-Host "Sitemap:"
Write-Host "${siteUrl}sitemap.xml"
