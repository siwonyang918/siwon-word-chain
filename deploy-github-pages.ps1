$ErrorActionPreference = "Stop"

$repoName = "word-chain-game"
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $project

function Resolve-Tool($name, $fallbacks) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }

    foreach ($path in $fallbacks) {
        if (Test-Path -LiteralPath $path) {
            return $path
        }
    }

    throw "$name was not found."
}

$git = Resolve-Tool "git" @(
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Program Files\Git\bin\git.exe"
)
$gh = Resolve-Tool "gh" @(
    "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\bin\gh.exe"
)

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
& $git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    & $git commit -m "Configure GitHub Pages URL"
}

$repoExists = $false
$previousErrorPreference = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
& $gh repo view "$login/$repoName" 1>$null 2>$null
$repoExists = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = $previousErrorPreference

if (-not $repoExists) {
    & $gh repo create "$repoName" --public --description "Korean word-chain browser game"
}

$remoteUrl = "https://github.com/$login/$repoName.git"
& $git remote remove origin 2>$null
& $git remote add origin $remoteUrl
& $git push -u origin main

$pagesEnabled = $false
$ErrorActionPreference = "SilentlyContinue"
& $gh api "repos/$login/$repoName/pages" 1>$null 2>$null
$pagesEnabled = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = $previousErrorPreference

if (-not $pagesEnabled) {
    & $gh api -X POST "repos/$login/$repoName/pages" -F "source[branch]=main" -F "source[path]=/" 1>$null
} else {
    & $gh api -X PUT "repos/$login/$repoName/pages" -F "source[branch]=main" -F "source[path]=/" 1>$null
}

Write-Host ""
Write-Host "GitHub Pages URL:"
Write-Host $siteUrl
Write-Host ""
Write-Host "Sitemap:"
Write-Host "${siteUrl}sitemap.xml"
