"""Administrator-only user and registration-policy management endpoints."""

from typing import Literal

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.gateway.auth.models import User
from app.gateway.auth.password import hash_password_async
from app.gateway.deps import get_current_user_from_request, get_local_provider, require_admin_user
from app.gateway.routers.auth import _validate_strong_password

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


class AdminUserResponse(BaseModel):
    id: str
    email: str
    system_role: Literal["admin", "user"]
    is_active: bool
    needs_setup: bool
    created_at: str


class AdminUsersResponse(BaseModel):
    users: list[AdminUserResponse]
    public_registration_enabled: bool


class CreateManagedUserRequest(BaseModel):
    email: EmailStr
    temporary_password: str = Field(..., min_length=8)
    system_role: Literal["admin", "user"] = "user"

    _strong_password = field_validator("temporary_password")(
        classmethod(lambda cls, value: _validate_strong_password(value))
    )


class UpdateManagedUserRequest(BaseModel):
    system_role: Literal["admin", "user"] | None = None
    is_active: bool | None = None


class ResetManagedPasswordRequest(BaseModel):
    temporary_password: str = Field(..., min_length=8)

    _strong_password = field_validator("temporary_password")(
        classmethod(lambda cls, value: _validate_strong_password(value))
    )


class RegistrationPolicyRequest(BaseModel):
    public_registration_enabled: bool


class RegistrationPolicyResponse(BaseModel):
    public_registration_enabled: bool


def _serialize_user(user: User) -> AdminUserResponse:
    return AdminUserResponse(
        id=str(user.id),
        email=user.email,
        system_role=user.system_role,
        is_active=user.is_active,
        needs_setup=user.needs_setup,
        created_at=user.created_at.isoformat(),
    )


async def _require_admin(request: Request) -> User:
    await require_admin_user(request, detail="Administrator access is required")
    return await get_current_user_from_request(request)


@router.get("/users", response_model=AdminUsersResponse)
async def list_managed_users(request: Request):
    await _require_admin(request)
    provider = get_local_provider()
    users = await provider.list_users()
    registration_enabled = (await provider.get_setting("public_registration_enabled")) == "true"
    return AdminUsersResponse(
        users=[_serialize_user(user) for user in users],
        public_registration_enabled=registration_enabled,
    )


@router.post("/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
async def create_managed_user(request: Request, body: CreateManagedUserRequest):
    await _require_admin(request)
    provider = get_local_provider()
    try:
        user = await provider.create_user(
            email=body.email,
            password=body.temporary_password,
            system_role=body.system_role,
            needs_setup=True,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Email already registered") from exc
    return _serialize_user(user)


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
async def update_managed_user(user_id: str, request: Request, body: UpdateManagedUserRequest):
    current_user = await _require_admin(request)
    provider = get_local_provider()
    user = await provider.get_user(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    next_role = body.system_role if body.system_role is not None else user.system_role
    next_active = body.is_active if body.is_active is not None else user.is_active
    changes_identity = next_role != user.system_role or next_active != user.is_active

    if str(current_user.id) == user_id and (next_role != "admin" or not next_active):
        raise HTTPException(status_code=400, detail="You cannot demote or suspend your own administrator account")

    removes_active_admin = user.system_role == "admin" and user.is_active and (
        next_role != "admin" or not next_active
    )
    if removes_active_admin and await provider.count_active_admin_users() <= 1:
        raise HTTPException(status_code=400, detail="At least one active administrator is required")

    user.system_role = next_role
    user.is_active = next_active
    if changes_identity:
        user.token_version += 1
    await provider.update_user(user)
    return _serialize_user(user)


@router.post("/users/{user_id}/reset-password", response_model=AdminUserResponse)
async def reset_managed_password(user_id: str, request: Request, body: ResetManagedPasswordRequest):
    current_user = await _require_admin(request)
    if str(current_user.id) == user_id:
        raise HTTPException(status_code=400, detail="Change your own password from Account settings")

    provider = get_local_provider()
    user = await provider.get_user(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    user.password_hash = await hash_password_async(body.temporary_password)
    user.needs_setup = True
    user.token_version += 1
    await provider.update_user(user)
    return _serialize_user(user)


@router.put("/registration-policy", response_model=RegistrationPolicyResponse)
async def update_registration_policy(request: Request, body: RegistrationPolicyRequest):
    await _require_admin(request)
    await get_local_provider().set_setting(
        "public_registration_enabled",
        "true" if body.public_registration_enabled else "false",
    )
    # setup-status is public and cached per IP. Clear it so the login page
    # reflects the new registration policy immediately.
    from app.gateway.routers.auth import _SETUP_STATUS_CACHE

    _SETUP_STATUS_CACHE.clear()
    return RegistrationPolicyResponse(
        public_registration_enabled=body.public_registration_enabled,
    )
