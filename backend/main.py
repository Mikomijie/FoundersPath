from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import os
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

class StartupIdea(BaseModel):
    idea: str

class StartupAnalysis(BaseModel):
    idea: str
    answer1: str
    answer2: str
    answer3: str

QUESTIONS_PROMPT = """Generate exactly THREE smart questions for this startup idea. Return only the questions numbered 1, 2, 3."""

ANALYSIS_PROMPT = """Analyze this startup idea and provide:
HIDDEN ASSUMPTIONS:
1. [First]
2. [Second]
3. [Third]

DAY ONE ACTION:
[Action]

CONFIDENCE:
[Low/Medium/High]

REASONING:
[Explanation]"""

@app.post("/generate-questions")
async def generate_questions(startup: StartupIdea):
    api_key = os.getenv('OPENROUTER_API_KEY')
    
    if not api_key:
        return {"status": "error", "message": "API key not configured"}
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "openrouter/free",
        "messages": [
            {"role": "system", "content": QUESTIONS_PROMPT},
            {"role": "user", "content": f"Idea: {startup.idea}"}
        ],
        "temperature": 0.7,
        "max_tokens": 300
    }
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload
            )
            
            if response.status_code != 200:
                return {"status": "error", "message": f"API error: {response.status_code}", "details": response.text}
            
            result = response.json()
            
            if "error" in result:
                return {"status": "error", "message": result["error"]}
            
            if "choices" in result and len(result["choices"]) > 0:
                text = result["choices"][0]["message"]["content"]
                if text is None:
                    return {"status": "error", "message": "Empty response from AI", "full_response": str(result)}
                lines = [line.strip() for line in text.split('\n') if line.strip()]
                return {"status": "success", "questions": lines[:3]}
            
            return {"status": "error", "message": "Invalid response format", "response": str(result)}
    
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/analyze")
async def analyze_startup(startup: StartupAnalysis):
    api_key = os.getenv('OPENROUTER_API_KEY')
    
    if not api_key:
        return {"status": "error", "message": "API key not configured"}
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "openrouter/free",
        "messages": [
            {"role": "system", "content": ANALYSIS_PROMPT},
            {"role": "user", "content": f"Idea: {startup.idea}\nQ1: {startup.answer1}\nQ2: {startup.answer2}\nQ3: {startup.answer3}"}
        ],
        "temperature": 0.7,
        "max_tokens": 1000
    }
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload
            )
            
            if response.status_code != 200:
                return {"status": "error", "message": f"API error: {response.status_code}", "details": response.text}
            
            result = response.json()
            
            if "error" in result:
                return {"status": "error", "message": result["error"]}
            
            if "choices" in result and len(result["choices"]) > 0:
                analysis = result["choices"][0]["message"]["content"]
                if analysis is None:
                    return {"status": "error", "message": "Empty response from AI", "full_response": str(result)}
                return {"status": "success", "analysis": analysis}
            
            return {"status": "error", "message": "Invalid response format", "response": str(result)}
    
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/health")
async def health():
    return {"status": "Backend is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)