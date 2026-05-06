'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '../supabase';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  id: string;
};

type ChatStatus = 'idle' | 'sending' | 'error';

const SUGGESTED_QUESTIONS = [
  'What is a deductible?',
  'Should I pick the HDHP or the PPO?',
  'How does an HSA work?',
  'What does my plan cover?',
];

export default function Chatbot() {
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Check auth on mount + listen for auth changes
  useEffect(() => {
    let mounted = true;

    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted) return;
      setUser(user);
      setAuthChecked(true);
    }
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user || null);
      // Close chat if user logs out
      if (!session?.user) {
        setOpen(false);
        setMessages([]);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, status]);

  // Auto-focus textarea when panel opens
  useEffect(() => {
    if (open && inputRef.current) {
      // Small delay so the focus happens after the panel animation
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!user || !text.trim() || status === 'sending') return;

      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: text.trim(),
      };

      const newMessages = [...messages, userMsg];
      setMessages(newMessages);
      setInput('');
      setStatus('sending');
      setErrorMsg('');

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.id,
            messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
            current_page: pathname,
          }),
        });

        if (!res.ok) {
          let msg = 'The assistant ran into a problem.';
          try {
            const err = await res.json();
            if (err?.error) msg = err.error;
          } catch {
            // body not JSON
          }
          setErrorMsg(msg);
          setStatus('error');
          return;
        }

        const data = await res.json();
        if (!data?.success || typeof data?.reply !== 'string') {
          setErrorMsg('The assistant returned an unexpected response.');
          setStatus('error');
          return;
        }

        const replyMsg: Message = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: data.reply,
        };
        setMessages([...newMessages, replyMsg]);
        setStatus('idle');
      } catch (e: any) {
        setErrorMsg(`Network error: ${e.message}`);
        setStatus('error');
      }
    },
    [messages, status, user, pathname]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (input.trim()) sendMessage(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim()) sendMessage(input);
    }
  }

  function handleSuggestedClick(q: string) {
    sendMessage(q);
  }

  function handleClearChat() {
    if (status === 'sending') return;
    if (messages.length === 0) return;
    if (!confirm('Clear this conversation?')) return;
    setMessages([]);
    setErrorMsg('');
    setStatus('idle');
  }

  // Don't render anything until auth check finishes
  if (!authChecked) return null;
  // Only render for authenticated users
  if (!user) return null;

  return (
    <>
      {/* Floating button (always visible when logged in) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open AI Assistant"
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            right: '1.5rem',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: '#1e3a5f',
            color: '#fff',
            border: 'none',
            boxShadow: '0 4px 12px rgba(30, 58, 95, 0.25)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem',
            zIndex: 9998,
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(30, 58, 95, 0.35)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(30, 58, 95, 0.25)';
          }}
        >
          💬
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            right: '1.5rem',
            width: '380px',
            maxWidth: 'calc(100vw - 2rem)',
            height: '600px',
            maxHeight: 'calc(100vh - 3rem)',
            backgroundColor: '#fff',
            borderRadius: '12px',
            boxShadow: '0 10px 40px rgba(30, 58, 95, 0.25)',
            border: '1px solid #eef1f4',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 9999,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              backgroundColor: '#1e3a5f',
              color: '#fff',
              padding: '0.85rem 1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: '#7a9b76',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem',
                }}
              >
                💬
              </div>
              <div>
                <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.1 }}>
                  AI Assistant
                </div>
                <div style={{ fontSize: '0.7rem', opacity: 0.75, marginTop: '0.1rem' }}>
                  Ask anything about your benefits
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              {messages.length > 0 && (
                <button
                  onClick={handleClearChat}
                  disabled={status === 'sending'}
                  aria-label="Clear chat"
                  title="Clear chat"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#fff',
                    fontSize: '0.95rem',
                    cursor: status === 'sending' ? 'not-allowed' : 'pointer',
                    opacity: status === 'sending' ? 0.4 : 0.8,
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                  }}
                >
                  ↻
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  fontSize: '1.2rem',
                  cursor: 'pointer',
                  opacity: 0.85,
                  padding: '0.1rem 0.45rem',
                  borderRadius: '4px',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Message scroll area */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '1rem',
              backgroundColor: '#faf7f2',
              fontFamily: 'Figtree, system-ui, sans-serif',
            }}
          >
            {messages.length === 0 ? (
              <EmptyState onSuggestedClick={handleSuggestedClick} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {messages.map((m) => (
                  <MessageBubble key={m.id} message={m} />
                ))}
                {status === 'sending' && <TypingIndicator />}
              </div>
            )}
          </div>

          {/* Error banner */}
          {errorMsg && status === 'error' && (
            <div
              style={{
                backgroundColor: '#fde8e8',
                borderTop: '1px solid #f5b8b8',
                color: '#8a3030',
                fontSize: '0.8rem',
                padding: '0.6rem 1rem',
                flexShrink: 0,
              }}
            >
              ⚠ {errorMsg}
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            style={{
              borderTop: '1px solid #eef1f4',
              padding: '0.75rem',
              backgroundColor: '#fff',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={status === 'sending' ? 'Thinking...' : 'Ask a question...'}
                disabled={status === 'sending'}
                rows={1}
                style={{
                  flex: 1,
                  padding: '0.6rem 0.75rem',
                  border: '1px solid #e1e6eb',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  fontFamily: 'Figtree, system-ui, sans-serif',
                  resize: 'none',
                  maxHeight: '100px',
                  minHeight: '40px',
                  outline: 'none',
                  color: '#1e3a5f',
                  backgroundColor: status === 'sending' ? '#fafbfc' : '#fff',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#7a9b76')}
                onBlur={(e) => (e.target.style.borderColor = '#e1e6eb')}
              />
              <button
                type="submit"
                disabled={!input.trim() || status === 'sending'}
                aria-label="Send message"
                style={{
                  flexShrink: 0,
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  backgroundColor: input.trim() && status !== 'sending' ? '#7a9b76' : '#d4dbe2',
                  color: '#fff',
                  border: 'none',
                  cursor: input.trim() && status !== 'sending' ? 'pointer' : 'not-allowed',
                  fontSize: '1.1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 0.15s ease',
                }}
              >
                ↑
              </button>
            </div>
            <div style={{ fontSize: '0.65rem', color: '#6b7785', textAlign: 'center', lineHeight: 1.3 }}>
              The AI Assistant offers general guidance, not medical, legal, or financial advice.
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '85%',
          padding: '0.6rem 0.85rem',
          borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
          backgroundColor: isUser ? '#1e3a5f' : '#fff',
          color: isUser ? '#fff' : '#1e3a5f',
          border: isUser ? 'none' : '1px solid #eef1f4',
          fontSize: '0.88rem',
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {message.content}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <div
        style={{
          padding: '0.6rem 0.85rem',
          borderRadius: '12px 12px 12px 2px',
          backgroundColor: '#fff',
          border: '1px solid #eef1f4',
          fontSize: '0.85rem',
          color: '#6b7785',
          fontStyle: 'italic',
        }}
      >
        Thinking...
      </div>
    </div>
  );
}

function EmptyState({ onSuggestedClick }: { onSuggestedClick: (q: string) => void }) {
  return (
    <div style={{ textAlign: 'center', paddingTop: '1.5rem' }}>
      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👋</div>
      <div
        style={{
          fontFamily: 'Playfair Display, serif',
          fontSize: '1.1rem',
          color: '#1e3a5f',
          fontWeight: 700,
          marginBottom: '0.4rem',
        }}
      >
        How can I help?
      </div>
      <div style={{ fontSize: '0.82rem', color: '#6b7785', lineHeight: 1.5, marginBottom: '1.25rem' }}>
        I can explain insurance terms, walk through your plan options, and answer questions
        about your Clarity Health account.
      </div>
      <div
        style={{
          fontSize: '0.7rem',
          color: '#7a9b76',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '0.5rem',
        }}
      >
        Try asking
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => onSuggestedClick(q)}
            style={{
              padding: '0.55rem 0.85rem',
              backgroundColor: '#fff',
              border: '1px solid #c7d9c5',
              borderRadius: '8px',
              fontSize: '0.82rem',
              color: '#1e3a5f',
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'Figtree, system-ui, sans-serif',
              transition: 'background-color 0.15s ease, border-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f5f8f4';
              e.currentTarget.style.borderColor = '#7a9b76';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#fff';
              e.currentTarget.style.borderColor = '#c7d9c5';
            }}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}