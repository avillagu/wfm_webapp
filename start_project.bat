@echo off
setlocal

:: =====================================================================
:: MAPO WFM WEBAPP - DEBUG START-UP SCRIPT (ONE-CLICK)
:: =====================================================================
echo.
echo  ==============================================================
echo  Checking system requirements...
echo  ==============================================================

:: 1. Check Docker
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker not found! Please install Docker Desktop for Windows.
    pause
    exit /b 1
)

:: 2. Check for port conflicts (basic)
echo [INFO] Checking for port conflicts (5432, 3000, 4200)...
netstat -ano | findstr ":5432" >nul && echo [WARNING] Port 5432 (Postgres) might be occupied.
netstat -ano | findstr ":3000" >nul && echo [WARNING] Port 3000 (Backend) might be occupied.
netstat -ano | findstr ":4200" >nul && echo [WARNING] Port 4200 (Frontend) might be occupied.

echo.
echo  [2/4] Building and launching containers...
echo  This may take several minutes on the first run.
echo.

:: Run docker-compose without -d first to see any immediate fatal errors
:: Actually, we'll run it normally but catch errors better.
docker-compose up --build -d

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Docker-compose failed to start.
    echo Please check the messages above for errors.
    echo Possible causes: Port conflict, Docker daemon not running, or syntax error in Dockerfile.
    pause
    exit /b %errorlevel%
)

echo.
echo  [3/4] Waiting for services to initialize...
echo  If this is the first run, the database is being seeded.
timeout /t 15 /nobreak >nul

:: Checking container health
echo.
echo  [DEBUG] Container Status:
docker-compose ps

echo.
echo  [4/4] Setup complete!
echo.
echo  ==============================================================
echo  MAPO WFM WebApp is active!
echo  ==============================================================
echo  [-] Frontend (Angular): http://localhost:4200
echo  [-] Backend (NodeJS):    http://localhost:3000/api
echo  [-] Logs (Real-time):   See below...
echo  ==============================================================
echo.

:: Launch the default browser
start http://localhost:4200

:: Stay open and show logs
echo Streaming logs (Press Ctrl+C to exit script without stopping containers^):
docker-compose logs -f --tail=100

endlocal
