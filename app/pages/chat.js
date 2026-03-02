import { useMemo, useState } from 'react';
import BottomNav from '../components/BottomNav';
import {
  Bars3Icon,
  PaperAirplaneIcon,
  SparklesIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

const INITIAL_HISTORY = [
  { id: 'chat-1', title: 'Discuss estradiol trend', timeAgo: '2h ago' },
  { id: 'chat-2', title: 'Meal timing for recovery', timeAgo: 'Yesterday' }
];

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [chatHistory, setChatHistory] = useState(INITIAL_HISTORY);

  const emptyPrompts = useMemo(
    () => [
      'Ask about your blood results',
      'Review protocol phases',
      'Plan food around training'
    ],
    []
  );

  function startNewChat() {
    setMessages([]);
    setDraft('');
    setShowHistory(false);
  }

  function sendMessage(event) {
    event.preventDefault();
    if (!draft.trim()) return;

    const userMessage = { role: 'user', content: draft.trim() };
    const reply = {
      role: 'assistant',
      content: 'AI Coach UI is live. Backend coaching is still a placeholder, so this response is a local stub until the model integration is wired in.'
    };

    setMessages((current) => [...current, userMessage, reply]);
    setChatHistory((current) => [
      { id: `chat-${Date.now()}`, title: userMessage.content, timeAgo: 'Just now' },
      ...current
    ]);
    setDraft('');
  }

  return (
    <div className="h-[100dvh] min-h-screen flex flex-col overflow-hidden bg-slate-900 text-white">
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-slate-900">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
          <button onClick={() => setShowHistory(true)} className="text-gray-400">
            <Bars3Icon className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold">AI Coach</h1>
          <button onClick={startNewChat} className="text-sm font-medium text-cyan-400">
            + New
          </button>
        </div>
      </header>

      <main className="page-content flex-1 min-h-0 overflow-y-auto px-5 py-4 pb-[calc(104px+env(safe-area-inset-bottom))]">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <SparklesIcon className="mb-3 h-10 w-10 text-cyan-400" />
            <h2 className="mb-1 text-lg font-semibold text-white">Chat with your AI Coach</h2>
            <p className="max-w-xs text-sm text-gray-400">
              Ask about your blood results, peptide protocols, or health goals.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {emptyPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => setDraft(prompt)}
                  className="rounded-full border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-gray-300"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    message.role === 'user'
                      ? 'rounded-br-md bg-cyan-500 text-black'
                      : 'rounded-bl-md border border-gray-700 bg-gray-800 text-gray-200'
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <div className="border-t border-gray-800 bg-slate-900 px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+5rem)]">
        <form onSubmit={sendMessage} className="mx-auto flex max-w-lg items-center gap-3">
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about your results..."
            className="flex-1 rounded-full border border-gray-700 bg-gray-800 px-5 py-3 text-sm text-white outline-none focus:border-cyan-500"
          />
          <button className="rounded-full bg-cyan-500 p-3 text-black">
            <PaperAirplaneIcon className="h-5 w-5" />
          </button>
        </form>
      </div>

      {showHistory && (
        <div className="fixed inset-0 z-50 flex">
          <div className="h-full w-72 overflow-y-auto border-r border-gray-800 bg-gray-900 p-5">
            <div className="mb-5 flex items-center justify-between">
              <button onClick={startNewChat} className="rounded-xl bg-cyan-500 px-4 py-3 font-medium text-black">
                + New Chat
              </button>
              <button onClick={() => setShowHistory(false)} className="text-gray-400">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-2">
              {chatHistory.map((chat) => (
                <button key={chat.id} className="w-full rounded-xl bg-gray-800 p-3 text-left hover:bg-gray-700">
                  <p className="truncate text-sm font-medium text-white">{chat.title}</p>
                  <p className="text-xs text-gray-500">{chat.timeAgo}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setShowHistory(false)} />
        </div>
      )}

      <BottomNav active="more" />
    </div>
  );
}
