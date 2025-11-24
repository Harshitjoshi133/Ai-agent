# Voice AI Agent Backend

## Setup

1. Create virtual environment:
```bash
python -m venv venv
venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Create `.env` file and add your Gemini API key:
```
GEMINI_API_KEY=your_key_here
```

4. Run the server:
```bash
uvicorn main:app --reload
```

Server will run on http://localhost:8000
