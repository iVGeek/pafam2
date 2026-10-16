#Requires -Version 5.1
<#
.SYNOPSIS
  One-shot setup of the pafam2 project on Railway (Next.js + PostgreSQL).

.DESCRIPTION
  Runs the full non-interactive Railway flow for this repo:
    1. verifies the CLI/auth, logging in if needed
    2. creates and links the project
    3. adds the PostgreSQL database service
    4. creates the app service
    5. sets DATABASE_URL (as a reference to the DB service), AUTH_SECRET, ADMIN_PASSWORD
    6. attaches the GitHub source for auto-deploy (or uploads locally with -LocalUpload)
    7. generates a public domain and prints status

  Safe to re-run: existing project/service/database steps are tolerated.

.EXAMPLE
  # GitHub auto-deploy (recommended)
  powershell -ExecutionPolicy Bypass -File .\scripts\railway-setup.ps1

.EXAMPLE
  # Upload the current directory instead of connecting GitHub
  .\scripts\railway-setup.ps1 -LocalUpload

.EXAMPLE
  # Non-interactive with a supplied admin password
  .\scripts\railway-setup.ps1 -AdminPassword 'S3cret!' -Workspace 'My Workspace'
#>
[CmdletBinding()]
param(
  [string]$ProjectName   = 'pafam2',
  [string]$ServiceName   = 'pafam2',
  [string]$Repo          = 'iVGeek/pafam2',
  [string]$Branch        = 'main',
  [string]$DbServiceName = 'Postgres',
  [string]$Workspace,
  [string]$AdminPassword,
  [switch]$LocalUpload
)

$ErrorActionPreference = 'Stop'

function Say  { param([string]$m) Write-Host "`n==> $m" -ForegroundColor Cyan }
function Ok   { param([string]$m) Write-Host "    $m" -ForegroundColor Green }
function Warn { param([string]$m) Write-Host "    $m" -ForegroundColor Yellow }
function Die  { param([string]$m) Write-Host "`nERROR: $m" -ForegroundColor Red; exit 1 }

function Run-Railway {
  param([string[]]$Cmd, [switch]$AllowFail)
  Write-Host "    > railway $($Cmd -join ' ')" -ForegroundColor DarkGray
  & railway @Cmd
  $code = $LASTEXITCODE
  if ($code -ne 0 -and -not $AllowFail) {
    Die "railway $($Cmd[0]) failed with exit code $code"
  }
  return $code
}

# --- preflight -------------------------------------------------------------
Say 'Preflight'
if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
  Die "Railway CLI not found. Install it with: npm install -g @railway/cli"
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Die 'Node.js not found on PATH.'
}
if (-not (Test-Path -LiteralPath 'railway.toml')) {
  Die "railway.toml not found. Run this script from the repo root (C:\iVGeek\pafam2)."
}
Ok "railway CLI: $((railway --version))"
Ok "repo: $(Get-Location)"

# --- auth ------------------------------------------------------------------
Say 'Checking authentication'
& railway whoami *> $null
if ($LASTEXITCODE -ne 0) {
  Warn 'Not logged in - starting interactive login.'
  Run-Railway @('login')
}
Ok "logged in as: $((railway whoami))"

# --- project -----------------------------------------------------------------
Say "Project '$ProjectName'"
& railway status *> $null
if ($LASTEXITCODE -ne 0) {
  $initArgs = @('init', '--name', $ProjectName)
  if ($Workspace) { $initArgs += @('--workspace', $Workspace) }
  Run-Railway $initArgs
  Ok "created and linked project '$ProjectName'"
} else {
  Ok 'directory already linked to a project'
}

# --- database -----------------------------------------------------------------
Say 'PostgreSQL database'
$addDb = Run-Railway @('add', '--database', 'postgres') -AllowFail
if ($addDb -ne 0) {
  Warn 'database service not created (it may already exist)'
}
Ok "using DB service name: $DbServiceName  (override with -DbServiceName)"

# --- app service --------------------------------------------------------------
Say "App service '$ServiceName'"
$addSvc = Run-Railway @('add', '--service', $ServiceName) -AllowFail
if ($addSvc -ne 0) {
  Warn 'app service not created (it may already exist)'
}

# --- variables ----------------------------------------------------------------
Say 'Configuring variables'
$authSecret = (& node -e "console.log(require('crypto').randomBytes(32).toString('hex'))").Trim()
if (-not $AdminPassword) {
  $secure = Read-Host -AsSecureString "Enter ADMIN_PASSWORD for admin@pafam2.local"
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try   { $AdminPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
if (-not $AdminPassword) { Die 'ADMIN_PASSWORD cannot be empty.' }

$dbRef = '${{' + $DbServiceName + '.DATABASE_URL}}'
Run-Railway @('variable', 'set', "DATABASE_URL=$dbRef",         '--service', $ServiceName, '--skip-deploys')
Run-Railway @('variable', 'set', "AUTH_SECRET=$authSecret",     '--service', $ServiceName, '--skip-deploys')
Run-Railway @('variable', 'set', "ADMIN_PASSWORD=$AdminPassword", '--service', $ServiceName, '--skip-deploys')
Ok 'DATABASE_URL / AUTH_SECRET / ADMIN_PASSWORD set'

# --- source + deploy ----------------------------------------------------------
Say 'Attaching source and deploying'
if ($LocalUpload) {
  Run-Railway @('up', '--service', $ServiceName)
  Ok 'uploaded current directory'
} else {
  $connect = Run-Railway @('service', 'source', 'connect', '--repo', $Repo, '--branch', $Branch, '--service', $ServiceName) -AllowFail
  if ($connect -eq 0) {
    Ok "connecting $Repo@$Branch - Railway will build and deploy"
  } else {
    Warn 'GitHub source connect failed (is the Railway GitHub App installed for the repo?).'
    Warn 'Falling back to a local upload...'
    Run-Railway @('up', '--service', $ServiceName)
  }
}

# --- domain -------------------------------------------------------------------
Say 'Public domain'
Run-Railway @('domain', '--service', $ServiceName) -AllowFail
Run-Railway @('domain', 'list', '--service', $ServiceName) -AllowFail

# --- verify -------------------------------------------------------------------
Say 'Status'
Run-Railway @('status') -AllowFail

Write-Host ''
Write-Host 'Done. Next:' -ForegroundColor Cyan
Write-Host '  - Wait for the build, then inspect logs:  railway logs --service ' -NoNewline
Write-Host $ServiceName
Write-Host '  - Health check:                           curl.exe https://<domain>/api/health'
Write-Host '  - Log in at /login as admin@pafam2.local with the ADMIN_PASSWORD you entered.' -ForegroundColor Green
