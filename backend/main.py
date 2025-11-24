from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from google import genai
from google.genai import types
import os
from gtts import gTTS
from io import BytesIO
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('voice_ai_agent.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

app = FastAPI()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
if not GEMINI_API_KEY:
    logger.warning("GEMINI_API_KEY not set in environment variables")
else:
    logger.info("Gemini API key loaded successfully")

client = genai.Client(api_key=GEMINI_API_KEY)

class TextMessage(BaseModel):
    message: str

@app.on_event("startup")
async def startup_event():
    logger.info("Voice AI Agent API starting up...")
    logger.info(f"Server started at {datetime.now()}")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Voice AI Agent API shutting down...")

@app.get("/")
def read_root():
    logger.info("Health check endpoint called")
    return {"status": "Voice AI Agent API is running"}

@app.post("/chat/text")
async def chat_text(data: TextMessage):
    """Handle text-based chat"""
    logger.info(f"Received text message: {data.message[:50]}...")
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=data.message
        )
        
        ai_response = response.text
        logger.info(f"AI response generated: {ai_response[:50]}...")
        
        return {"response": ai_response}
    except Exception as e:
        logger.error(f"Error in chat_text: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/tts")
async def text_to_speech(data: TextMessage):
    """Convert text to speech using gTTS (free)"""
    logger.info(f"TTS request for text: {data.message[:50]}...")
    
    try:
        tts = gTTS(text=data.message, lang='en', slow=False)
        audio_buffer = BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)
        
        logger.info("TTS audio generated successfully")
        return StreamingResponse(audio_buffer, media_type="audio/mpeg")
    except Exception as e:
        logger.error(f"Error in text_to_speech: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
