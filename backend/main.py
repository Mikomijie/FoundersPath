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

A student just typed their startup idea. Your job is to generate THREE smart follow-up questions that will help you understand the biggest risks and assumptions in THEIR SPECIFIC idea.

Do NOT ask generic questions. Ask questions specific to their idea and the Nigerian market.

Return ONLY three questions, one per line, numbered 1, 2, 3. No extra text.

Example:
If the idea is "A tutoring app", ask about cold-chain logistics? NO. Ask about their target student, how they will compete with WhatsApp groups, and their budget.

If the idea is "A food delivery startup", ask about supply chain, regulations, and customer acquisition costs specific to Nigeria.

Be specific to their idea and context."""

# System prompt for analysis
ANALYSIS_PROMPT = """You are a smart startup mentor for Nigerian university students with zero business experience and no access to real mentors.

Your job is NOT to give generic business advice. Your job is to help founders think more clearly by:
1. Identifying the 3 biggest hidden assumptions that could kill their idea BEFORE they waste time building
2. Suggesting ONE specific, cheap experiment they can run TODAY to test if the idea is worth pursuing

You must NEVER tell them their idea is good or bad. You only help them think.

When you respond, structure it EXACTLY like this:

HIDDEN ASSUMPTIONS:
1. [First assumption that could kill this idea - be specific to Nigerian market]
2. [Second assumption - what they don't know about their customers]
3. [Third assumption - operational or resource related]

DAY ONE ACTION:
[One specific, cheap action they can take TODAY with zero budget. Should take 30 minutes to 2 hours. Make it concrete. Example: "Call 5 students in your dorm today and ask them this exact question..."]

CONFIDENCE:
[One word: Low, Medium, or High - based on how much information they gave you]

REASONING:
[2-3 sentences explaining why these are the biggest risks and why this action matters]

Remember: These are Nigerian students. Suggest actions that work with limited money, limited time, and limited access to resources. Be specific to the Nigerian context."""

# Endpoint 1: Generate dynamic questions based on the specific idea
@app.post("/generate-questions")
async def generate_questions(startup: StartupIdea):
    """
    Takes user's startup idea and generates three custom follow-up questions
    """
    
    user_message = f"""My startup idea: {startup.idea}

Please generate three smart follow-up questions specific to this idea that will help you understand the biggest risks."""
    
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
        "max_tokens": 500
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload
            )
            
            result = response.json()
            
            if "choices" in result and len(result["choices"]) > 0:
                questions_text = result["choices"][0]["message"]["content"]
                
                # Parse the three questions
                lines = questions_text.strip().split('\n')
                questions = [q.strip() for q in lines if q.strip()]
                
                return {
                    "status": "success",
                    "questions": questions[:3]  # Return only first 3
                }
            else:
                return {
                    "status": "error",
                    "message": "Could not generate questions"
                }
    
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

# Endpoint 2: Analyze the idea with the three answers
@app.post("/analyze")
async def analyze_startup(startup: StartupAnalysis):
    """
    Takes user's startup idea and answers, sends to OpenRouter, returns analysis
    """
    
    user_message = f"""
    My startup idea: {startup.idea}
    
    Answer to question 1: {startup.answer1}
    Answer to question 2: {startup.answer2}
    Answer to question 3: {startup.answer3}
    
    Please analyze my idea and tell me the hidden assumptions, the day one action, and your confidence level.
    """
    
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
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload
            )
            
            result = response.json()
            
            if "choices" in result and len(result["choices"]) > 0:
                ai_response = result["choices"][0]["message"]["content"]
                return {
                    "status": "success",
                    "analysis": ai_response
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

# Health check endpoint
@app.get("/health")
async def health():
    return {"status": "Backend is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)