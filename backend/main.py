from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import httpx
import os
from dotenv import load_dotenv
import urllib.parse

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
    prompt = f"Idea: {startup.idea}"
    encoded_prompt = urllib.parse.quote(prompt)
    encoded_system = urllib.parse.quote(QUESTIONS_PROMPT)
    url = f"https://text.pollinations.ai/{encoded_prompt}?system={encoded_system}"
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(url)
            
            if response.status_code != 200:
                return {"status": "error", "message": f"API error: {response.status_code}", "details": response.text}
            
            text = response.text
            if not text:
                return {"status": "error", "message": "Empty response from AI"}
            
            for marker in ["**Support Pollinations.AI:**", "Support Pollinations.AI"]:
                if marker in text:
                    text = text.split(marker)[0].strip()
            
            text_lines = text.split("\n")
            while text_lines and text_lines[-1].strip() in ["", "---", "___", "***"]:
                text_lines.pop()
            text = "\n".join(text_lines).strip()
                
            lines = [line.strip() for line in text.split('\n') if line.strip()]
            return {"status": "success", "questions": lines[:3]}
    
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/analyze")
async def analyze_startup(startup: StartupAnalysis):
    prompt = f"Idea: {startup.idea}\nQ1: {startup.answer1}\nQ2: {startup.answer2}\nQ3: {startup.answer3}"
    encoded_prompt = urllib.parse.quote(prompt)
    encoded_system = urllib.parse.quote(ANALYSIS_PROMPT)
    url = f"https://text.pollinations.ai/{encoded_prompt}?system={encoded_system}"
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(url)
            
            if response.status_code != 200:
                return {"status": "error", "message": f"API error: {response.status_code}", "details": response.text}
            
            analysis = response.text
            if not analysis:
                return {"status": "error", "message": "Empty response from AI"}
            
            for marker in ["**Support Pollinations.AI:**", "Support Pollinations.AI"]:
                if marker in analysis:
                    analysis = analysis.split(marker)[0].strip()
            
            analysis_lines = analysis.split("\n")
            while analysis_lines and analysis_lines[-1].strip() in ["", "---", "___", "***"]:
                analysis_lines.pop()
            analysis = "\n".join(analysis_lines).strip()
                
            return {"status": "success", "analysis": analysis}
    
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/health")
async def health():
    return {"status": "Backend is running"}

PARENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(PARENT_DIR, "index.html"))

app.mount("/", StaticFiles(directory=PARENT_DIR), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)