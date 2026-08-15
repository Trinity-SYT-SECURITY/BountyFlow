import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../../components/Layout';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import 'highlight.js/styles/github-dark.css';
import { useToast } from '../../components/Toast';

export default function ReportEditor() {
  const router = useRouter();
  const { id } = router.query;
  const [report, setReport] = useState(null);
  const [markdownContent, setMarkdownContent] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showExecutionModal, setShowExecutionModal] = useState(false);
  const [showFormatOptions, setShowFormatOptions] = useState(false);
  const [availableExecutions, setAvailableExecutions] = useState([]);
  const [selectedExecutions, setSelectedExecutions] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [showRedactionModal, setShowRedactionModal] = useState(false);
  const [redactionText, setRedactionText] = useState('');
  const [redactionResult, setRedactionResult] = useState('');
  const editorRef = useRef(null);
  const toast = useToast();

  useEffect(() => {
    if (id) {
      loadReport();
      loadAvailableExecutions();
    }
  }, [id]);

  // Handle paste image and files
  useEffect(() => {
    const handlePaste = async (e) => {
      // Only handle paste in the editor textarea
      const target = e.target;
      const editor = editorRef.current;
      if (editor && target === editor) {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let item of items) {
          // Handle image paste
          if (item.type.indexOf('image') !== -1) {
            e.preventDefault();
            e.stopPropagation();
            const file = item.getAsFile();
            if (file) {
              // Use current markdown content from state
              await handleImageUpload(file);
            }
            break; // Only process first image
          }
        }
      }
    };

    // Add global paste listener (will check target inside)
    document.addEventListener('paste', handlePaste, true);
    
    return () => {
      document.removeEventListener('paste', handlePaste, true);
    };
  }, [markdownContent, id]); // Include dependencies

  const loadReport = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`http://localhost:8002/api/v1/reports/${id}`, {
        headers
      });

      if (response.ok) {
        const data = await response.json();
        setReport(data);
        setMarkdownContent(data.markdown_content || '');
        
        // Load included executions
        if (data.included_executions?.ids) {
          setSelectedExecutions(data.included_executions.ids);
        }
      } else {
        toast.error('Failed to load report');
        router.push('/reports');
      }
    } catch (error) {
      console.error('Error loading report:', error);
      toast.error('Error loading report');
    }
  };

  const loadAvailableExecutions = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`http://localhost:8002/api/v1/reports/${id}/executions`, {
        headers
      });

      if (response.ok) {
        const data = await response.json();
        setAvailableExecutions(data);
      }
    } catch (error) {
      console.error('Error loading executions:', error);
    }
  };

  const saveReport = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`http://localhost:8002/api/v1/reports/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          markdown_content: markdownContent
        })
      });

      if (response.ok) {
        const data = await response.json();
        setReport(data);
        toast.success('Report saved successfully!');
      } else {
        const error = await response.json();
        toast.error(`Failed to save: ${error.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error saving report:', error);
      toast.error('Error saving report');
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (file) => {
    // Validate file type - allow images and common document types
    const allowedImageTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'];
    const allowedDocTypes = ['application/pdf', 'text/plain', 'text/markdown', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
    const allowedTypes = [...allowedImageTypes, ...allowedDocTypes];
    
    if (!file.type || (!allowedImageTypes.includes(file.type) && !allowedDocTypes.includes(file.type))) {
      toast.warning(`File type not allowed. Allowed types: Images (PNG, JPG, GIF, WEBP, SVG) and Documents (PDF, TXT, MD, DOC, DOCX)`);
      return;
    }

    setUploadingImage(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);

      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Use appropriate endpoint based on file type
      const endpoint = allowedImageTypes.includes(file.type) 
        ? `http://localhost:8002/api/v1/reports/${id}/upload-image`
        : `http://localhost:8002/api/v1/reports/${id}/upload-file`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        // Insert markdown reference at cursor position
        const textarea = editorRef.current;
        
        if (textarea) {
          const start = textarea.selectionStart || 0;
          const end = textarea.selectionEnd || 0;
          const before = markdownContent.substring(0, start);
          const after = markdownContent.substring(end);
          const insertText = allowedImageTypes.includes(file.type) 
            ? `\n${data.markdown}\n`
            : `\n[${file.name}](${data.url || data.markdown})\n`;
          const newContent = before + insertText + after;
          setMarkdownContent(newContent);
          
          // Restore cursor position
          setTimeout(() => {
            textarea.focus();
            const newPos = start + insertText.length;
            textarea.setSelectionRange(newPos, newPos);
          }, 0);
        } else {
          // Append to end if no cursor
          const insertText = allowedImageTypes.includes(file.type) 
            ? `\n${data.markdown}\n`
            : `\n[${file.name}](${data.url || data.markdown})\n`;
          setMarkdownContent(prev => prev + insertText);
        }
      } else {
        const error = await response.json();
        toast.error(`Failed to upload file: ${error.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Error uploading file');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleFormatExecutions = async (includeOutput = true, redactSensitive = false, summarize = false) => {
    if (selectedExecutions.length === 0) {
      toast.warning('Please select executions to format');
      return;
    }

    setFormatting(true);
    setShowFormatOptions(false);
    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`http://localhost:8002/api/v1/reports/${id}/format-executions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          execution_ids: selectedExecutions,
          include_output: includeOutput,
          redact_sensitive: redactSensitive,
          summarize: summarize
        })
      });

      if (response.ok) {
        const data = await response.json();
        // Insert formatted markdown at cursor position or append
        const textarea = editorRef.current;
        if (textarea) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const before = markdownContent.substring(0, start);
          const after = markdownContent.substring(end);
          const newContent = before + '\n\n' + data.markdown + '\n\n' + after;
          setMarkdownContent(newContent);
          
          // Also add executions to included list
          await handleAddExecutions(selectedExecutions, false);
          
          setSelectedExecutions([]);
          setShowExecutionModal(false);
          
          setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start, start);
          }, 0);
        } else {
          setMarkdownContent(prev => prev + '\n\n' + data.markdown + '\n\n');
        }
        
        toast.success(`Successfully formatted and inserted ${data.count} execution(s)!`);
      } else {
        const error = await response.json();
        toast.error(`Failed to format executions: ${error.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error formatting executions:', error);
      toast.error('Error formatting executions');
    } finally {
      setFormatting(false);
    }
  };

  const handleRedactText = async () => {
    if (!redactionText.trim()) {
      toast.warning('Please enter text to redact');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`http://localhost:8002/api/v1/reports/${id}/redact-text`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: redactionText })
      });

      if (response.ok) {
        const data = await response.json();
        setRedactionResult(data.redacted_text);
      } else {
        // Fallback: client-side redaction
        const redacted = redactSensitiveInfo(redactionText);
        setRedactionResult(redacted);
      }
    } catch (error) {
      // Fallback: client-side redaction
      const redacted = redactSensitiveInfo(redactionText);
      setRedactionResult(redacted);
    }
  };

  const redactSensitiveInfo = (text) => {
    // Client-side redaction (same patterns as backend)
    let redacted = text;
    
    // Redact IP addresses
    redacted = redacted.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[REDACTED_IP]');
    
    // Redact email addresses
    redacted = redacted.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[REDACTED_EMAIL]');
    
    // Redact API keys
    const apiKeyPattern = /(api[_-]?key|apikey|secret[_-]?key|token)\s*[=:]\s*["']?[A-Za-z0-9_-]{20,}["']?/gi;
    redacted = redacted.replace(apiKeyPattern, '$1=[REDACTED]');
    
    // Redact passwords
    const passwordPattern = /(password|passwd|pwd)\s*[=:]\s*["']?[^\s"']+["']?/gi;
    redacted = redacted.replace(passwordPattern, '$1=[REDACTED]');
    
    return redacted;
  };

  const handleAddExecutions = async (execIds = null, showAlert = true) => {
    const execsToAdd = execIds || selectedExecutions;
    if (execsToAdd.length === 0) {
      if (showAlert) toast.warning('Please select at least one execution');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Add each selected execution (only if not already included)
      const executionsToAdd = execsToAdd.filter(execId => 
        !availableExecutions.find(e => e.id === execId && e.included)
      );

      for (const execId of executionsToAdd) {
        const response = await fetch(
          `http://localhost:8002/api/v1/reports/${id}/add-execution?execution_id=${execId}`,
          {
            method: 'POST',
            headers
          }
        );

        if (!response.ok) {
          console.error(`Failed to add execution ${execId}`);
        }
      }
      
      if (executionsToAdd.length === 0 && showAlert) {
        toast.info('Selected executions are already in the report');
        return;
      }

      // Reload report and executions
      loadReport();
      loadAvailableExecutions();
      if (showAlert) {
        setShowExecutionModal(false);
        setSelectedExecutions([]);
        toast.success('Executions added to report successfully!');
      }
    } catch (error) {
      console.error('Error adding executions:', error);
      if (showAlert) toast.error('Error adding executions');
    }
  };

  const handleRemoveExecution = async (execId) => {
    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(
        `http://localhost:8002/api/v1/reports/${id}/remove-execution/${execId}`,
        {
          method: 'DELETE',
          headers
        }
      );

      if (response.ok) {
        loadReport();
        loadAvailableExecutions();
      }
    } catch (error) {
      console.error('Error removing execution:', error);
    }
  };

  const handleExport = async (format) => {
    try {
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(
        `http://localhost:8002/api/v1/reports/${id}/export/${format}`,
        { headers }
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${report.title.replace(/ /g, '_')}.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const error = await response.json();
        toast.error(`Failed to export: ${error.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error exporting report:', error);
      toast.error('Error exporting report');
    }
  };

  if (!report) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-400">Loading report...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Head>
        <title>{report.title} - Report Editor - BountyFlow</title>
      </Head>

      <div className="min-h-screen bg-gray-900 text-white">
        {/* Header */}
        <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/reports" className="text-blue-400 hover:text-blue-300">
                ← Back to Reports
              </Link>
              <div>
                <h1 className="text-2xl font-bold">{report.title}</h1>
                <p className="text-gray-400 text-sm capitalize">{report.report_type}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-white"
              >
                {showPreview ? '✏️ Edit' : '👁️ Preview'}
              </button>
              <button
                onClick={() => setShowRedactionModal(true)}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-sm text-white"
              >
                🔒 Redact Text
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowExecutionModal(true)}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm text-white"
                >
                  ➕ Add Tool Results
                </button>
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowFormatOptions(!showFormatOptions)}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm text-white"
                >
                  📝 Format & Insert
                </button>
                {showFormatOptions && (
                  <div className="absolute right-0 mt-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-50 p-4">
                    <p className="text-sm text-gray-300 mb-3">Format Options:</p>
                    <div className="space-y-2">
                      <button
                        onClick={() => handleFormatExecutions(true, false, false)}
                        disabled={selectedExecutions.length === 0 || formatting}
                        className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm text-white disabled:opacity-50"
                      >
                        📋 Full Output
                      </button>
                      <button
                        onClick={() => handleFormatExecutions(true, true, false)}
                        disabled={selectedExecutions.length === 0 || formatting}
                        className="w-full px-3 py-2 bg-orange-600 hover:bg-orange-700 rounded text-sm text-white disabled:opacity-50"
                      >
                        🔒 Redacted
                      </button>
                      <button
                        onClick={() => handleFormatExecutions(true, false, true)}
                        disabled={selectedExecutions.length === 0 || formatting}
                        className="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-sm text-white disabled:opacity-50"
                      >
                        🤖 AI Summary
                      </button>
                      <button
                        onClick={() => handleFormatExecutions(false, false, false)}
                        disabled={selectedExecutions.length === 0 || formatting}
                        className="w-full px-3 py-2 bg-gray-600 hover:bg-gray-700 rounded text-sm text-white disabled:opacity-50"
                      >
                        📝 Command Only
                      </button>
                    </div>
                    {formatting && (
                      <p className="text-xs text-gray-400 mt-2 text-center">Formatting...</p>
                    )}
                  </div>
                )}
              </div>
              <div className="relative">
                <button
                  onClick={() => {
                    const menu = document.getElementById('export-menu');
                    if (menu) menu.classList.toggle('hidden');
                  }}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm text-white"
                >
                  📥 Export
                </button>
                <div id="export-menu" className="hidden absolute right-0 mt-2 w-32 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-50">
                  <button
                    onClick={() => handleExport('markdown')}
                    className="w-full px-3 py-2 text-left text-sm text-white hover:bg-gray-700 rounded-t-lg"
                  >
                    📄 Markdown
                  </button>
                  <button
                    onClick={() => handleExport('html')}
                    className="w-full px-3 py-2 text-left text-sm text-white hover:bg-gray-700"
                  >
                    🌐 HTML
                  </button>
                  <button
                    onClick={() => handleExport('pdf')}
                    className="w-full px-3 py-2 text-left text-sm text-white hover:bg-gray-700 rounded-b-lg"
                  >
                    📑 PDF
                  </button>
                </div>
              </div>
              <button
                onClick={saveReport}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white disabled:opacity-50"
              >
                {saving ? '💾 Saving...' : '💾 Save'}
              </button>
            </div>
          </div>
        </div>

        {/* Editor/Preview */}
        <div className="flex h-[calc(100vh-140px)]">
          {showPreview ? (
            <div className="flex-1 overflow-y-auto p-6 bg-gray-900">
              <div className="max-w-4xl mx-auto prose prose-invert prose-lg dark:prose-invert 
                prose-headings:text-white prose-headings:font-bold
                prose-p:text-gray-300 prose-p:leading-relaxed
                prose-a:text-blue-400 prose-a:no-underline hover:prose-a:text-blue-300 hover:prose-a:underline
                prose-strong:text-white prose-strong:font-semibold
                prose-code:text-green-400 prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                prose-pre:bg-gray-800 prose-pre:border prose-pre:border-gray-700
                prose-blockquote:text-gray-400 prose-blockquote:border-blue-500
                prose-table:text-gray-300 prose-th:text-white prose-th:bg-gray-800 prose-th:font-semibold
                prose-td:text-gray-300 prose-td:border-gray-700
                prose-ul:text-gray-300 prose-ol:text-gray-300 prose-li:text-gray-300
                prose-img:rounded-lg prose-img:my-4
                prose-hr:border-gray-700">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    h1: ({ children, ...props }) => (
                      <h1 className="text-4xl font-bold text-white mb-4 mt-8 first:mt-0" {...props}>
                        {children}
                      </h1>
                    ),
                    h2: ({ children, ...props }) => (
                      <h2 className="text-3xl font-bold text-white mb-3 mt-6" {...props}>
                        {children}
                      </h2>
                    ),
                    h3: ({ children, ...props }) => (
                      <h3 className="text-2xl font-semibold text-white mb-2 mt-4" {...props}>
                        {children}
                      </h3>
                    ),
                    h4: ({ children, ...props }) => (
                      <h4 className="text-xl font-semibold text-white mb-2 mt-4" {...props}>
                        {children}
                      </h4>
                    ),
                    h5: ({ children, ...props }) => (
                      <h5 className="text-lg font-semibold text-white mb-2 mt-3" {...props}>
                        {children}
                      </h5>
                    ),
                    h6: ({ children, ...props }) => (
                      <h6 className="text-base font-semibold text-white mb-2 mt-3" {...props}>
                        {children}
                      </h6>
                    ),
                    p: ({ children, ...props }) => (
                      <p className="text-gray-300 leading-relaxed mb-4" {...props}>
                        {children}
                      </p>
                    ),
                    ul: ({ children, ...props }) => (
                      <ul className="list-disc list-inside text-gray-300 mb-4 space-y-2 ml-4" {...props}>
                        {children}
                      </ul>
                    ),
                    ol: ({ children, ...props }) => (
                      <ol className="list-decimal list-inside text-gray-300 mb-4 space-y-2 ml-4" {...props}>
                        {children}
                      </ol>
                    ),
                    li: ({ children, ...props }) => (
                      <li className="text-gray-300" {...props}>
                        {children}
                      </li>
                    ),
                    img: ({ src, alt }) => (
                      <img 
                        src={src?.startsWith('http') ? src : `http://localhost:8002${src}`}
                        alt={alt}
                        className="max-w-full rounded-lg my-4"
                        onError={(e) => {
                          // Try full URL if relative path fails
                          if (!src?.startsWith('http')) {
                            e.target.src = `http://localhost:8002${src}`;
                          }
                        }}
                      />
                    ),
                    code: ({ node, inline, className, children, ...props }) => {
                      const match = /language-(\w+)/.exec(className || '');
                      return !inline && match ? (
                        <pre className="bg-gray-800 rounded-lg p-4 overflow-x-auto border border-gray-700 my-4">
                          <code className={`${className} text-green-400`} {...props}>
                            {children}
                          </code>
                        </pre>
                      ) : (
                        <code className="bg-gray-800 px-1.5 py-0.5 rounded text-green-400 font-mono text-sm" {...props}>
                          {children}
                        </code>
                      );
                    },
                    table: ({ children, ...props }) => (
                      <div className="overflow-x-auto my-4">
                        <table className="min-w-full border-collapse border border-gray-700" {...props}>
                          {children}
                        </table>
                      </div>
                    ),
                    thead: ({ children, ...props }) => (
                      <thead className="bg-gray-800" {...props}>{children}</thead>
                    ),
                    tbody: ({ children, ...props }) => (
                      <tbody {...props}>{children}</tbody>
                    ),
                    tr: ({ children, ...props }) => (
                      <tr className="border-b border-gray-700" {...props}>{children}</tr>
                    ),
                    th: ({ children, ...props }) => (
                      <th className="border border-gray-700 px-4 py-2 text-left font-semibold text-white bg-gray-800" {...props}>
                        {children}
                      </th>
                    ),
                    td: ({ children, ...props }) => (
                      <td className="border border-gray-700 px-4 py-2 text-gray-300" {...props}>
                        {children}
                      </td>
                    ),
                    blockquote: ({ children, ...props }) => (
                      <blockquote className="border-l-4 border-blue-500 pl-4 italic my-4 text-gray-400 bg-gray-800/50 py-2 rounded-r" {...props}>
                        {children}
                      </blockquote>
                    ),
                    a: ({ href, children, ...props }) => (
                      <a 
                        href={href} 
                        className="text-blue-400 hover:text-blue-300 underline transition-colors" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        {...props}
                      >
                        {children}
                      </a>
                    ),
                    hr: ({ ...props }) => (
                      <hr className="border-gray-700 my-6" {...props} />
                    ),
                    strong: ({ children, ...props }) => (
                      <strong className="font-semibold text-white" {...props}>
                        {children}
                      </strong>
                    ),
                    em: ({ children, ...props }) => (
                      <em className="italic text-gray-300" {...props}>
                        {children}
                      </em>
                    ),
                  }}
                >
                  {markdownContent}
                </ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              {/* Toolbar */}
              <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center space-x-2 flex-wrap">
                <label className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm cursor-pointer text-white">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) handleImageUpload(file);
                      e.target.value = '';
                    }}
                  />
                  {uploadingImage ? '⏳ Uploading...' : '📷 Upload Image'}
                </label>
                <span className="text-gray-500 text-sm">|</span>
                <span className="text-gray-400 text-sm">💡 Paste images from clipboard or drag & drop</span>
              </div>
              
              {/* Editor */}
              <textarea
                ref={editorRef}
                value={markdownContent}
                onChange={(e) => setMarkdownContent(e.target.value)}
                onDrop={(e) => {
                  e.preventDefault();
                  const files = e.dataTransfer.files;
                  for (let file of files) {
                    if (file.type.startsWith('image/')) {
                      handleImageUpload(file);
                      break;
                    }
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
                className="flex-1 w-full bg-gray-900 text-white p-6 font-mono text-sm resize-none focus:outline-none"
                placeholder="Start editing your report in Markdown..."
                style={{ minHeight: '500px' }}
              />
            </div>
          )}
        </div>

        {/* Execution Selection Modal */}
        {showExecutionModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">Select Tool Executions to Add</h2>
                <button
                  onClick={() => {
                    setShowExecutionModal(false);
                    setSelectedExecutions([]);
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              
              {availableExecutions.length > 0 && (
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-gray-400 text-sm">
                    {selectedExecutions.length} of {availableExecutions.length} selected
                  </span>
                  <div className="space-x-2">
                    <button
                      onClick={() => {
                        const allIds = availableExecutions.map(e => e.id);
                        setSelectedExecutions(allIds);
                      }}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm text-white"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => setSelectedExecutions([])}
                      className="px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded text-sm text-white"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
              )}
              
              <div className="space-y-2 mb-4 max-h-96 overflow-y-auto">
                {availableExecutions.map((exec) => (
                  <label
                    key={exec.id}
                    className="flex items-start space-x-3 p-3 bg-gray-700 rounded-lg hover:bg-gray-600 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedExecutions.includes(exec.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedExecutions([...selectedExecutions, exec.id]);
                        } else {
                          setSelectedExecutions(selectedExecutions.filter(id => id !== exec.id));
                        }
                      }}
                      className="mt-1 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium text-white">
                            {exec.tool_name || 'Unknown Tool'}
                          </span>
                          {exec.exit_code !== null && (
                            <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                              exec.exit_code === 0 ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                            }`}>
                              Exit: {exec.exit_code}
                            </span>
                          )}
                        </div>
                        {exec.included && (
                          <span className="px-2 py-1 bg-green-900 text-green-300 text-xs rounded">
                            ✓ In Report
                          </span>
                        )}
                      </div>
                      <p className="text-gray-300 text-xs font-mono mt-1 break-all">
                        {exec.command_executed || 'N/A'}
                      </p>
                      {exec.output_preview && (
                        <p className="text-gray-400 text-xs mt-1 font-mono line-clamp-2">
                          {exec.output_preview}
                        </p>
                      )}
                      {exec.output_length > 0 && (
                        <p className="text-gray-500 text-xs mt-1">
                          Output: {exec.output_length} chars • {exec.start_time ? new Date(exec.start_time).toLocaleString() : 'N/A'}
                        </p>
                      )}
                    </div>
                    {exec.included && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handleRemoveExecution(exec.id);
                        }}
                        className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs text-white"
                      >
                        Remove
                      </button>
                    )}
                  </label>
                ))}
              </div>

              {availableExecutions.length === 0 && (
                <p className="text-gray-400 text-center py-8">No tool executions available for this project</p>
              )}

              <div className="flex justify-end space-x-3 mt-6 border-t border-gray-700 pt-4">
                <button
                  onClick={() => {
                    setShowExecutionModal(false);
                    setSelectedExecutions([]);
                  }}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleAddExecutions()}
                  disabled={selectedExecutions.length === 0}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add to Report ({selectedExecutions.length})
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Redaction Tool Modal */}
        {showRedactionModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">🔒 Text Redaction Tool</h2>
                <button
                  onClick={() => {
                    setShowRedactionModal(false);
                    setRedactionText('');
                    setRedactionResult('');
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              
              <p className="text-gray-400 text-sm mb-4">
                Automatically redacts sensitive information: IP addresses, emails, API keys, passwords
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Original Text</label>
                  <textarea
                    value={redactionText}
                    onChange={(e) => setRedactionText(e.target.value)}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none font-mono text-sm"
                    rows={12}
                    placeholder="Paste text containing sensitive information here..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Redacted Text</label>
                  <textarea
                    value={redactionResult}
                    readOnly
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 font-mono text-sm"
                    rows={12}
                    placeholder="Redacted text will appear here..."
                  />
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-4">
                <button
                  onClick={() => {
                    setShowRedactionModal(false);
                    setRedactionText('');
                    setRedactionResult('');
                  }}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRedactText}
                  disabled={!redactionText.trim()}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-white disabled:opacity-50"
                >
                  🔒 Redact
                </button>
                {redactionResult && (
                  <button
                    onClick={() => {
                      // Insert redacted text at cursor
                      const textarea = editorRef.current;
                      if (textarea) {
                        const start = textarea.selectionStart;
                        const end = textarea.selectionEnd;
                        const before = markdownContent.substring(0, start);
                        const after = markdownContent.substring(end);
                        setMarkdownContent(before + redactionResult + after);
                        setShowRedactionModal(false);
                        setTimeout(() => {
                          textarea.focus();
                          textarea.setSelectionRange(start + redactionResult.length, start + redactionResult.length);
                        }, 0);
                      } else {
                        setMarkdownContent(prev => prev + '\n\n' + redactionResult);
                        setShowRedactionModal(false);
                      }
                    }}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white"
                  >
                    Insert into Report
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
