'use client';

import { useState, useRef, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:8000';

interface Message {
  type: 'user' | 'ai';
  text: string;
  audio?: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState('');
  const [playingAudio, setPlayingAudio] = useState<number | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const finalTranscriptRef = useRef<string>('');
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const shouldRestartRef = useRef<boolean>(true);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const sendTextMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage = inputText;
    setInputText('');
    setError('');
    setMessages(prev => [...prev, { type: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const response = await axios.post(`${API_URL}/chat/text`, {
        message: userMessage
      });

      const aiText = response.data.response;
      
      // Add message without audio first
      setMessages(prev => [...prev, { 
        type: 'ai', 
        text: aiText
      }]);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  const playAudio = async (text: string, messageIndex: number) => {
    try {
      setPlayingAudio(messageIndex);
      
      const audioResponse = await axios.post(`${API_URL}/tts`,
        { message: text },
        { responseType: 'blob' }
      );
      
      const audioUrl = URL.createObjectURL(audioResponse.data);
      const audio = new Audio(audioUrl);
      
      audio.onended = () => {
        setPlayingAudio(null);
      };
      
      audio.onerror = () => {
        setPlayingAudio(null);
        setError('Failed to play audio');
      };
      
      await audio.play();
    } catch (err: any) {
      setPlayingAudio(null);
      setError('Failed to generate audio');
    }
  };

  const startRecording = async () => {
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        setError('Speech recognition not supported. Please use Chrome or Edge browser.');
        return;
      }

      // Stop any existing recognition
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.log('No active recognition to stop');
        }
      }

      // Clear any existing timer
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognitionRef.current = recognition;
      finalTranscriptRef.current = '';

      recognition.onstart = () => {
        console.log('Speech recognition started');
        setIsRecording(true);
        setIsListening(true);
        setError('');
        setTranscript('');
        finalTranscriptRef.current = '';
        shouldRestartRef.current = true; // Allow restart by default
      };

      recognition.onresult = (event: any) => {
        console.log('Speech recognition result received');
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscriptRef.current += transcript + ' ';
            console.log('Final transcript:', transcript);
          } else {
            interimTranscript += transcript;
          }
        }

        const displayText = (finalTranscriptRef.current + interimTranscript).trim();
        setTranscript(displayText);

        // Reset silence timer - stop after 2 seconds of silence
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }
        
        silenceTimerRef.current = setTimeout(() => {
          console.log('Silence detected, stopping...');
          if (finalTranscriptRef.current.trim()) {
            recognition.stop();
          }
        }, 2000);
      };

      recognition.onerror = (event: any) => {
        console.log('Speech recognition error:', event.error);
        
        // Network errors are common and non-critical - just ignore them completely
        if (event.error === 'network') {
          console.log('Network error ignored - continuing...');
          return; // Don't stop or change state
        }
        
        // For aborted errors, just log and continue
        if (event.error === 'aborted') {
          console.log('Recognition aborted - this is normal');
          return;
        }
        
        // Only handle critical errors
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        
        setIsRecording(false);
        setIsListening(false);
        
        if (event.error === 'no-speech') {
          setError('No speech detected. Please try again.');
        } else if (event.error === 'not-allowed') {
          setError('Microphone access denied. Please allow microphone access.');
        } else {
          setError(`Speech recognition error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        console.log('Speech recognition ended');
        console.log('Has final transcript:', finalTranscriptRef.current);
        console.log('Should restart:', shouldRestartRef.current);
        
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        
        const finalText = finalTranscriptRef.current.trim();
        console.log('Final text to send:', finalText);
        
        // If we have no text and we're still supposed to be recording AND restart is allowed, restart
        if (!finalText && isRecording && shouldRestartRef.current) {
          console.log('No text captured, but still recording - restarting...');
          try {
            recognition.start();
            return; // Don't change state, keep listening
          } catch (e) {
            console.error('Failed to restart:', e);
          }
        }
        
        // Update state
        setIsRecording(false);
        setIsListening(false);
        
        if (finalText) {
          sendVoiceMessage(finalText);
        } else {
          setError('No speech detected. Please speak clearly after clicking the mic.');
        }
      };

      console.log('Starting speech recognition...');
      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setError('Failed to start speech recognition. Please check microphone permissions.');
      setIsRecording(false);
      setIsListening(false);
    }
  };

  const stopRecording = () => {
    console.log('Manual stop requested');
    shouldRestartRef.current = false; // Prevent auto-restart
    
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.error('Error stopping recognition:', e);
      }
    }
    
    // Immediately update UI
    setIsRecording(false);
    setIsListening(false);
  };

  const sendVoiceMessage = async (voiceText: string) => {
    if (!voiceText) return;
    
    setIsLoading(true);
    setMessages(prev => [...prev, { type: 'user', text: voiceText }]);
    
    try {
      const response = await axios.post(`${API_URL}/chat/text`, {
        message: voiceText
      });

      const aiText = response.data.response;
      const messageIndex = messages.length + 1;
      
      // Add message without audio
      setMessages(prev => [...prev, { 
        type: 'ai', 
        text: aiText
      }]);
      
      // Auto-play audio for voice messages
      setTimeout(() => playAudio(aiText, messageIndex), 100);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to process voice message');
    } finally {
      setIsLoading(false);
      setTranscript('');
    }
  };

  return (
    <div className="container">
      <div className="header">
        <h1>🎙️ Voice AI Agent</h1>
        <p>Chat with AI using voice or text</p>
      </div>

      {error && <div className="error">{error}</div>}

      {isListening && (
        <div className="listening-indicator">
          <div className="pulse-ring"></div>
          <div className="listening-text">
            🎤 Listening... Speak now!
            {transcript && <span className="transcript-preview">"{transcript}"</span>}
          </div>
          <p style={{ fontSize: '0.85rem', marginTop: '8px', opacity: 0.9 }}>
            Click ⏹️ to stop or wait 2 seconds after speaking
          </p>
        </div>
      )}

      <div className="chat-container" ref={chatContainerRef}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#999', marginTop: '100px' }}>
            <p>Start a conversation by typing or using voice</p>
            {/* <p style={{ fontSize: '0.9rem', marginTop: '10px' }}>
              Click the 🎤 button and speak clearly
            </p> */}
          </div>
        )}
        
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.type}`}>
            <div className="message-label">
              {msg.type === 'user' ? 'You' : 'AI Assistant'}
            </div>
            <div className="message-bubble">
              {msg.text}
              {msg.type === 'ai' && (
                <button
                  className="btn-play-audio"
                  onClick={() => playAudio(msg.text, idx)}
                  disabled={playingAudio === idx}
                  title="Play audio"
                >
                  {playingAudio === idx ? '🔊' : '🔉'}
                </button>
              )}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="message ai">
            <div className="message-label">AI Assistant</div>
            <div className="message-bubble">
              <div className="loading">
                <div className="loading-dot"></div>
                <div className="loading-dot"></div>
                <div className="loading-dot"></div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="input-container">
        <input
          type="text"
          className="text-input"
          placeholder={isRecording ? "Listening..." : "Type your message..."}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendTextMessage()}
          disabled={isLoading || isRecording}
        />
        
        <button
          className="btn btn-primary"
          onClick={sendTextMessage}
          disabled={isLoading || isRecording || !inputText.trim()}
        >
          Send
        </button>
        
        {/* <button
          className={`btn btn-voice ${isRecording ? 'recording' : ''}`}
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isLoading}
          title={isRecording ? "Click to stop" : "Click to speak"}
        >
          {isRecording ? '⏹️' : '🎤'}
        </button> */}
      </div>
    </div>
  );
}
