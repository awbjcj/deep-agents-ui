import uuid

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import Base, engine, get_db
from models import User
from auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user_id,
)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Deep Agents API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Schemas ---


class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    username: str


class TokensResponse(BaseModel):
    graph_api_token: str
    jira_api_token: str


class UpdateTokensRequest(BaseModel):
    graph_api_token: str | None = None
    jira_api_token: str | None = None


class UserProfileResponse(BaseModel):
    user_id: str
    username: str
    graph_api_token: str
    jira_api_token: str


# --- Auth Endpoints ---


@app.post("/api/auth/register", response_model=AuthResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if not req.username or not req.password:
        raise HTTPException(status_code=400, detail="Username and password are required")

    existing = db.query(User).filter(User.username == req.username).first()
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists")

    user = User(
        id=str(uuid.uuid4()),
        username=req.username,
        hashed_password=hash_password(req.password),
        graph_api_token="",
        jira_api_token="",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": user.id, "username": user.username})
    return AuthResponse(
        access_token=token,
        user_id=user.id,
        username=user.username,
    )


@app.post("/api/auth/login", response_model=AuthResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = create_access_token({"sub": user.id, "username": user.username})
    return AuthResponse(
        access_token=token,
        user_id=user.id,
        username=user.username,
    )


# --- User Profile / Token Management ---


@app.get("/api/user/profile", response_model=UserProfileResponse)
def get_profile(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserProfileResponse(
        user_id=user.id,
        username=user.username,
        graph_api_token=user.graph_api_token or "",
        jira_api_token=user.jira_api_token or "",
    )


@app.get("/api/user/tokens", response_model=TokensResponse)
def get_tokens(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return TokensResponse(
        graph_api_token=user.graph_api_token or "",
        jira_api_token=user.jira_api_token or "",
    )


@app.put("/api/user/tokens", response_model=TokensResponse)
def update_tokens(
    req: UpdateTokensRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if req.graph_api_token is not None:
        user.graph_api_token = req.graph_api_token
    if req.jira_api_token is not None:
        user.jira_api_token = req.jira_api_token

    db.commit()
    db.refresh(user)
    return TokensResponse(
        graph_api_token=user.graph_api_token or "",
        jira_api_token=user.jira_api_token or "",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=2024)
