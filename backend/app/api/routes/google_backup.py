from typing import Optional
from fastapi import APIRouter, Depends, Request, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.schemas.google_backup import (
    GoogleBackupStatusResponse,
    GoogleAuthUrlResponse,
    GoogleBackupSettingsUpdate,
    GoogleBackupActionResponse,
    GoogleBackupRestoreRequest,
)
from backend.app.services.google_drive_service import (
    get_google_backup_status,
    generate_auth_url,
    exchange_auth_code,
    disconnect_google_account,
    update_google_settings,
    restore_cloud_backup,
)
from backend.app.services.backup_scheduler import trigger_cloud_backup_synchronous

router = APIRouter(prefix="/backup/google", tags=["Google Drive Cloud Backup"])

@router.get("/status", response_model=GoogleBackupStatusResponse)
def get_status(db: Session = Depends(get_db)):
    return get_google_backup_status(db)

@router.get("/auth-url", response_model=GoogleAuthUrlResponse)
def get_auth_url(request: Request, redirect_uri: Optional[str] = None, db: Session = Depends(get_db)):
    if not redirect_uri:
        base = str(request.base_url).rstrip("/")
        redirect_uri = f"{base}/api/backup/google/callback"
    url = generate_auth_url(redirect_uri=redirect_uri, db=db)
    return GoogleAuthUrlResponse(auth_url=url)

@router.get("/callback", response_class=HTMLResponse)
def google_oauth_callback(
    request: Request,
    code: Optional[str] = None,
    error: Optional[str] = None,
    db: Session = Depends(get_db),
):
    if error:
        return HTMLResponse(
            f"""
            <html><body style="font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:50px;">
            <h3 style="color:#e11d48;">Google Authorization Cancelled or Failed</h3>
            <p style="color:#64748b;">{error}</p>
            <button onclick="window.close()" style="padding:8px 16px;cursor:pointer;">Close Window</button>
            </body></html>
            """,
            status_code=400,
        )
    if not code:
        return HTMLResponse(
            """
            <html><body style="font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:50px;">
            <h3 style="color:#e11d48;">Missing authorization code</h3>
            <p style="color:#64748b;">Google did not provide a verification code.</p>
            <button onclick="window.close()" style="padding:8px 16px;cursor:pointer;">Close Window</button>
            </body></html>
            """,
            status_code=400,
        )

    base = str(request.base_url).rstrip("/")
    redirect_uri = f"{base}/api/backup/google/callback"

    try:
        exchange_auth_code(code=code, redirect_uri=redirect_uri, db=db)
        return HTMLResponse(
            """
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>Google Account Linked - StockFlow</title>
              <style>
                body {
                  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  background: #f8fafc;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  min-height: 100vh;
                  margin: 0;
                  padding: 20px;
                  box-sizing: border-box;
                }
                .card {
                  max-width: 440px;
                  width: 100%;
                  background: #ffffff;
                  border-radius: 28px;
                  border: 1px solid #e2e8f0;
                  padding: 36px 28px;
                  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
                  text-align: center;
                }
                .icon {
                  width: 64px;
                  height: 64px;
                  border-radius: 20px;
                  background: #ecfdf5;
                  color: #059669;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  margin: 0 auto 20px;
                  font-size: 32px;
                }
                h2 {
                  color: #0f172a;
                  margin: 0 0 8px;
                  font-size: 22px;
                  font-weight: 700;
                }
                p {
                  color: #64748b;
                  font-size: 14px;
                  line-height: 1.5;
                  margin: 0 0 24px;
                }
                .btn {
                  background: #059669;
                  color: #ffffff;
                  border: none;
                  padding: 12px 28px;
                  border-radius: 14px;
                  font-weight: 600;
                  font-size: 14px;
                  cursor: pointer;
                  transition: background 0.15s ease;
                }
                .btn:hover {
                  background: #047857;
                }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="icon">✓</div>
                <h2>Google Account Connected</h2>
                <p>Your Google Drive is now linked with StockFlow in restricted app-data mode. Automated backups will occur in the background.</p>
                <button class="btn" onclick="window.close()">Close Window</button>
              </div>
              <script>
                try {
                  if (window.opener) {
                    window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, '*');
                    setTimeout(function() { window.close(); }, 1500);
                  }
                } catch(e) {}
              </script>
            </body>
            </html>
            """
        )
    except Exception as e:
        return HTMLResponse(
            f"""
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>Connection Failed - StockFlow</title>
              <style>
                body {{
                  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  background: #f8fafc;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  min-height: 100vh;
                  margin: 0;
                  padding: 20px;
                  box-sizing: border-box;
                }}
                .card {{
                  max-width: 480px;
                  width: 100%;
                  background: #ffffff;
                  border-radius: 28px;
                  border: 1px solid #fee2e2;
                  padding: 36px 28px;
                  box-shadow: 0 10px 25px -5px rgba(239, 68, 68, 0.1);
                  text-align: center;
                }}
                .icon {{
                  width: 64px;
                  height: 64px;
                  border-radius: 20px;
                  background: #fef2f2;
                  color: #e11d48;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  margin: 0 auto 20px;
                  font-size: 32px;
                  font-weight: 700;
                }}
                h2 {{
                  color: #0f172a;
                  margin: 0 0 8px;
                  font-size: 20px;
                  font-weight: 700;
                }}
                p {{
                  color: #64748b;
                  font-size: 14px;
                  line-height: 1.5;
                  margin: 0 0 24px;
                  word-break: break-word;
                }}
                .btn {{
                  background: #0f172a;
                  color: #ffffff;
                  border: none;
                  padding: 12px 28px;
                  border-radius: 14px;
                  font-weight: 600;
                  font-size: 14px;
                  cursor: pointer;
                  transition: background 0.15s ease;
                }}
                .btn:hover {{
                  background: #334155;
                }}
              </style>
            </head>
            <body>
              <div class="card">
                <div class="icon">✕</div>
                <h2>Google Connection Failed</h2>
                <p>{str(e)}</p>
                <button class="btn" onclick="window.close()">Close Window</button>
              </div>
            </body>
            </html>
            """,
            status_code=400,
        )

@router.post("/disconnect")
def disconnect_account(db: Session = Depends(get_db)):
    disconnect_google_account(db)
    return {"success": True, "message": "Google Drive disconnected successfully."}

@router.post("/settings", response_model=GoogleBackupStatusResponse)
def update_settings(data: GoogleBackupSettingsUpdate, db: Session = Depends(get_db)):
    update_google_settings(data, db)
    return get_google_backup_status(db)

@router.post("/trigger", response_model=GoogleBackupActionResponse)
def trigger_backup(db: Session = Depends(get_db)):
    res = trigger_cloud_backup_synchronous()
    return GoogleBackupActionResponse(
        success=res.get("success", False),
        message=res.get("message", "Cloud backup processed."),
        file=res.get("file"),
    )

@router.post("/restore/{file_id}")
def restore_backup(file_id: str, req: GoogleBackupRestoreRequest, db: Session = Depends(get_db)):
    return restore_cloud_backup(file_id, db, confirm_pin=req.confirm_pin)

