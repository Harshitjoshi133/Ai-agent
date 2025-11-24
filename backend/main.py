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
import tiktoken

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

app = FastAPI()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://ai-agent-five-sooty.vercel.app"],
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

# Token configuration
MAX_OUTPUT_TOKENS = 150  # Shorter responses
SAFETY_MARGIN = 10  # Buffer for response truncation

# Initialize tokenizer for counting
try:
    encoding = tiktoken.encoding_for_model("gpt-3.5-turbo")
except Exception:
    encoding = tiktoken.get_encoding("cl100k_base")

def count_tokens(text: str) -> int:
    """Count tokens in text using tiktoken"""
    try:
        tokens = encoding.encode(text)
        return len(tokens)
    except Exception as e:
        logger.warning(f"Token counting error: {e}, using char estimate")
        return len(text) // 4  # Rough estimate: ~4 chars per token

def truncate_to_max_tokens(text: str, max_tokens: int) -> tuple[str, int]:
    """Truncate text to max tokens and return truncated text with token count"""
    tokens = encoding.encode(text)
    
    if len(tokens) <= max_tokens:
        return text, len(tokens)
    
    # Truncate to max tokens
    truncated_tokens = tokens[:max_tokens]
    truncated_text = encoding.decode(truncated_tokens)
    
    # Add ellipsis if truncated
    if truncated_text:
        truncated_text = truncated_text.rstrip() + "..."
    
    return truncated_text, max_tokens

class TextMessage(BaseModel):
    message: str

class ChatResponse(BaseModel):
    response: str
    tokens_used: int
    max_tokens: int
    truncated: bool

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
    """Handle text-based chat with token limiting"""
    logger.info(f"Received text message: {data.message[:50]}...")
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=data.message
        )
        
        ai_response = response.text
        
        # Truncate response to max tokens
        truncated_response, tokens_used = truncate_to_max_tokens(ai_response, MAX_OUTPUT_TOKENS)
        was_truncated = len(response.text) != len(truncated_response)
        
        logger.info(f"AI response generated with {tokens_used} tokens (truncated: {was_truncated})")
        
        return {
            "response": truncated_response,
            "tokens_used": tokens_used,
            "max_tokens": MAX_OUTPUT_TOKENS,
            "truncated": was_truncated
        }
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
