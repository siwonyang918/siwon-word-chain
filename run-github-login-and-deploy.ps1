$env:PATH = 'C:\Users\NT371B5L\AppData\Local\Microsoft\WinGet\Packages\GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\bin;C:\Program Files\Git\cmd;' + $env:PATH
Set-Location -LiteralPath 'C:\Users\NT371B5L\Documents\Codex\2026-07-08\dl\outputs\word-chain-game'
Write-Host 'GitHub 무료 로그인 화면이 열립니다. 결제 정보는 필요 없습니다.' -ForegroundColor Cyan
Write-Host '로그인이 끝나면 자동으로 게임을 GitHub Pages에 배포합니다.' -ForegroundColor Cyan
& 'C:\Users\NT371B5L\AppData\Local\Microsoft\WinGet\Packages\GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\bin\gh.exe' auth login --hostname github.com --web --git-protocol https
if ($LASTEXITCODE -eq 0) {
  powershell -ExecutionPolicy Bypass -File 'C:\Users\NT371B5L\Documents\Codex\2026-07-08\dl\outputs\word-chain-game\deploy-github-pages.ps1'
} else {
  Write-Host 'GitHub 로그인이 완료되지 않았습니다.' -ForegroundColor Yellow
}
Write-Host ''
Read-Host '끝났으면 이 창을 닫고 Codex에 완료라고 입력하세요'
