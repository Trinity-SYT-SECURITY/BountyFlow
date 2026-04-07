import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { useToast } from './Toast';
import { useModal } from './Modal';

export default function GlobalAIAssistant() {
  const router = useRouter();
  
  // Don't render AI Assistant on login/register pages
  const excludedPages = ['/login', '/register', '/forgot-password', '/reset-password'];
  if (excludedPages.includes(router.pathname)) {
    return null;
  }
  
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState('');
  const [currentProject, setCurrentProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini'); // Now synced from global provider
  const [activeProviderName, setActiveProviderName] = useState('Gemini');
  const [availableModels, setAvailableModels] = useState([]);
  const messagesEndRef = useRef(null);
  const toast = useToast();
  const { confirm } = useModal();

  // Available AI models configuration
  const AI_MODELS = [
    { id: 'gemini', name: 'Gemini', provider: 'Google', icon: '🔮', description: 'Fast & capable' },
    { id: 'openai', name: 'GPT-4', provider: 'OpenAI', icon: '🤖', description: 'Most powerful' },
    { id: 'anthropic', name: 'Claude', provider: 'Anthropic', icon: '🧠', description: 'Best for analysis' }
  ];

  useEffect(() => {
    // Track current page for context
    setCurrentPage(router.pathname);
    
    // Only use project context when on project-specific pages
    const projectSpecificPages = ['/projects/[id]', '/targets', '/findings'];
    const isProjectPage = projectSpecificPages.includes(router.pathname);
    
    if (router.query.id && isProjectPage) {
      // We're on a project-specific page with a project ID
      setCurrentProject(router.query.id);
      localStorage.setItem('lastProjectId', router.query.id);
    } else if (router.pathname === '/dashboard' || router.pathname === '/projects') {
      // On dashboard or projects list - clear project context
      setCurrentProject(null);
    } else if (!router.query.id) {
      // On other pages without explicit project ID - try to use last project
      const lastProject = localStorage.getItem('lastProjectId');
      if (lastProject && !currentProject && !router.pathname.includes('/dashboard')) {
        setCurrentProject(lastProject);
      }
    }
  }, [router.pathname, router.query]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Load available projects and models
    loadProjects();
    loadActiveProvider();
    
    // Listen for global provider changes from navbar
    const handleProviderChanged = (e) => {
      const provider = e.detail?.provider;
      if (provider) {
        setSelectedModel(provider);
        setActiveProviderName(PROVIDER_LABELS[provider] || provider);
      }
    };
    window.addEventListener('aiProviderChanged', handleProviderChanged);
    return () => window.removeEventListener('aiProviderChanged', handleProviderChanged);
  }, []);

  const PROVIDER_LABELS = {
    gemini: 'Gemini',
    openai: 'GPT-4',
    anthropic: 'Claude'
  };

  const PROVIDER_ICONS = {
    gemini: '🔮',
    openai: '🤖',
    anthropic: '🧠'
  };

  const loadActiveProvider = async () => {
    try {
      const response = await fetch('http://localhost:8002/api/v1/ai/active-provider');
      if (response.ok) {
        const data = await response.json();
        const provider = data.active || 'gemini';
        setSelectedModel(provider);
        setActiveProviderName(PROVIDER_LABELS[provider] || provider);
      }
    } catch (error) {
      console.log('Could not load active provider, using default');
    }
  };

  const loadProjects = async () => {
    try {
      const response = await fetch('http://localhost:8002/api/v1/projects/');
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const getPageContext = () => {
    const contexts = {
      '/dashboard': 'dashboard overview',
      '/projects': 'project management',
      '/projects/[id]': 'project details',
      '/targets': 'target management',
      '/findings': 'findings and vulnerabilities',
      '/tools': 'tool management',
      '/knowledge-graph': 'knowledge graph visualization',
      '/attack-vectors': 'attack vectors',
      '/attack-chains': 'attack chain builder',
      '/workflows': 'workflow automation',
      '/recommendations': 'AI recommendations'
    };
    return contexts[currentPage] || 'general';
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = {
      role: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:8002/api/v1/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: inputMessage,
          project_id: currentProject,
          page_context: getPageContext(),
          current_url: router.asPath,
          model: selectedModel
        })
      });

      if (response.ok) {
        const data = await response.json();
        const aiMessage = {
          role: 'assistant',
          content: data.response,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, aiMessage]);
      } else {
        throw new Error('Failed to get response');
      }
    } catch (error) {
      console.error('AI Chat Error:', error);
      const errorMessage = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleClearHistory = async () => {
    // Triple confirmation
    const confirmations = [
      'Are you sure you want to clear ALL AI conversation history? This cannot be undone.',
      'This will permanently delete all AI conversations across ALL pages. Are you REALLY sure?',
      'Last chance! This action will PERMANENTLY delete all AI conversation history from the database. Confirm?'
    ];
    
    for (const confirmMsg of confirmations) {
      const confirmed = await confirm({
        title: 'Clear History',
        message: confirmMsg,
        confirmText: 'Clear History',
        variant: 'danger'
      });
      if (!confirmed) {
        return; // User cancelled
      }
    }
    
    try {
      const projectParam = currentProject ? `project_id=${currentProject}` : '';
      const response = await fetch(
        `http://localhost:8002/api/v1/ai/history?${projectParam}&confirm_token=CLEAR_AI_HISTORY_CONFIRMED_3_TIMES`,
        {
          method: 'DELETE',
        }
      );
      
      if (response.ok) {
        setMessages([]);
        toast.success('All conversation history has been cleared successfully.');
      } else {
        const error = await response.json();
        toast.error(`Failed to clear history: ${error.detail}`);
      }
    } catch (error) {
      console.error('Failed to clear history:', error);
      toast.error('Failed to clear conversation history. Please try again.');
    }
  };

  const quickActions = [
    {
      icon: '🎯',
      label: 'Plan Attack',
      prompt: 'Based on current data, help me plan the next attack phase'
    },
    {
      icon: '🔍',
      label: 'Analyze Findings',
      prompt: 'Analyze all findings and suggest exploitation paths'
    },
    {
      icon: '⚡',
      label: 'Quick Win',
      prompt: 'What are the quickest wins I can achieve right now?'
    },
    {
      icon: '🔗',
      label: 'Attack Chain',
      prompt: 'Help me build an attack chain from current findings'
    }
  ];

  const handleQuickAction = (prompt) => {
    setInputMessage(prompt);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-300 z-50 group"
        title="AI Assistant"
      >
        <div className="flex items-center space-x-2">
          <span className="text-2xl">🤖</span>
          <span className="hidden group-hover:inline-block font-medium">AI Assistant</span>
        </div>
      </button>
    );
  }

  return (
    <div className={`fixed bg-gray-900 border border-gray-700 rounded-lg shadow-2xl flex flex-col z-50 transition-all duration-300 ${
      isMaximized 
        ? 'inset-4 w-auto h-auto' 
        : 'bottom-6 right-6 w-96 h-[600px]'
    }`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-3 rounded-t-lg flex items-center justify-between">
        <div className="flex items-center space-x-2 flex-1 min-w-0">
          <span className="text-2xl flex-shrink-0">🤖</span>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold">AI Attack Assistant</h3>
            <div className="text-xs opacity-90 flex items-center gap-2 flex-wrap">
              <span>Context: {getPageContext()}</span>
              {currentProject && (
                <span className="inline-flex items-center">
                  | Project: {currentProject}
                  <button
                    onClick={() => setShowProjectSelector(!showProjectSelector)}
                    className="ml-1 hover:bg-white/20 rounded px-1"
                    title="Change project"
                  >
                    🔄
                  </button>
                </span>
              )}
              {!currentProject && (
                <button
                  onClick={() => setShowProjectSelector(!showProjectSelector)}
                  className="text-yellow-300 hover:text-yellow-100 underline"
                  title="Select project for better context"
                >
                  Select Project
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2 flex-shrink-0">
          {/* Active Provider Badge (read-only, controlled from navbar) */}
          <span
            className="text-white bg-white/20 rounded px-2 py-1 text-xs flex items-center space-x-1"
            title="AI provider is controlled from the navbar selector"
          >
            <span>{PROVIDER_ICONS[selectedModel] || '🤖'}</span>
            <span className="hidden sm:inline">{activeProviderName}</span>
          </span>
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="text-white hover:bg-white/20 rounded p-1 transition"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="1" y="4" width="10" height="10" rx="1" />
                <path d="M5 4V2.5A1.5 1.5 0 0 1 6.5 1H13.5A1.5 1.5 0 0 1 15 2.5V9.5A1.5 1.5 0 0 1 13.5 11H12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="2" width="12" height="12" rx="1" />
              </svg>
            )}
          </button>
          <button
            onClick={() => {
              setIsOpen(false);
              setIsMaximized(false);
            }}
            className="text-white hover:bg-white/20 rounded p-1 transition"
            title="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4L12 12M12 4L4 12" />
            </svg>
          </button>
        </div>
      </div>


      {/* Project Selector */}
      {showProjectSelector && (
        <div className="bg-gray-800 border-b border-gray-700 p-3">
          <p className="text-xs text-gray-400 mb-2">
            Select a project for AI to analyze comprehensive data:
          </p>
          <select
            value={currentProject || ''}
            onChange={(e) => {
              const newProject = e.target.value || null;
              setCurrentProject(newProject);
              if (newProject) {
                localStorage.setItem('lastProjectId', newProject);
              } else {
                localStorage.removeItem('lastProjectId');
              }
              setShowProjectSelector(false);
            }}
            className="w-full bg-gray-700 text-white px-3 py-2 rounded text-sm"
          >
            <option value="">No project selected (general mode)</option>
            {projects.map((proj) => (
              <option key={proj.id} value={proj.id}>
                {proj.name} - {proj.status || 'active'}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Quick Actions & Clear History */}
      <div className="p-3 border-b border-gray-700 flex items-start justify-between">
        {messages.length === 0 ? (
          <div className="flex-1">
            <p className="text-xs text-gray-400 mb-2">Quick Actions:</p>
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map((action, index) => (
                <button
                  key={index}
                  onClick={() => handleQuickAction(action.prompt)}
                  className="bg-gray-800 hover:bg-gray-700 p-2 rounded text-left transition"
                >
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">{action.icon}</span>
                    <span className="text-xs text-white">{action.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1"></div>
        )}
        {messages.length > 0 && (
          <button
            onClick={handleClearHistory}
            className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-gray-800 ml-2 whitespace-nowrap"
            title="Clear all conversation history (requires 3 confirmations)"
          >
            Clear History
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <p className="text-4xl mb-3">⚔️</p>
            <p className="text-sm">Ask me anything about:</p>
            <ul className="text-xs mt-2 space-y-1">
              <li>• Attack strategies and tactics</li>
              <li>• Exploitation techniques</li>
              <li>• Tool usage and commands</li>
              <li>• Privilege escalation paths</li>
              <li>• Post-exploitation actions</li>
            </ul>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`rounded-lg p-3 ${
                  isMaximized ? 'max-w-[90%]' : 'max-w-[85%]'
                } ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-200'
                }`}
              >
                {msg.role === 'user' ? (
                  <p className={`whitespace-pre-wrap break-words ${isMaximized ? 'text-base' : 'text-sm'}`}>
                    {msg.content}
                  </p>
                ) : (
                  <div className={`markdown-content break-words ${isMaximized ? 'text-base' : 'text-sm'}`}>
                    <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                )}
                <p className="text-xs opacity-70 mt-1">
                  {msg.timestamp.toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-700">
        <div className="flex space-x-2">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about attack strategies..."
            className="flex-1 bg-gray-800 text-white px-3 py-2 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows="2"
          />
          <button
            onClick={sendMessage}
            disabled={!inputMessage.trim() || isLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-4 rounded-lg transition"
          >
            <span className="text-xl">➤</span>
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Shift+Enter for new line, Enter to send
        </p>
      </div>

      <style jsx global>{`
        .markdown-content {
          line-height: 1.6;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        .markdown-content p {
          margin-bottom: 0.75rem;
        }
        .markdown-content code {
          background-color: rgba(0, 0, 0, 0.4);
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-family: 'Courier New', 'Monaco', monospace;
          font-size: 0.85em;
          color: #e0e0e0;
        }
        .markdown-content pre {
          background-color: rgba(0, 0, 0, 0.6);
          padding: 1rem;
          border-radius: 0.5rem;
          overflow-x: auto;
          margin: 1rem 0;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .markdown-content pre code {
          background: none;
          padding: 0;
          font-size: 0.9em;
          color: inherit;
        }
        .markdown-content ul, .markdown-content ol {
          margin-left: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .markdown-content li {
          margin-bottom: 0.375rem;
        }
        .markdown-content strong {
          font-weight: 600;
          color: #93c5fd;
        }
        .markdown-content h1, .markdown-content h2, .markdown-content h3 {
          font-weight: 600;
          margin-top: 1rem;
          margin-bottom: 0.75rem;
          color: #a5b4fc;
        }
        .markdown-content h1 { font-size: 1.5rem; }
        .markdown-content h2 { font-size: 1.25rem; }
        .markdown-content h3 { font-size: 1.1rem; }
        .markdown-content blockquote {
          border-left: 4px solid #6366f1;
          background-color: rgba(99, 102, 241, 0.1);
          padding: 0.75rem 1rem;
          margin: 1rem 0;
          font-style: italic;
        }
        .markdown-content table {
          border-collapse: collapse;
          width: 100%;
          margin: 1rem 0;
        }
        .markdown-content th, .markdown-content td {
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 0.5rem;
          text-align: left;
        }
        .markdown-content th {
          background-color: rgba(99, 102, 241, 0.2);
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
