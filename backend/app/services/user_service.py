from typing import List
from sqlalchemy.orm import Session
from backend.app.models.user import User
from backend.app.schemas.auth import UserCreate, UserUpdate, UserResponse
from backend.app.core.security import hash_password
from backend.app.core.errors import BusinessRuleException, EntityNotFoundException

def list_users(db: Session) -> List[User]:
    return db.query(User).order_by(User.id.asc()).all()

def get_user_by_id(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise EntityNotFoundException("User", str(user_id))
    return user

def create_user(db: Session, data: UserCreate) -> User:
    clean_username = data.username.strip().lower()
    if len(clean_username) < 3:
        raise BusinessRuleException("Username must be at least 3 characters long.")
    
    clean_password = data.password.strip()
    if len(clean_password) < 4:
        raise BusinessRuleException("Password must be at least 4 characters long.")

    existing = db.query(User).filter(User.username == clean_username).first()
    if existing:
        raise BusinessRuleException(f"Username '{clean_username}' already exists. Please choose another username.")

    allowed_roles = ["ADMIN", "CASHIER", "RESTOCKER"]
    role = data.role.upper().strip() if data.role else "RESTOCKER"
    if role not in allowed_roles:
        role = "RESTOCKER"

    user = User(
        username=clean_username,
        password_hash=hash_password(clean_password),
        full_name=data.full_name.strip() or clean_username.capitalize(),
        role=role,
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def update_user(db: Session, user_id: int, data: UserUpdate) -> User:
    user = get_user_by_id(db, user_id)

    if data.full_name is not None and data.full_name.strip():
        user.full_name = data.full_name.strip()

    if data.role is not None:
        new_role = data.role.upper().strip()
        allowed_roles = ["ADMIN", "CASHIER", "RESTOCKER"]
        if new_role in allowed_roles:
            # Prevent demoting the last active admin
            if user.role == "ADMIN" and new_role != "ADMIN":
                admin_count = db.query(User).filter(User.role == "ADMIN", User.is_active == True).count()
                if admin_count <= 1:
                    raise BusinessRuleException("Cannot change role. The system requires at least one active Admin user.")
            user.role = new_role

    if data.is_active is not None:
        # Prevent disabling the last active admin
        if not data.is_active and user.role == "ADMIN":
            active_admin_count = db.query(User).filter(User.role == "ADMIN", User.is_active == True).count()
            if active_admin_count <= 1:
                raise BusinessRuleException("Cannot deactivate the only active Admin account.")
        user.is_active = data.is_active

    if data.password is not None and data.password.strip():
        clean_pass = data.password.strip()
        if len(clean_pass) < 4:
            raise BusinessRuleException("Password must be at least 4 characters long.")
        user.password_hash = hash_password(clean_pass)

    db.commit()
    db.refresh(user)
    return user

def delete_user(db: Session, user_id: int) -> bool:
    user = get_user_by_id(db, user_id)

    if user.role == "ADMIN":
        admin_count = db.query(User).filter(User.role == "ADMIN").count()
        if admin_count <= 1:
            raise BusinessRuleException("Cannot delete the only Admin user on the system.")

    db.delete(user)
    db.commit()
    return True
