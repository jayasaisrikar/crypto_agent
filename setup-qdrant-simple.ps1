Write-Host "Setting up Qdrant Vector Database..." -ForegroundColor Green

try {
    docker info | Out-Null
    Write-Host "Docker is running" -ForegroundColor Green
}
catch {
    Write-Host "Docker is not running. Please start Docker Desktop first." -ForegroundColor Red
    exit 1
}

Write-Host "Creating persistent storage directory..." -ForegroundColor Yellow
$QdrantDataDir = ".\data\qdrant"
if (-not (Test-Path $QdrantDataDir)) {
    New-Item -ItemType Directory -Path $QdrantDataDir -Force | Out-Null
    Write-Host "Created: $QdrantDataDir" -ForegroundColor Green
}

Write-Host "Cleaning up existing containers..." -ForegroundColor Yellow
docker stop crypto-qdrant 2>$null
docker rm crypto-qdrant 2>$null

Write-Host "Starting Qdrant container with persistent volume..." -ForegroundColor Cyan
$AbsolutePath = (Resolve-Path $QdrantDataDir).Path
docker run -d --name crypto-qdrant -p 6333:6333 -p 6334:6334 -v "${AbsolutePath}:/qdrant/storage" qdrant/qdrant:latest

Write-Host "Waiting for Qdrant to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 8

try {
    Invoke-WebRequest -Uri "http://localhost:6333/collections" -TimeoutSec 10 | Out-Null
    Write-Host "Qdrant is running successfully!" -ForegroundColor Green
    Write-Host "Web UI: http://localhost:6333/dashboard" -ForegroundColor Cyan
    Write-Host "Persistent storage: $AbsolutePath" -ForegroundColor Green
    Write-Host "Ready to test embeddings! Run: npm run test:gemini-embeddings" -ForegroundColor White
}
catch {
    Write-Host "Failed to connect to Qdrant" -ForegroundColor Red
    docker logs crypto-qdrant
}
