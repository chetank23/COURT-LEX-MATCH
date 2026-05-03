# LexMatch AI - PostgreSQL Setup Script
# Run this once as Administrator to set up and start the PostgreSQL service
# Usage: powershell -ExecutionPolicy Bypass -File scripts\setup-postgres.ps1

param(
    [string]$PgPassword = "lexmatch2024",
    [string]$DbName = "lexmatch_ai",
    [string]$PgUser = "postgres",
    [int]$PgPort = 5432
)

$PG_HOME = "C:\Program Files\PostgreSQL\18"
$PG_BIN  = "$PG_HOME\bin"
$PG_DATA = "$PG_HOME\data"
$PSQL    = "$PG_HOME\pgAdmin 4\runtime\psql.exe"

Write-Host "=== LexMatch AI - PostgreSQL Setup ===" -ForegroundColor Cyan

# 1. Verify postgres binary exists
if (-not (Test-Path $PSQL)) {
    Write-Host "ERROR: psql not found at $PSQL" -ForegroundColor Red
    exit 1
}

# 2. Try to register and start the service
$svcName = "postgresql-x64-18"
$existingSvc = Get-Service -Name $svcName -ErrorAction SilentlyContinue

if (-not $existingSvc) {
    Write-Host "Registering PostgreSQL Windows service..." -ForegroundColor Yellow
    # Find the actual pg_ctl or postgres executable
    $pgCtlCandidates = @(
        "$PG_BIN\pg_ctl.exe",
        "C:\Program Files\PostgreSQL\18\installer\pg_ctl.exe"
    )
    
    # Try registering as service directly using sc
    $postgresExe = "$PG_BIN\postgres.exe"
    if (Test-Path $postgresExe) {
        sc.exe create $svcName binPath= "`"$postgresExe`" -D `"$PG_DATA`" -i" start= auto obj= "NT AUTHORITY\NetworkService" | Out-Null
        Write-Host "Service registration attempted." -ForegroundColor Green
    }
}

# 3. Start the service
Write-Host "Starting PostgreSQL service..." -ForegroundColor Yellow
$startResult = Start-Service -Name $svcName -ErrorAction SilentlyContinue -PassThru
if ($startResult -and $startResult.Status -eq "Running") {
    Write-Host "PostgreSQL service started successfully!" -ForegroundColor Green
} else {
    Write-Host "Service start via Windows service failed. Trying direct start..." -ForegroundColor Yellow
    
    # Try starting directly (requires running as postgres user or admin)
    $env:PGPASSWORD = $PgPassword
    $pgServerLog = "$PSScriptRoot\..\pg_server.log"
    
    # Kill any existing postgres processes
    Get-Process -Name "postgres" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    
    # Start postgres directly
    Start-Job -ScriptBlock {
        param($pgBin, $pgData)
        & "$pgBin\postgres.exe" -D $pgData 2>&1
    } -ArgumentList $PG_BIN, $PG_DATA | Out-Null
    
    Start-Sleep -Seconds 4
}

# 4. Test connection
Write-Host "Testing PostgreSQL connection..." -ForegroundColor Yellow
$env:PGPASSWORD = $PgPassword
$testResult = & $PSQL -U $PgUser -h 127.0.0.1 -p $PgPort -c "SELECT 'connected' as status;" 2>&1
if ($testResult -like "*connected*") {
    Write-Host "Connection successful!" -ForegroundColor Green
} else {
    Write-Host "Connection test output: $testResult" -ForegroundColor Yellow
    Write-Host "If PostgreSQL isn't connecting, open pgAdmin 4 and start the server manually." -ForegroundColor Yellow
    Write-Host "Then re-run this script to complete database setup." -ForegroundColor Yellow
    
    # Write .env anyway with placeholder
    $envContent = @"
DATABASE_URL=postgresql://${PgUser}:${PgPassword}@127.0.0.1:${PgPort}/${DbName}
PORT=4000
NODE_ENV=development
"@
    Set-Content -Path "$PSScriptRoot\..\server\.env" -Value $envContent
    Set-Content -Path "$PSScriptRoot\..\.env" -Value $envContent
    Write-Host ".env files written. Start PostgreSQL manually and then run: node scripts/migrate.mjs" -ForegroundColor Cyan
    exit 0
}

# 5. Create database
Write-Host "Creating database '$DbName'..." -ForegroundColor Yellow
$createDbResult = & $PSQL -U $PgUser -h 127.0.0.1 -p $PgPort -c "SELECT 1 FROM pg_database WHERE datname='$DbName';" 2>&1
if ($createDbResult -like "*1*") {
    Write-Host "Database '$DbName' already exists." -ForegroundColor Green
} else {
    & $PSQL -U $PgUser -h 127.0.0.1 -p $PgPort -c "CREATE DATABASE $DbName;" 2>&1
    Write-Host "Database '$DbName' created!" -ForegroundColor Green
}

# 6. Write .env file
$dbUrl = "postgresql://${PgUser}:${PgPassword}@127.0.0.1:${PgPort}/${DbName}"
$envContent = @"
DATABASE_URL=${dbUrl}
PORT=4000
NODE_ENV=development
"@
Set-Content -Path "$PSScriptRoot\..\server\.env" -Value $envContent
Set-Content -Path "$PSScriptRoot\..\.env" -Value $envContent
Write-Host ".env files written with DATABASE_URL." -ForegroundColor Green

# 7. Apply schema
Write-Host "Applying database schema..." -ForegroundColor Yellow
& $PSQL -U $PgUser -h 127.0.0.1 -p $PgPort -d $DbName -f "$PSScriptRoot\..\server\db\schema.sql" 2>&1 | Write-Host
Write-Host "Schema applied!" -ForegroundColor Green

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Cyan
Write-Host "DATABASE_URL: $dbUrl" -ForegroundColor White
Write-Host "Now run: node scripts/migrate.mjs    (to seed judges & hearings)" -ForegroundColor White
Write-Host "Then:    npm run dev:server          (to start the API server)" -ForegroundColor White
