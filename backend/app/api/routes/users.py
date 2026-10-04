from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.schemas.auth import UserResponse, UserCreate, UserUpdate
from backend.app.services.user_service import (
    list_users, create_user, update_user, delete_user
)

router = APIRouter(prefix="/users", tags=["Users"])

@router.get("", response_model=List[UserResponse])
def get_all_users(db: Session = Depends(get_db)):
    return list_users(db)

@router.post("", response_model=UserResponse)
def add_new_user(data: UserCreate, db: Session = Depends(get_db)):
    return create_user(db, data)

@router.put("/{user_id}", response_model=UserResponse)
def modify_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db)):
    return update_user(db, user_id, data)

@router.delete("/{user_id}")
def remove_user(user_id: int, db: Session = Depends(get_db)):
    delete_user(db, user_id)
    return {"success": True, "message": "User deleted successfully"}
