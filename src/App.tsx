import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Send, MessageSquare, Volume2, Loader2, VolumeX, Play } from 'lucide-react';
import axios from 'axios';

// Use environment variable with fallback
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://3.92.137.224:8000';
// const API_URL = window.location.protocol === 'https:' ? 'https://3.92.137.224:8000' : 'http://3.92.137.224:8000';

type Message = {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  audio?: string;
};

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [mode, setMode] = useState<'voice' | 'text'>('text');

  // Scroll to bottom on new messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Check API connection on mount
  useEffect(() => {
    const checkAPI = async () => {
      try {
        await axios.get(`${API_URL}/health`);
        setError(null);
      } catch (err) {
        setError('Unable to connect to AI service. Please try again later.');
        console.error('API Connection Error:', err);
      }
    };
    checkAPI();
  }, []);

  const playAudio = (audioBase64: string, messageId: string) => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }

      const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
      audioRef.current = audio;
      setIsPlaying(messageId);

      audio.play().catch(console.error);
      audio.onended = () => setIsPlaying(null);
    } catch (err) {
      console.error('Audio playback error:', err);
      setError('Error playing audio. Please try again.');
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;
    setError(null);

    const newMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, newMessage]);
    setInputText('');
    setIsProcessing(true);

    try {
      const response = await axios.post(`${API_URL}/api/chat`, {
        text: inputText
      }, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000 // 30 second timeout
      });

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response.data.response,
        isUser: false,
        timestamp: new Date(),
        audio: response.data.audio
      };
      
      setMessages(prev => [...prev, botMessage]);
      
      if (botMessage.audio) {
        playAudio(botMessage.audio, botMessage.id);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setError('Unable to get response from AI. Please try again.');
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: "I'm having trouble connecting to the server. Please check your connection and try again.",
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleRecording = async () => {
    setError(null);
    
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm'
        });
        const audioChunks: BlobPart[] = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunks.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          setIsProcessing(true);

          try {
            const userMessage: Message = {
              id: Date.now().toString(),
              text: '🎤 Voice message...',
              isUser: true,
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMessage]);

            const formData = new FormData();
            formData.append('audio', audioBlob, 'audio.webm');
            
            const response = await axios.post(`${API_URL}/api/transcribe`, formData, {
              headers: {
                'Content-Type': 'multipart/form-data',
              },
              timeout: 30000 // 30 second timeout
            });

            setMessages(prev => prev.map(msg => 
              msg.id === userMessage.id 
                ? { ...msg, text: response.data.text || 'Voice message processed' }
                : msg
            ));

            const botMessage: Message = {
              id: Date.now().toString(),
              text: response.data.response,
              isUser: false,
              timestamp: new Date(),
              audio: response.data.audio
            };
            
            setMessages(prev => [...prev, botMessage]);

            if (botMessage.audio) {
              playAudio(botMessage.audio, botMessage.id);
            }
          } catch (error) {
            console.error('Error processing voice:', error);
            setError('Error processing voice message. Please try again.');
            
            const errorMessage: Message = {
              id: Date.now().toString(),
              text: "I'm having trouble processing your voice message. Please try again.",
              isUser: false,
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMessage]);
          } finally {
            setIsProcessing(false);
          }
        };

        mediaRecorder.start(200);
        setIsRecording(true);

        // Auto-stop after 5 seconds
        setTimeout(() => {
          if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            stream.getTracks().forEach(track => track.stop());
            setIsRecording(false);
          }
        }, 5000);
      } catch (error) {
        console.error('Error accessing microphone:', error);
        setError('Unable to access microphone. Please check your permissions.');
        setIsRecording(false);
      }
    } else {
      setIsRecording(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
      <div className="container mx-auto max-w-4xl h-screen p-4 flex flex-col">
        {/* Header */}
        <div className="text-center mb-4 relative">
          <div className="absolute left-1/2 -translate-x-1/2 top-0 bg-gray-700 rounded-full p-1 shadow-lg">
            <div className="flex items-center">
              <button
                onClick={() => setMode('text')}
                className={`px-4 py-2 rounded-full flex items-center gap-2 transition-all duration-300 ${
                  mode === 'text'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                <MessageSquare className="w-5 h-5" />
                <span>Chat</span>
              </button>
              <button
                onClick={() => setMode('voice')}
                className={`px-4 py-2 rounded-full flex items-center gap-2 transition-all duration-300 ${
                  mode === 'voice'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                <Volume2 className="w-5 h-5" />
                <span>Voice</span>
              </button>
            </div>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent mt-16">
            AI Assistant
          </h1>
          <p className="text-gray-400">
            {mode === 'voice' ? 'Voice Interface' : 'Chat Interface'}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-500 text-white p-3 rounded-lg mb-4 text-center">
            {error}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto bg-gray-800 rounded-lg p-4 mb-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.isUser ? 'justify-end' : 'justify-start'} mb-4`}
            >
              <div
                className={`max-w-[80%] p-3 rounded-lg ${
                  message.isUser
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-100'
                }`}
              >
                <div className="flex justify-between items-start gap-2">
                  <p className="break-words">{message.text}</p>
                  {!message.isUser && message.audio && (
                    <button
                      onClick={() => playAudio(message.audio!, message.id)}
                      className="p-1 hover:bg-gray-600 rounded-full transition-colors"
                    >
                      {isPlaying === message.id ? (
                        <VolumeX className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
                <span className="text-xs opacity-50">
                  {message.timestamp.toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
          {isProcessing && (
            <div className="flex justify-start mb-4">
              <div className="bg-gray-700 p-3 rounded-lg flex items-center">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                <span>Processing...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2">
            {mode === 'text' ? (
              <>
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Type your message..."
                  className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isProcessing}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={isProcessing || !inputText.trim()}
                  className="p-2 bg-blue-600 rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  <Send className="w-6 h-6" />
                </button>
              </>
            ) : (
              <button
                onClick={toggleRecording}
                disabled={isProcessing}
                className={`flex-1 p-4 ${
                  isRecording ? 'bg-red-600' : 'bg-blue-600'
                } rounded-lg hover:opacity-90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50`}
              >
                {isRecording ? (
                  <>
                    <MicOff className="w-6 h-6" />
                    <span>Stop Recording</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-6 h-6" />
                    <span>Start Recording</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
