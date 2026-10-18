from contextlib import asynccontextmanager
import os
import sys
from pathlib import Path
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import IntegrityError

from backend.app.core.config import settings
from backend.app.core.database import engine, Base, SessionLocal, auto_upgrade_schema
from backend.app.core.errors import BusinessRuleException
from backend.app.services.auth_service import seed_initial_data

# Import all API routes
from backend.app.api.routes import (
    auth, settings as settings_routes, products, inventory,
    customers, sales, returns, suppliers, purchases,
    bills, expenses, dashboard, reports, backup, quotations,
    google_backup, printing, users, sync, network, templates, accounts
)
from backend.app.services.backup_scheduler import start_backup_scheduler, stop_backup_scheduler
from backend.app.services.network_service import start_discovery_beacon, stop_discovery_beacon

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Ensure all database tables exist and schema is up to date
    Base.metadata.create_all(bind=engine)
    auto_upgrade_schema()
    # 2. Seed default admin, settings, walk-in customer
    db = SessionLocal()
    try:
        seed_initial_data(db)
    finally:
        db.close()
    
    # 3. Start background cloud backup scheduler
    start_backup_scheduler()
    # 4. Start local network discovery beacon
    start_discovery_beacon()
    yield
    stop_discovery_beacon()
    stop_backup_scheduler()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Friendly error handling (Section 54: Error Handling)
@app.exception_handler(BusinessRuleException)
async def business_rule_exception_handler(request: Request, exc: BusinessRuleException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "friendly": True}
    )

@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    error_str = str(exc.orig) if hasattr(exc, "orig") else str(exc)
    if "UNIQUE constraint failed" in error_str:
        if "barcode" in error_str:
            detail = "This barcode is already assigned to another product."
        elif "username" in error_str:
            detail = "This username is already in use."
        elif "product_id" in error_str:
            detail = "Product ID already exists."
        else:
            detail = "A record with these unique details already exists."
    elif "FOREIGN KEY constraint failed" in error_str:
        detail = "This item cannot be deleted because it is linked to existing transactions or records."
    elif "CHECK constraint failed" in error_str:
        detail = "The entered quantity or price value is invalid (must be positive and valid)."
    else:
        detail = "A database constraint prevented this operation."

    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": detail, "friendly": True}
    )

import logging

logger = logging.getLogger("uvicorn.error")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Something went wrong while processing your request. Please try again.", "friendly": True}
    )

# Include API Routers
api_prefix = settings.API_PREFIX
app.include_router(auth.router, prefix=api_prefix)
app.include_router(settings_routes.router, prefix=api_prefix)
app.include_router(products.router, prefix=api_prefix)
app.include_router(inventory.router, prefix=api_prefix)
app.include_router(customers.router, prefix=api_prefix)
app.include_router(sales.router, prefix=api_prefix)
app.include_router(returns.router, prefix=api_prefix)
app.include_router(returns.purchase_returns_router, prefix=api_prefix)
app.include_router(suppliers.router, prefix=api_prefix)
app.include_router(purchases.router, prefix=api_prefix)
app.include_router(bills.router, prefix=api_prefix)
app.include_router(expenses.router, prefix=api_prefix)
app.include_router(dashboard.router, prefix=api_prefix)
app.include_router(reports.router, prefix=api_prefix)
app.include_router(backup.router, prefix=api_prefix)
app.include_router(google_backup.router, prefix=api_prefix)
app.include_router(quotations.router, prefix=api_prefix)
app.include_router(printing.router, prefix=api_prefix)
app.include_router(users.router, prefix=api_prefix)
app.include_router(sync.router, prefix=api_prefix)
app.include_router(network.router, prefix=api_prefix)
app.include_router(templates.router, prefix=api_prefix)
app.include_router(accounts.router, prefix=api_prefix)

@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": settings.PROJECT_NAME, "version": settings.VERSION}

# Mount Frontend Dist if built
frontend_dist = settings.BASE_DIR / "frontend" / "dist"
if not frontend_dist.exists() and getattr(sys, "frozen", False):
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass and (Path(meipass) / "frontend" / "dist").exists():
        frontend_dist = Path(meipass) / "frontend" / "dist"
    elif (settings.BASE_DIR / "_internal" / "frontend" / "dist").exists():
        frontend_dist = settings.BASE_DIR / "_internal" / "frontend" / "dist"

if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = frontend_dist / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_dist / "index.html")
else:
    from fastapi.responses import HTMLResponse
    @app.get("/{full_path:path}")
    async def serve_missing_frontend(full_path: str):
        return HTMLResponse(
            "<html><body style='font-family:sans-serif;text-align:center;padding:50px;'>"
            "<h2>Stock Manager Backend is Running</h2>"
            "<p>Frontend UI files were not found. Please ensure <code>frontend/dist</code> is present.</p>"
            "</body></html>",
            status_code=200
        )
