from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Enable CORS so Vue frontend can call this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define request structures
class StartupIdea(BaseModel):
    idea: str

class StartupAnalysis(BaseModel):
    idea: str
    answer1: str
    answer2: str
    answer3: str

# System prompt for generating dynamic questions
QUESTIONS_PROMPT = """You are a smart startup mentor for Nigerian university students.

A student typed a startup idea. Generate exactly THREE smart follow-up questions specific to THEIR idea and the Nigerian market context.

Return ONLY the three questions, numbered 1, 2, 3. One question per line. No extra text, no explanations.

Example format:
1. Who exactly would pay for this and why would they choose you over existing solutions?
2. What is the one biggest assumption you are making that could be completely wrong?
3. What stops you from testing this idea this week with zero money?"""

# System prompt for analysis
ANALYSIS_PROMPT = """You are a smart startup mentor for Nigerian university students with zero business experience and no access to real mentors.

Your job is to help founders think clearly by:
1. Identifying the 3 biggest hidden assumptions that could kill their idea
2. Suggesting ONE specific, cheap experiment to test TODAY

You must NEVER tell them their idea is good or bad.

Structure your response EXACTLY like this:

HIDDEN ASSUMPTIONS:
1. [First assumption specific to Nigerian market]
2. [Second assumption about their understanding]
3. [Third assumption - operational or resource]

DAY ONE ACTION:
[One specific action taking 30 mins to 2 hours, zero budget, concrete example]

CONFIDENCE:
[Low, Medium, or High]

REASONING:
[2-3 sentences explaining why these risks matter]"""

# Endpoint 1: Generate dynamic questions
@app.post("/generate-questions")
async def generate_questions(startup: StartupIdea):
    """Generate three custom questions based on the startup idea"""
    
    user_message = f"My startup idea: {startup.idea}\n\nGenerate three smart follow-up questions."
    
    headers = {
        "Authorization": f"Bearer {os.getenv('OPENROUTER_API_KEY')}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "meta-llama/llama-3-8b-instruct:free",
        "messages": [
            {"role": "system", "content": QUESTIONS_PROMPT},
            {"role": "user", "content": user_message}
        ],
        "temperature": 0.7,
        "max_tokens": 300
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload
            )
            
            result = response.json()
            
            if "choices" in result and len(result["choices"]) > 0:
                text = result["choices"][0]["message"]["content"]
                # Split by newlines and filter empty lines
                lines = [line.strip() for line in text.split('\n') if line.strip()]
                # Take first 3 lines that look like questions
                questions = [q for q in lines if '?' in q][:3]
                
                if len(questions) >= 3:
                    return {
                        "status": "success",
                        "questions": questions[:3]
                    }
                else:
                    return {
                        "status": "success",
                        "questions": lines[:3]
                    }
            else:
                return {
                    "status": "error",
                    "message": "No response from AI"
                }
    
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

# Endpoint 2: Analyze the idea
@app.post("/analyze")
async def analyze_startup(startup: StartupAnalysis):
    """Analyze startup idea with user answers"""
    
    user_message = f"""My startup idea: {startup.idea}

Answer to question 1: {startup.answer1}
Answer to question 2: {startup.answer2}
Answer to question 3: {startup.answer3}

Please analyze and provide hidden assumptions, day one action, and confidence level."""
    
    headers = {
        "Authorization": f"Bearer {os.getenv('OPENROUTER_API_KEY')}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "meta-llama/llama-3-8b-instruct:free",
        "messages": [
            {"role": "system", "content": ANALYSIS_PROMPT},
            {"role": "user", "content": user_message}
        ],
        "temperature": 0.7,
        "max_tokens": 1000
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload
            )
            
            result = response.json()
            
            if "choices" in result and len(result["choices"]) > 0:
                analysis = result["choices"][0]["message"]["content"]
                return {
                    "status": "success",
                    "analysis": analysis
                }
            else:
                return {
                    "status": "error",
                    "message": "No response from AI"
                }
    
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

@app.get("/health")
async def health():
    return {"status": "Backend is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)