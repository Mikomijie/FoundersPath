from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import httpx
import os
import re
import sqlite3
import hashlib
import hmac
import secrets
import uuid
from datetime import datetime
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions"
MODEL        = "llama-3.3-70b-versatile"

# ── Database ────────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id           TEXT PRIMARY KEY,
            email        TEXT UNIQUE NOT NULL,
            name         TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            salt         TEXT NOT NULL,
            created_at   TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token      TEXT PRIMARY KEY,
            user_id    TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS conversations (
            id         TEXT PRIMARY KEY,
            user_id    TEXT NOT NULL,
            idea       TEXT NOT NULL,
            analysis   TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    """)
    conn.commit()
    conn.close()

init_db()

# ── Auth helpers ────────────────────────────────────────────────
def hash_password(password: str, salt: str = None):
    if salt is None:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000)
    return key.hex(), salt

def verify_password(password: str, password_hash: str, salt: str) -> bool:
    computed, _ = hash_password(password, salt)
    return hmac.compare_digest(computed, password_hash)

def get_user_from_token(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:]
    conn  = get_db()
    row   = conn.execute(
        "SELECT u.* FROM users u JOIN sessions s ON u.id = s.user_id WHERE s.token = ?",
        (token,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None

def require_auth(authorization: Optional[str] = Header(None)):
    user = get_user_from_token(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user

# ── Pydantic models ─────────────────────────────────────────────
class StartupIdea(BaseModel):
    idea: str

class StartupAnalysis(BaseModel):
    idea: str
    answer1: str
    answer2: str
    answer3: str

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str

class LoginRequest(BaseModel):
    email: str
    password: str

class ConversationSave(BaseModel):
    id: str
    idea: str
    analysis: str
    created_at: str

# ── Groq call ───────────────────────────────────────────────────
async def call_groq(system_prompt: str, user_prompt: str, max_tokens: int = 700) -> str:
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        "max_tokens": max_tokens,
        "temperature": 0.65,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(GROQ_URL, headers=headers, json=payload)
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"].strip()

def extract_questions(text: str) -> list:
    """Robustly parse exactly 3 questions from varied model output."""
    lines = [l.strip() for l in text.split("\n") if l.strip()]

    # Match lines that start with a number or Q prefix: "1.", "1)", "Q1:", "(1)"
    numbered = []
    for line in lines:
        if re.match(r"^[\(\[]?[Qq]?[123][\.\)\]:]", line):
            cleaned = re.sub(r"^[\(\[]?[Qq]?[123][\.\)\]:]\s*", "", line).strip()
            if len(cleaned) > 15:
                numbered.append(cleaned)

    if len(numbered) >= 3:
        return numbered[:3]

    # Fallback: take the 3 longest substantive lines
    substantive = sorted(
        [l for l in lines if len(l) > 20 and not re.match(r"^(here|below|the following|these)", l, re.I)],
        key=len, reverse=True
    )
    return substantive[:3]

# ── Auth routes ─────────────────────────────────────────────────
@app.post("/auth/register")
async def register(req: RegisterRequest):
    if "@" not in req.email or "." not in req.email:
        raise HTTPException(400, "Invalid email address.")
    if len(req.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters.")
    if len(req.name.strip()) < 3:
        raise HTTPException(400, "Name must be at least 3 characters.")

    password_hash, salt = hash_password(req.password)
    user_id = str(uuid.uuid4())

    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO users (id, email, name, password_hash, salt, created_at) VALUES (?,?,?,?,?,?)",
            (user_id, req.email.lower().strip(), req.name.strip(), password_hash, salt, datetime.utcnow().isoformat()),
        )
        token = secrets.token_hex(32)
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)",
            (token, user_id, datetime.utcnow().isoformat()),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(409, "An account with this email already exists.")
    conn.close()

    return {"token": token, "user": {"id": user_id, "email": req.email.lower().strip(), "name": req.name.strip()}}

@app.post("/auth/login")
async def login(req: LoginRequest):
    conn = get_db()
    row  = conn.execute("SELECT * FROM users WHERE email = ?", (req.email.lower().strip(),)).fetchone()
    conn.close()

    if not row or not verify_password(req.password, row["password_hash"], row["salt"]):
        raise HTTPException(401, "Incorrect email or password.")

    token = secrets.token_hex(32)
    conn  = get_db()
    conn.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)",
        (token, row["id"], datetime.utcnow().isoformat()),
    )
    conn.commit()
    conn.close()

    return {"token": token, "user": {"id": row["id"], "email": row["email"], "name": row["name"]}}

@app.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
        conn  = get_db()
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()
        conn.close()
    return {"status": "ok"}

@app.get("/auth/me")
async def me(user=Depends(require_auth)):
    return {"user": {"id": user["id"], "email": user["email"], "name": user["name"]}}

# ── Conversation routes ─────────────────────────────────────────
@app.get("/conversations")
async def list_conversations(user=Depends(require_auth)):
    conn = get_db()
    rows = conn.execute(
        "SELECT id, idea, analysis, created_at FROM conversations WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
        (user["id"],),
    ).fetchall()
    conn.close()
    return {"conversations": [dict(r) for r in rows]}

@app.post("/conversations")
async def save_conversation(conv: ConversationSave, user=Depends(require_auth)):
    conn = get_db()
    conn.execute(
        "INSERT OR REPLACE INTO conversations (id, user_id, idea, analysis, created_at) VALUES (?,?,?,?,?)",
        (conv.id, user["id"], conv.idea, conv.analysis, conv.created_at),
    )
    conn.commit()
    conn.close()
    return {"status": "ok"}

@app.delete("/conversations/{conv_id}")
async def delete_conversation(conv_id: str, user=Depends(require_auth)):
    conn = get_db()
    conn.execute("DELETE FROM conversations WHERE id = ? AND user_id = ?", (conv_id, user["id"]))
    conn.commit()
    conn.close()
    return {"status": "ok"}

# ── AI routes ───────────────────────────────────────────────────
@app.post("/generate-questions")
async def generate_questions(startup: StartupIdea):
    system_prompt = (
        "You are a startup advisor. Output ONLY 3 numbered questions that challenge the founder's "
        "core assumptions. Format: '1. [question]' on its own line. No intro text, no extra commentary."
    )
    user_prompt = f"Startup idea: {startup.idea}"

    try:
        text      = await call_groq(system_prompt, user_prompt)
        questions = extract_questions(text)

        if len(questions) < 3:
            retry = await call_groq(
                "Output exactly 3 critical startup validation questions, numbered 1. 2. 3. Nothing else.",
                f"Startup: {startup.idea}",
            )
            questions = extract_questions(retry)

        if len(questions) < 3:
            return {"status": "error", "message": "Could not generate questions. Please try rephrasing your idea."}

        return {"status": "success", "questions": questions}

    except httpx.HTTPStatusError as e:
        return {"status": "error", "message": f"AI service error ({e.response.status_code}). Try again."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/analyze")
async def analyze_startup(startup: StartupAnalysis):
    system_prompt = """You are a startup critic. Analyze the startup idea and respond in this exact format:

HIDDEN ASSUMPTIONS:
1. [assumption]
2. [assumption]
3. [assumption]

DAY ONE ACTION:
[one concrete action the founder can take today]

CONFIDENCE:
[Low/Medium/High]

REASONING:
[2-3 sentence explanation]"""

    user_prompt = (
        f"Idea: {startup.idea}\n"
        f"Q1 Answer: {startup.answer1}\n"
        f"Q2 Answer: {startup.answer2}\n"
        f"Q3 Answer: {startup.answer3}"
    )

    try:
        analysis = await call_groq(system_prompt, user_prompt, max_tokens=900)
        return {"status": "success", "analysis": analysis}
    except httpx.HTTPStatusError as e:
        return {"status": "error", "message": f"AI service error ({e.response.status_code}). Try again."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/health")
async def health():
    return {"status": "ok", "model": MODEL}

# ── Static files ────────────────────────────────────────────────
# NOTE: Using a catch-all GET route instead of app.mount("/", StaticFiles(...))
# because StaticFiles intercepts ALL HTTP methods (including POST) and returns
# 405 Method Not Allowed for non-GET requests, which breaks the auth API routes.
PARENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

@app.get("/{file_path:path}")
async def serve_static(file_path: str):
    if not file_path:
        return FileResponse(os.path.join(PARENT_DIR, "index.html"))
    safe = os.path.normpath(os.path.join(PARENT_DIR, file_path))
    # Guard against path traversal
    if os.path.commonpath([safe, PARENT_DIR]) == PARENT_DIR and os.path.isfile(safe):
        return FileResponse(safe)
    return FileResponse(os.path.join(PARENT_DIR, "index.html"))

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
