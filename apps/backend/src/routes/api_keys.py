"""
API keys.

A browser holds a session token that expires in half an hour. Tooling — the
MCP server, a CI job, a script — needs something longer lived that can be
revoked on its own. A key belongs to a person, so anything done with it is
attributed to them: project roles apply unchanged and the audit trail still
says who.

Only the hash is stored. The key itself is shown once, when it is created.
"""
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..middleware.auth import generate_api_key, verify_token
from ..models.database import get_db
from ..models.models import ApiKey, User

logger = logging.getLogger(__name__)
router = APIRouter()


class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100,
                      description="What this key is for, so it can be revoked "
                                  "without guessing")


def _serialise(row: ApiKey) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "prefix": row.prefix,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "last_used_at": row.last_used_at.isoformat() if row.last_used_at else None,
        "revoked_at": row.revoked_at.isoformat() if row.revoked_at else None,
        "active": row.revoked_at is None,
    }


async def _caller(db: AsyncSession, current_user: dict) -> User:
    user_id = current_user.get("user_id")
    query = (select(User).where(User.id == user_id) if user_id is not None
             else select(User).where(User.username == current_user.get("username")))
    user = (await db.execute(query)).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


@router.get("/api-keys")
async def list_keys(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(verify_token),
):
    """This account's keys. The keys themselves are not recoverable."""
    user = await _caller(db, current_user)
    rows = (await db.execute(
        select(ApiKey).where(ApiKey.user_id == user.id)
        .order_by(ApiKey.id.desc()))).scalars().all()
    return {"keys": [_serialise(row) for row in rows]}


@router.post("/api-keys", status_code=201)
async def create_key(
    payload: ApiKeyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(verify_token),
):
    """Mint a key. The response is the only time the key is readable."""
    user = await _caller(db, current_user)

    # A key made with a key would let one credential quietly reproduce itself.
    if current_user.get("via") == "api_key":
        raise HTTPException(
            status_code=403,
            detail="Sign in to create an API key; an existing key cannot mint another")

    raw, prefix, key_hash = generate_api_key()
    row = ApiKey(user_id=user.id, name=payload.name, prefix=prefix, key_hash=key_hash)
    db.add(row)
    await db.commit()
    await db.refresh(row)

    return {
        **_serialise(row),
        "key": raw,
        "note": "Copy this now. It is stored hashed and cannot be shown again.",
    }


@router.delete("/api-keys/{key_id}", status_code=204)
async def revoke_key(
    key_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(verify_token),
):
    """Revoke a key. Kept as a row so its last use stays on the record."""
    user = await _caller(db, current_user)
    row = (await db.execute(
        select(ApiKey).where(ApiKey.id == key_id,
                             ApiKey.user_id == user.id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="API key not found")
    if row.revoked_at is None:
        row.revoked_at = datetime.utcnow()
        db.add(row)
        await db.commit()
