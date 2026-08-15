import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useToast } from '../../components/Toast';
import { useModal } from '../../components/Modal';

// Dynamically import Terminal component with SSR disabled (xterm.js requires browser environment)
const Terminal = dynamic(() => import('../../components/Terminal'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-gray-900 text-gray-400">
      Loading terminal...
    </div>
  )
});

export default function ProjectDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [newItem, setNewItem] = useState({});
  const [showEditModal, setShowEditModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [showItemEditModal, setShowItemEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editingItemType, setEditingItemType] = useState('');
  const [showToolExecutionModal, setShowToolExecutionModal] = useState(false);
  const [selectedTool, setSelectedTool] = useState(null);
  const [selectedTargets, setSelectedTargets] = useState([]);
  const [executionResults, setExecutionResults] = useState([]);
  const [showTerminal, setShowTerminal] = useState(false);
  const [currentExecutionId, setCurrentExecutionId] = useState(null);
  const [executionHistory, setExecutionHistory] = useState([]);
  const [currentToolName, setCurrentToolName] = useState('');
  const [toolNamesCache, setToolNamesCache] = useState({}); // Cache tool names by ID
  const [executionPage, setExecutionPage] = useState(1);
  const [executionsPerPage, setExecutionsPerPage] = useState(10);
  const [debugMessages, setDebugMessages] = useState([]); // Debug messages for execution progress
  const [isSaving, setIsSaving] = useState(false); // Prevent duplicate submissions
  const [scanningTargets, setScanningTargets] = useState(new Set()); // Track which targets are being scanned
  const [viewingFinding, setViewingFinding] = useState(null);

  const toast = useToast();
  const { confirm } = useModal();

  // Extract last scan timestamp from notes
  const extractLastScanFromNotes = (notes) => {
    if (!notes || !notes.includes('[Scan')) {
      return null;
    }
    
    // Find all scan lines
    const scanLines = notes.split('\n').filter(line => line.trim().includes('[Scan'));
    if (scanLines.length === 0) {
      return null;
    }
    
    // Get the last scan line
    const lastScanLine = scanLines[scanLines.length - 1].trim();
    
    // Extract timestamp from [Scan YYYY-MM-DD HH:MM:SS] format
    const match = lastScanLine.match(/\[Scan\s+([^\]]+)\]/);
    if (match) {
      const timestampStr = match[1].trim();
      try {
        // Parse the timestamp (format: YYYY-MM-DD HH:MM:SS)
        // Convert to ISO format: YYYY-MM-DDTHH:MM:SS
        const isoStr = timestampStr.replace(' ', 'T');
        const dt = new Date(isoStr);
        if (!isNaN(dt.getTime())) {
          return dt.toISOString();
        }
      } catch (e) {
        // If parsing fails, return null
        return null;
      }
    }
    return null;
  };

  useEffect(() => {
    if (id) {
      loadProject();
    }
  }, [id]);

  // Add page visibility change listener to reload data when user returns to page
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && id) {
        loadProject();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [id]);

  const loadProject = async () => {
    try {
      const response = await fetch(`http://localhost:8002/api/v1/projects/${id}`);
      if (response.ok) {
        const data = await response.json();
        
        // Load discovered users for this project
        let discoveredUsers = [];
        try {
          const usersResponse = await fetch(`http://localhost:8002/api/v1/projects/${id}/discovered-users`);
          if (usersResponse.ok) {
            discoveredUsers = await usersResponse.json();
          }
        } catch (error) {
          console.error('Failed to load discovered users:', error);
        }
        
        // Load discovered files for this project
        let discoveredFiles = [];
        try {
          const filesResponse = await fetch(`http://localhost:8002/api/v1/projects/${id}/discovered-files`);
          if (filesResponse.ok) {
            discoveredFiles = await filesResponse.json();
          }
        } catch (error) {
          console.error('Failed to load discovered files:', error);
        }
        
        // Ensure all necessary properties have default values
        // Filter tools to only include those that are active and belong to this project or are global
        const projectTools = (data.tools || []).filter(tool => {
          // Only show active tools
          if (tool.is_active === false) return false;
          // Include tools that belong to this project
          const toolProjectId = tool.project_id;
          const currentProjectId = parseInt(id);
          return toolProjectId === currentProjectId || toolProjectId === null || toolProjectId === undefined;
        });
        
        const projectData = {
          ...data,
          targets: data.targets || [],
          findings: data.findings || [],
          tools: projectTools,  // Use filtered tools instead of raw data.tools
          users: data.users || [],
          discovered_users: discoveredUsers,
          discovered_files: discoveredFiles
        };
        setProject(projectData);
      } else {
        setProject(null);
      }
    } catch (error) {
      console.error('Failed to load project:', error);
      setProject(null);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTarget = () => {
    setModalType('target');
    setNewItem({ name: '', type: 'IP', description: '' });
    setShowAddModal(true);
  };

  const handleAddFinding = () => {
    setModalType('finding');
    setNewItem({ 
      title: '', 
      severity: 'Medium', 
      description: '', 
      status: 'open',
      target_id: ''  // Add target_id field
    });
    setShowAddModal(true);
  };

  const handleAddTool = () => {
    setModalType('tool');
    setNewItem({ 
      name: '', 
      description: '', 
      command: '', 
      category: 'general',
      selected_targets: []  // Initialize selected_targets for new tools
    });
    setShowAddModal(true);
  };

  const handleSaveItem = async () => {
    if (!project) return;
    if (isSaving) {
      console.warn('⚠️ Already saving, ignoring duplicate submission');
      return;
    }
    setIsSaving(true);

    // Get the correct array name based on modalType
    const arrayName = modalType === 'file' ? 'discovered_files' : modalType + 's';
    const itemsArray = project[arrayName] || [];
    
    // Handle empty array case
    const newId = itemsArray.length > 0 
      ? Math.max(...itemsArray.map(item => item.id), 0) + 1 
      : 1;
    const itemToAdd = {
      id: newId,
      ...newItem,
      created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
    };

    // Update local state
    setProject(prev => ({
      ...prev,
      [arrayName]: [...(prev[arrayName] || []), itemToAdd]
    }));

    // Call backend API to save to project data
    try {
      if (modalType === 'target') {
        // Save to project targets
        const projectResponse = await fetch(`http://localhost:8002/api/v1/projects/${id}/targets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            target_type: newItem.type.toLowerCase(),
            target_value: newItem.name,
            priority: 5, // Use number instead of string
            notes: newItem.description || ''
          })
        });
        
        if (projectResponse.ok) {
          console.log('Target added to project successfully');
          // Reload project data to get latest targets
          await loadProject();

          // Notify other pages (like knowledge graph) that project data has been updated
          window.dispatchEvent(new CustomEvent('projectDataUpdated', {
            detail: {
              projectId: parseInt(id),
              updatedItemType: 'targets',
              updatedItemId: newId,
              action: 'created'
            }
          }));
        } else {
          console.error('Failed to add target to project');
        }

        // Also add to Neo4j graph
        const neo4jResponse = await fetch(`http://localhost:8002/api/v1/neo4j/graph/${id}/target`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: newId.toString(),
            name: newItem.name,
            type: newItem.type,
            ip: newItem.type === 'IP' ? newItem.name : null,
            domain: newItem.type === 'Domain' ? newItem.name : null,
            status: 'active',
            last_scan: new Date().toISOString()
          })
        });
        
        if (neo4jResponse.ok) {
          console.log('Target added to Neo4j graph successfully');
        } else {
          console.error('Failed to add target to Neo4j graph');
        }
      } else if (modalType === 'finding') {
        // Save to project findings with target_id
        // Convert empty string to null for target_id
        const targetIdForFinding = newItem.target_id && newItem.target_id !== '' 
          ? parseInt(newItem.target_id) 
          : null;
        
        const projectResponse = await fetch(`http://localhost:8002/api/v1/projects/${id}/findings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: newItem.title,
            description: newItem.description,
            severity: newItem.severity,
            status: newItem.status,
            target_id: targetIdForFinding,  // Convert to integer or null
            discovered_at: new Date().toISOString()
          })
        });
        
        if (projectResponse.ok) {
          const findingData = await projectResponse.json();
          console.log('Finding added to project successfully');
          
          // Note: Knowledge Graph sync is handled automatically by backend (kg_auto_sync)
          // No need to manually call Neo4j API - it would create duplicates
          
          // Reload project data to get latest findings
          await loadProject();

          // Notify other pages (like knowledge graph) that project data has been updated
          window.dispatchEvent(new CustomEvent('projectDataUpdated', {
            detail: {
              projectId: parseInt(id),
              updatedItemType: 'findings',
              updatedItemId: findingData.id || newId,
              action: 'created'
            }
          }));
        } else {
          console.error('Failed to add finding to project');
        }
      } else if (modalType === 'tool') {
        // Prepare parameters with selected_targets
        const toolParameters = {};
        if (newItem.selected_targets && newItem.selected_targets.length > 0) {
          toolParameters.selected_targets = newItem.selected_targets.map(id => parseInt(id));
        } else {
          toolParameters.selected_targets = [];
        }
        
        // Save to project tools
        const projectResponse = await fetch(`http://localhost:8002/api/v1/projects/${id}/tools`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: newItem.name,
            description: newItem.description || '',
            command: newItem.command,
            category: newItem.category || 'general',
            parameters: toolParameters
          })
        });
        
        if (projectResponse.ok) {
          console.log('Tool added to project successfully');
          // Reload project data to get latest tools
          await loadProject();
          
          // Dispatch custom event to notify other pages (like /tools)
          // Convert id to string to ensure consistent comparison
          const projectIdStr = String(id);
          console.log('Dispatching toolCreated event for project:', projectIdStr);
          
          // Use setTimeout to ensure event is dispatched after DOM updates
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('toolCreated', { 
              detail: { projectId: projectIdStr },
              bubbles: true,
              cancelable: true
            }));
            
            // Also trigger storage change for cross-tab communication
            localStorage.setItem('toolListUpdated', Date.now().toString());
          }, 100);
        } else {
          console.error('Failed to add tool to project');
        }
      } else if (modalType === 'user') {
        // Save discovered user
        const userResponse = await fetch(`http://localhost:8002/api/v1/projects/${id}/discovered-users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            project_id: parseInt(id),  // Required field!
            username: newItem.username,
            full_name: newItem.full_name || null,
            email: newItem.email || null,
            domain: newItem.domain || null,
            privilege_level: newItem.privilege_level || 'user',
            account_status: newItem.account_status || 'active',
            password_plaintext: newItem.password_plaintext || null,
            target_id: newItem.target_id ? parseInt(newItem.target_id) : null,
            source: newItem.source || 'manual',
            notes: newItem.notes || null,
            severity: newItem.severity || 'medium'
          })
        });
        
        if (userResponse.ok) {
          console.log('Discovered user added successfully - will appear in Knowledge Graph!');
          // Reload project data to get latest users
          await loadProject();

          // Notify other pages (like knowledge graph) that project data has been updated
          window.dispatchEvent(new CustomEvent('projectDataUpdated', {
            detail: {
              projectId: parseInt(id),
              updatedItemType: 'users',
              updatedItemId: newId,
              action: 'created'
            }
          }));

          toast.success('User added successfully! This user will now appear in Project Details, Discovered Users tab, and Knowledge Graph with automatic relationships.');
        } else {
          const errorData = await userResponse.json();
          console.error('Failed to add discovered user:', errorData);
          
          // Format error message
          let errorMsg = 'Failed to add user:\n\n';
          if (errorData.detail) {
            if (Array.isArray(errorData.detail)) {
              // Pydantic validation errors
              errorData.detail.forEach(err => {
                errorMsg += `• ${err.loc.join(' → ')}: ${err.msg}\n`;
              });
            } else if (typeof errorData.detail === 'string') {
              errorMsg += errorData.detail;
            } else {
              errorMsg += JSON.stringify(errorData.detail);
            }
          } else {
            errorMsg += 'Unknown error';
          }
          
          toast.error(errorMsg);
        }
      } else if (modalType === 'file') {
        // Save discovered file
        const fileResponse = await fetch(`http://localhost:8002/api/v1/projects/${id}/discovered-files`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            project_id: parseInt(id),
            target_id: newItem.target_id ? parseInt(newItem.target_id) : null,
            filename: newItem.filename,
            file_path: newItem.file_path,
            file_type: newItem.file_type || 'document',
            file_size: newItem.file_size ? parseInt(newItem.file_size) : null,
            file_hash: newItem.file_hash || null,
            content_preview: newItem.content_preview || null,
            content_analysis: newItem.content_analysis || null,
            source: newItem.source || 'manual',
            severity: newItem.severity || 'info',
            notes: newItem.notes || null,
            tags: newItem.tags ? newItem.tags.split(',').map(tag => tag.trim()) : [],
            is_sensitive: newItem.is_sensitive || 'false'
          })
        });
        
        if (fileResponse.ok) {
          console.log('Discovered file added successfully - will appear in Knowledge Graph!');
          // Reload project data to get latest files
          await loadProject();

          // Notify other pages (like knowledge graph) that project data has been updated
          window.dispatchEvent(new CustomEvent('projectDataUpdated', {
            detail: {
              projectId: parseInt(id),
              updatedItemType: 'files',
              updatedItemId: newId,
              action: 'created'
            }
          }));

          toast.success('File added successfully! This file will now appear in Project Details, Discovered Files tab, and Knowledge Graph with automatic relationships.');
        } else {
          const errorData = await fileResponse.json();
          console.error('Failed to add discovered file:', errorData);
          
          // Format error message
          let errorMsg = 'Failed to add file:\n\n';
          if (errorData.detail) {
            if (Array.isArray(errorData.detail)) {
              // Pydantic validation errors
              errorData.detail.forEach(err => {
                errorMsg += `• ${err.loc.join(' → ')}: ${err.msg}\n`;
              });
            } else if (typeof errorData.detail === 'string') {
              errorMsg += errorData.detail;
            } else {
              errorMsg += JSON.stringify(errorData.detail);
            }
          } else {
            errorMsg += 'Unknown error';
          }
          
          toast.error(errorMsg);
        }
      }
    } catch (error) {
      console.error('Error saving item:', error);
      toast.error('Failed to save item. Please try again.');
    } finally {
      setIsSaving(false);
      setShowAddModal(false);
      setNewItem({});
    }
  };

  const handleEditItem = (type, item) => {
    // Initialize editingItem with proper structure
    const editingData = { ...item };
    
    // For tools, ensure selected_targets is initialized from parameters
    if (type === 'tools') {
      // Load selected_targets from parameters if it exists
      if (editingData.parameters && editingData.parameters.selected_targets) {
        editingData.selected_targets = Array.isArray(editingData.parameters.selected_targets) 
          ? editingData.parameters.selected_targets 
          : [];
      } else {
        editingData.selected_targets = [];
      }
      // If command_template exists but command doesn't, use command_template
      if (editingData.command_template && !editingData.command) {
        editingData.command = editingData.command_template;
      }
    }
    
    setEditingItem(editingData);
    setEditingItemType(type);
    setShowItemEditModal(true);
  };

  const handleSaveEditedItem = async () => {
    if (!editingItem) return;

    try {
      // Call backend API to update project
      let updateUrl = '';
      let updateBody = editingItem;
      
      if (editingItemType === 'targets') {
        updateUrl = `http://localhost:8002/api/v1/projects/${id}/targets/${editingItem.id}`;
      } else if (editingItemType === 'findings') {
        updateUrl = `http://localhost:8002/api/v1/projects/${id}/findings/${editingItem.id}`;
          // Format finding data for API
          updateBody = {
            title: editingItem.title,
            description: editingItem.description,
            severity: editingItem.severity,
            status: editingItem.status,
            target_id: editingItem.target_id ? parseInt(editingItem.target_id) : null
          };
      } else if (editingItemType === 'tools') {
        updateUrl = `http://localhost:8002/api/v1/projects/${id}/tools/${editingItem.id}`;
        // Format tool data for API
        // Save selected_targets in parameters
        const toolParameters = { ...(editingItem.parameters || {}) };
        if (editingItem.selected_targets && editingItem.selected_targets.length > 0) {
          toolParameters.selected_targets = editingItem.selected_targets.map(id => parseInt(id));
        } else {
          // Clear selected_targets if none selected
          toolParameters.selected_targets = [];
        }
        
        updateBody = {
          name: editingItem.name,
          description: editingItem.description || '',
          command: editingItem.command || editingItem.command_template || '',
          category: editingItem.category || 'general',
          parameters: toolParameters
        };
      } else if (editingItemType === 'users') {
        updateUrl = `http://localhost:8002/api/v1/projects/${id}/discovered-users/${editingItem.id}`;
        // Format user data for API
        updateBody = {
          username: editingItem.username,
          full_name: editingItem.full_name || null,
          email: editingItem.email || null,
          domain: editingItem.domain || null,
          privilege_level: editingItem.privilege_level || 'user',
          account_status: editingItem.account_status || 'active',
          password_plaintext: editingItem.password_plaintext || null,
          target_id: editingItem.target_id ? parseInt(editingItem.target_id) : null,
          source: editingItem.source || 'manual',
          notes: editingItem.notes || null,
          severity: editingItem.severity || 'medium'
        };
      } else if (editingItemType === 'files') {
        updateUrl = `http://localhost:8002/api/v1/projects/${id}/discovered-files/${editingItem.id}`;
        // Format file data for API
        updateBody = {
          filename: editingItem.filename,
          file_path: editingItem.file_path,
          file_type: editingItem.file_type,
          file_size: editingItem.file_size ? parseInt(editingItem.file_size) : null,
          file_hash: editingItem.file_hash || null,
          content_preview: editingItem.content_preview || null,
          content_analysis: editingItem.content_analysis || null,
          source: editingItem.source || 'manual',
          severity: editingItem.severity || 'info',
          notes: editingItem.notes || null,
          tags: editingItem.tags,
          is_sensitive: editingItem.is_sensitive || 'false',
          target_id: editingItem.target_id ? parseInt(editingItem.target_id) : null
        };
      }

      if (updateUrl) {
        const response = await fetch(updateUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateBody)
        });

        if (response.ok) {
          console.log(`${editingItemType} updated successfully`);
          // Reload project data
          await loadProject();

          // Notify other pages (like knowledge graph) that project data has been updated
          window.dispatchEvent(new CustomEvent('projectDataUpdated', {
            detail: {
              projectId: parseInt(id),
              updatedItemType: editingItemType,
              updatedItemId: editingItem.id,
              action: 'updated'
            }
          }));

          toast.success(`${editingItemType} updated successfully!`);
        } else {
          const errorData = await response.json();
          console.error(`Failed to update ${editingItemType}:`, errorData);
          toast.error(`Failed to update ${editingItemType}: ${errorData.detail || 'Unknown error'}`);
        }
      }
    } catch (error) {
      console.error(`Error updating ${editingItemType}:`, error);
      toast.error(`Error updating ${editingItemType}. Please try again.`);
    }

    setShowItemEditModal(false);
    setEditingItem(null);
    setEditingItemType('');
  };

  const handleScanTarget = async (target) => {
    if (scanningTargets.has(target.id)) {
      return; // Already scanning
    }
    
    try {
      setScanningTargets(prev => new Set(prev).add(target.id));
      
      const token = localStorage.getItem('token');
      const response = await fetch(
        `http://localhost:8002/api/v1/projects/${id}/targets/${target.id}/scan`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
          }
        }
      );
      
      if (response.ok) {
        const result = await response.json();
        
        if (!result) {
          console.error('Scan response is null or empty');
          toast.warning('Scan completed but received invalid response. Please refresh the page.');
          return;
        }
        
        // Wait a moment for backend to commit the changes
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Reload project to show updated status and last_scan
        await loadProject();
        
        // Show visual feedback
        if (result && result.online !== undefined) {
          if (result.online) {
            // Success - target is online
            console.log(`✅ ${target.target_value} is online`);
          } else {
            // Target is offline
            console.log(`❌ ${target.target_value} is offline`);
          }
        }
      } else {
        let errorMessage = 'Unknown error';
        try {
          const error = await response.json();
          errorMessage = error.detail || error.message || JSON.stringify(error);
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        console.error('Scan failed:', errorMessage);
        toast.error(`Scan failed: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error scanning target:', error);
      toast.error(`Error scanning target: ${error.message || 'Please try again.'}`);
    } finally {
      setScanningTargets(prev => {
        const newSet = new Set(prev);
        newSet.delete(target.id);
        return newSet;
      });
    }
  };

  const handleDeleteItem = async (type, itemId) => {
    const confirmed = await confirm({
      title: 'Delete Item',
      message: `Are you sure you want to delete this ${type}?`,
      confirmText: 'Delete',
      variant: 'danger'
    });
    if (!confirmed) {
      return;
    }
    
    try {
      // Call backend API to delete project
      let deleteUrl = '';
      if (type === 'targets') {
        deleteUrl = `http://localhost:8002/api/v1/projects/${id}/targets/${itemId}`;
      } else if (type === 'findings') {
        deleteUrl = `http://localhost:8002/api/v1/projects/${id}/findings/${itemId}`;
      } else if (type === 'tools') {
        deleteUrl = `http://localhost:8002/api/v1/projects/${id}/tools/${itemId}`;
      } else if (type === 'users') {
        deleteUrl = `http://localhost:8002/api/v1/projects/${id}/discovered-users/${itemId}`;
      } else if (type === 'files') {
        deleteUrl = `http://localhost:8002/api/v1/projects/${id}/discovered-files/${itemId}`;
      }

      if (deleteUrl) {
        const response = await fetch(deleteUrl, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          }
        });

        if (response.ok) {
          console.log(`${type} deleted successfully`);
          // Reload project data
          await loadProject();

          // Notify other pages (like knowledge graph) that project data has been updated
          window.dispatchEvent(new CustomEvent('projectDataUpdated', {
            detail: {
              projectId: parseInt(id),
              updatedItemType: type,
              updatedItemId: itemId,
              action: 'deleted'
            }
          }));

          toast.success(`${type} deleted successfully!`);
        } else {
          console.error(`Failed to delete ${type}`);
          toast.error(`Failed to delete ${type}. Please try again.`);
        }
      }
    } catch (error) {
      console.error(`Error deleting ${type}:`, error);
      toast.error(`Error deleting ${type}. Please try again.`);
    }
  };

  const handleRunTool = (toolId) => {
    // Find the tool
    const tool = project.tools.find(t => t.id === toolId);
    if (!tool) {
      toast.warning('Tool not found');
      return;
    }

    // Check if there are targets
    if (!project.targets || project.targets.length === 0) {
      toast.warning('No targets available. Please add targets first.');
      return;
    }

    // Open the tool execution modal
    setSelectedTool(tool);
    setSelectedTargets([]);
    setExecutionResults([]);
    setShowToolExecutionModal(true);
  };

  const loadExecutionHistory = async () => {
    if (!id) {
      console.warn('Cannot load execution history: project id is missing');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const url = `http://localhost:8002/api/v1/tools/projects/${id}/tools/executions`;
      console.log('Loading execution history from:', url);
      
      const response = await fetch(url, {
        headers: headers
      });

      console.log('Execution history response status:', response.status);

      if (response.ok) {
        const executions = await response.json();
        console.log('Loaded executions:', executions);
        setExecutionHistory(Array.isArray(executions) ? executions : []);
        
        // Load tool names for any missing tools
        if (Array.isArray(executions) && executions.length > 0) {
          const toolIds = executions
            .map(e => e.tool_id)
            .filter(id => id && !toolNamesCache[id] && !project?.tools?.find(t => Number(t.id) === Number(id)));
          
          if (toolIds.length > 0) {
            // Fetch missing tools
            try {
              const toolsResponse = await fetch(`http://localhost:8002/api/v1/tools?project_id=${id}`, {
                headers: headers
              });
              if (toolsResponse.ok) {
                const allTools = await toolsResponse.json();
                const newCache = {};
                allTools.forEach(tool => {
                  newCache[tool.id] = tool.name;
                });
                setToolNamesCache(prev => ({ ...prev, ...newCache }));
              }
            } catch (err) {
              console.error('Error loading tool names:', err);
            }
          }
        }
      } else {
        const errorText = await response.text();
        console.error('Failed to load execution history:', response.status, errorText);
        setExecutionHistory([]);
      }
    } catch (error) {
      console.error('Error loading execution history:', error);
      setExecutionHistory([]);
    }
  };

  useEffect(() => {
    if (id) {
      loadExecutionHistory();
    }
  }, [id]);

  // Reload execution history when switching to tools tab
  useEffect(() => {
    if (id && activeTab === 'tools') {
      loadExecutionHistory();
    }
  }, [activeTab, id]);

  // Helper function to format time for debug messages
  const formatTime = (date) => {
    const d = new Date(date);
    const hours = d.getHours() % 12 || 12;
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
    return `${hours}:${minutes} ${ampm}`;
  };

  // Helper function to add debug message
  const addDebugMessage = (message, icon = '') => {
    const timestamp = formatTime(new Date());
    setDebugMessages(prev => [...prev, { timestamp, message, icon }]);
  };

  // Poll execution status to update debug messages
  const pollExecutionStatus = async (executionIds, executionTargetsMap) => {
    const token = localStorage.getItem('token');
    const headers = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const maxAttempts = 300; // 5 minutes max (1 second intervals)
    let attempts = 0;
    const completedExecutions = new Set();

    const poll = setInterval(async () => {
      attempts++;
      
      for (const execId of executionIds) {
        if (completedExecutions.has(execId)) continue;

        try {
          const response = await fetch(`http://localhost:8002/api/v1/tools/executions/${execId}`, {
            headers
          });

          if (response.ok) {
            const execution = await response.json();
            
            if (execution.execution_status === 'completed' || execution.execution_status === 'failed') {
              completedExecutions.add(execId);
              
              const timestamp = formatTime(execution.updated_at || new Date());
              const statusText = execution.execution_status === 'completed' ? '[COMPLETED]' : '[FAILED]';
              
              // Get target name from the map we passed in
              const targetName = executionTargetsMap[execId] || 'Unknown';
              
              addDebugMessage(`============================================================ ${statusText} Target: ${targetName}`);
              addDebugMessage(`Command: ${execution.command_executed || execution.command || 'N/A'}`);
              
              if (execution.output) {
                const outputText = execution.output.trim();
                addDebugMessage(`[OUTPUT] ${outputText.substring(0, 200)}${outputText.length > 200 ? '...' : ''}`);
              }
              
              addDebugMessage(`Exit Code: ${execution.exit_code || 0} ===========================================================`);
              
              // Dispatch event to notify dashboard and other components
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('toolExecutionCompleted', {
                  detail: {
                    executionId: execId,
                    status: execution.execution_status,
                    projectId: execution.project_id
                  }
                }));
              }
              
              // If all executions are completed, show final message
              if (completedExecutions.size === executionIds.length) {
                addDebugMessage(`✅ All ${executionIds.length} execution(s) completed!`);
                clearInterval(poll);
                return;
              }
            }
          }
        } catch (error) {
          console.error(`Error polling execution ${execId}:`, error);
        }
      }

      // Stop polling after max attempts
      if (attempts >= maxAttempts) {
        clearInterval(poll);
      }
    }, 1000); // Poll every second

    return poll;
  };

  const handleExecuteTool = async () => {
    if (selectedTargets.length === 0) {
      toast.warning('Please select at least one target');
      return;
    }

    if (!selectedTool || !project) {
      toast.warning('Please select a tool and ensure project is loaded');
      return;
    }

    try {
      // Clear previous debug messages
      setDebugMessages([]);
      
      // Add initial debug message
      if (selectedTargets.length === 1) {
        addDebugMessage(`Starting test for target: ${selectedTargets[0].target_value || selectedTargets[0].name}...`);
      } else {
        addDebugMessage(`Starting test for ${selectedTargets.length} target(s)...`);
      }

      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Execute tool via API for each selected target
      let firstExecutionId = null;
      const executionIds = [];
      const executionTargetsMap = {}; // Map execution ID to target name
      
      for (let index = 0; index < selectedTargets.length; index++) {
        const target = selectedTargets[index];
        const targetName = target.target_value || target.name;
        
        // Build command from template
        let command = selectedTool.command_template || selectedTool.command || '';
        command = command
          .replace(/{target}/g, targetName)
          .replace(/{port}/g, target.port || '80')
          .replace(/{protocol}/g, target.protocol || 'http')
          .replace(/{output}/g, `/tmp/${project.id}_${selectedTool.id}_${target.id}.txt`);

        // Create execution data
        const executionData = {
          tools: [{
            tool_id: selectedTool.id,
            target_id: target.id,
            parameters: {
              target: targetName,
              command: command
            }
          }],
          parameters: {
            target: targetName
          }
        };

        // Call backend API to execute tool (real execution)
        const response = await fetch(`http://localhost:8002/api/v1/tools/projects/${project.id}/tools/execute`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(executionData)
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Failed to execute tool for target ${targetName}: ${errorText}`);
          
          addDebugMessage(`❌ Execution failed for ${targetName}: ${errorText}`);
          
          // Add to results as failed
          setExecutionResults(prev => [...prev, {
            target: targetName,
            command: command,
            status: 'failed',
            output: `Error: ${errorText}`
          }]);
        } else {
          const executionResult = await response.json();
          
          // Track first execution ID for terminal display
          if (index === 0) {
            firstExecutionId = executionResult.id;
          }
          
          // Map execution ID to target name for polling
          executionTargetsMap[executionResult.id] = targetName;
          
          // Add debug message for execution start
          addDebugMessage(`✓ Execution started for ${targetName} (ID: ${executionResult.id})`);
          executionIds.push(executionResult.id);
          
          // Dispatch event to notify dashboard and other components
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('toolExecutionCreated', {
              detail: {
                executionId: executionResult.id,
                toolId: selectedTool.id,
                toolName: selectedTool.name,
                projectId: project.id
              }
            }));
          }
          
          // Add to results as pending (real execution happens in background)
          setExecutionResults(prev => [...prev, {
            target: targetName,
            command: command,
            status: 'running',
            executionId: executionResult.id,
            output: `Tool execution started (ID: ${executionResult.id}). Check execution history for results.`
          }]);
        }
      }
      
      // Add message about waiting for results
      if (executionIds.length > 0) {
        addDebugMessage(`⏳ Executing commands for ${executionIds.length} target(s). Waiting for results...`);
        
        // Start polling for execution status with target map
        pollExecutionStatus(executionIds, executionTargetsMap);
      }
      
      // After all executions are started, open terminal with first execution
      if (firstExecutionId) {
        // Wait a bit for backend to fully process execution before opening terminal
        setTimeout(() => {
          setCurrentExecutionId(firstExecutionId);
          setCurrentToolName(selectedTool.name);
          setShowTerminal(true);
          setShowToolExecutionModal(false); // Close modal when showing terminal
          // Refresh execution history after terminal is ready
          setTimeout(() => {
            loadExecutionHistory();
          }, 1000);
        }, 800);
      }
    } catch (error) {
      console.error('Error executing tool:', error);
      toast.error(`Error executing tool: ${error.message}`);
    }
  };

  const toggleTargetSelection = (target) => {
    setSelectedTargets(prev => {
      const isSelected = prev.some(t => t.id === target.id);
      if (isSelected) {
        return prev.filter(t => t.id !== target.id);
      } else {
        return [...prev, target];
      }
    });
  };

  const selectAllTargets = () => {
    if (selectedTargets.length === project.targets.length) {
      setSelectedTargets([]);
    } else {
      setSelectedTargets([...project.targets]);
    }
  };

  const [generatingReport, setGeneratingReport] = useState(false);
  const [projectReports, setProjectReports] = useState([]);

  const loadProjectReports = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`http://localhost:8002/api/v1/reports/project/${id}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setProjectReports(data || []);
      }
    } catch (e) {
      console.error('Error loading reports:', e);
    }
  };

  useEffect(() => {
    if (id && activeTab === 'reports') {
      loadProjectReports();
    }
  }, [id, activeTab]);

  const handleGenerateReport = async (reportType) => {
    const typeMap = {
      'Executive Summary': 'executive',
      'Technical Report': 'technical',
      'Vulnerability Assessment': 'vulnerability_assessment',
      'Penetration Test': 'pentest',
      'Custom Report': 'custom'
    };

    setGeneratingReport(true);
    toast.info(`Generating ${reportType}...`);
    try {
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const formData = new FormData();
      formData.append('project_id', String(id));
      formData.append('title', `${reportType} - ${project?.name || 'Project'}`);
      formData.append('report_type', typeMap[reportType] || 'executive');
      formData.append('include_all_executions', 'true');
      formData.append('include_all_findings', 'true');

      const res = await fetch('http://localhost:8002/api/v1/reports/generate', {
        method: 'POST',
        headers,
        body: formData
      });

      if (res.ok) {
        const report = await res.json();
        toast.success('Report generated successfully!');
        router.push(`/reports/${report.id}`);
      } else {
        const error = await res.json().catch(() => ({}));
        toast.error(`Failed to generate report: ${error.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error generating report:', error);
      toast.error(`Error: ${error.message}`);
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleEditProject = () => {
    setShowEditModal(true);
  };

  const handleRunScan = () => {
    setShowScanModal(true);
  };

  const handleSaveProject = () => {
    // Simulate saving project changes
    setProject(prev => ({
      ...prev,
      updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
    }));
    setShowEditModal(false);
    toast.success('Project updated successfully!');
  };

  const handleStartScan = () => {
    setIsScanning(true);
    setScanProgress(0);
    
    // Simulate scan progress
    const interval = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsScanning(false);
          setShowScanModal(false);
          toast.success('Scan completed successfully!');
          return 100;
        }
        return prev + 10;
      });
    }, 500);
  };

  const handleCancelScan = () => {
    setIsScanning(false);
    setScanProgress(0);
    setShowScanModal(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Loading project...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Project Not Found</h1>
          <Link href="/projects" className="text-blue-400 hover:text-blue-300">
            ← Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'High': return 'bg-red-900 text-red-300';
      case 'Medium': return 'bg-yellow-900 text-yellow-300';
      case 'Low': return 'bg-green-900 text-green-300';
      default: return 'bg-gray-700 text-gray-300';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-900 text-green-300';
      case 'discovered': return 'bg-blue-900 text-blue-300';
      case 'completed': return 'bg-gray-700 text-gray-300';
      case 'running': return 'bg-yellow-900 text-yellow-300';
      case 'open': return 'bg-red-900 text-red-300';
      case 'closed': return 'bg-gray-700 text-gray-300';
      default: return 'bg-gray-700 text-gray-300';
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Head>
        <title>{project.name} - BountyFlow</title>
      </Head>

      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/projects" className="text-blue-400 hover:text-blue-300">
              ← Back to Projects
            </Link>
            <div>
              <h1 className="text-2xl font-bold">{project.name || 'Untitled Project'}</h1>
              <p className="text-gray-400">{project.company_name || project.company || 'No Company'}</p>
            </div>
          </div>
          <div className="flex space-x-2">
            <button 
              onClick={handleEditProject}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
            >
              Edit Project
            </button>
            <button 
              onClick={loadProject}
              className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg"
              title="Refresh project data"
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="px-6">
          <nav className="flex space-x-8">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'targets', label: 'Targets' },
              { id: 'users', label: 'Discovered Users' },
              { id: 'files', label: 'Discovered Files' },
              { id: 'findings', label: 'Findings' },
              { id: 'tools', label: 'Tools' },
              { id: 'reports', label: 'Reports' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Project Info */}
            <div className="lg:col-span-2">
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                <h2 className="text-xl font-semibold mb-4">Project Information</h2>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-gray-400">Description</label>
                    <p className="text-white">{project.description || 'No description'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-gray-400">Status</label>
                      <p className="text-white capitalize">{project.status || 'Unknown'}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">Created</label>
                      <p className="text-white">{project.created_at || 'Unknown'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="space-y-6">
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                <h3 className="text-lg font-semibold mb-4">Statistics</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Targets</span>
                    <span className="text-white font-medium">{project.targets?.length || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Findings</span>
                    <span className="text-white font-medium">{project.findings?.length || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Tools Used</span>
                    <span className="text-white font-medium">{project.tools?.length || 0}</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center text-gray-300">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                    <span>Last scan completed</span>
                  </div>
                  <div className="flex items-center text-gray-300">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full mr-3"></div>
                    <span>New vulnerability found</span>
                  </div>
                  <div className="flex items-center text-gray-300">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                    <span>Tool execution started</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'targets' && (
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Targets</h2>
                <button 
                  onClick={handleAddTarget}
                  className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
                >
                  Add Target
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Target</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Last Scan</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {(project.targets || []).map((target) => (
                    <tr key={target.id} className="hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-white">{target.target_value}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-medium bg-gray-700 text-gray-300 rounded-full">
                          {target.target_type?.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(target.status)}`}>
                          {target.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {(() => {
                          // Try to get last_scan from backend, or extract from notes
                          const lastScan = target.last_scan || extractLastScanFromNotes(target.notes);
                          return lastScan ? new Date(lastScan).toLocaleString() : <span className="text-gray-500">Never scanned</span>;
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-3">
                          <button
                            onClick={() => handleScanTarget(target)}
                            disabled={scanningTargets.has(target.id)}
                            className={`${
                              scanningTargets.has(target.id)
                                ? 'text-gray-500 cursor-not-allowed opacity-50'
                                : 'text-green-400 hover:text-green-300'
                            }`}
                            title="Scan target"
                          >
                            {scanningTargets.has(target.id) ? (
                              <>
                                <i className="fas fa-spinner fa-spin mr-1"></i>
                                Scanning...
                              </>
                            ) : (
                              <>
                                🔍 Scan
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => handleEditItem('targets', target)}
                            className="text-yellow-400 hover:text-yellow-300"
                            title="Edit target"
                          >
                            ✏ Edit
                          </button>
                          <button
                            onClick={() => handleDeleteItem('targets', target.id)}
                            className="text-red-400 hover:text-red-300"
                            title="Delete target"
                          >
                            🗑 Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">👥 Discovered Users</h2>
                <button 
                  onClick={() => {
                    setModalType('user');
                    setShowAddModal(true);
                    setNewItem({
                      username: '',
                      domain: '',
                      privilege_level: 'user',
                      target_id: '',
                      password_plaintext: '',
                      notes: ''
                    });
                  }}
                  className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg transition-colors"
                >
                  <i className="fas fa-plus mr-2"></i>
                  Add Discovered User
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              {(project.discovered_users && project.discovered_users.length > 0) ? (
                <table className="w-full">
                  <thead className="bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Username</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Domain</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Privilege</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Target</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Credential</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Severity</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {project.discovered_users.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-700">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-white">{user.username}</div>
                          {user.full_name && <div className="text-xs text-gray-400">{user.full_name}</div>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                          {user.domain || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            user.privilege_level === 'admin' ? 'bg-red-900 text-red-300' :
                            user.privilege_level === 'user' ? 'bg-blue-900 text-blue-300' :
                            'bg-gray-700 text-gray-300'
                          }`}>
                            {user.privilege_level || 'user'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                          {user.target_value || 'Multiple'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {user.password_plaintext ? (
                            <span className="text-xs bg-yellow-900 text-yellow-300 px-2 py-1 rounded">
                              ⚠️ Password Found
                            </span>
                          ) : (
                            <span className="text-xs text-gray-500">No credential</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            user.severity === 'critical' ? 'bg-red-900 text-red-300' :
                            user.severity === 'high' ? 'bg-orange-900 text-orange-300' :
                            user.severity === 'medium' ? 'bg-yellow-900 text-yellow-300' :
                            'bg-gray-700 text-gray-300'
                          }`}>
                            {user.severity || 'low'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleEditItem('users', user)}
                              className="text-yellow-400 hover:text-yellow-300"
                            >
                              Edit
                            </button>
                            <button 
                              onClick={() => handleDeleteItem('users', user.id)}
                            className="text-red-400 hover:text-red-300"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              ) : (
                <div className="text-center py-12">
                  <i className="fas fa-users text-gray-600 text-5xl mb-4"></i>
                  <p className="text-gray-400 mb-4">No discovered users yet</p>
                  <button 
                    onClick={() => {
                      setModalType('user');
                      setShowAddModal(true);
                      setNewItem({
                        username: '',
                        domain: '',
                        privilege_level: 'user',
                        target_id: '',
                        password_plaintext: '',
                        notes: ''
                      });
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg transition-colors inline-flex items-center"
                  >
                    <i className="fas fa-plus mr-2"></i>
                    Add Your First Discovered User
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">📁 Discovered Files</h2>
                <button 
                  onClick={() => {
                    setModalType('file');
                    setShowAddModal(true);
                    setNewItem({
                      filename: '',
                      file_path: '',
                      file_type: 'document',
                      file_size: '',
                      file_hash: '',
                      content_preview: '',
                      content_analysis: '',
                      source: 'manual',
                      severity: 'info',
                      notes: '',
                      tags: '',
                      is_sensitive: 'false',
                      target_id: ''
                    });
                  }}
                  className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg transition-colors"
                >
                  <i className="fas fa-plus mr-2"></i>
                  Add Discovered File
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              {(project.discovered_files && project.discovered_files.length > 0) ? (
                <table className="w-full">
                  <thead className="bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">File</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Target</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Size</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Severity</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Discovered</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {project.discovered_files.map((file) => {
                      const target = project.targets?.find(t => t.id === file.target_id);
                      return (
                        <tr key={file.id} className="hover:bg-gray-700">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <span className="text-2xl mr-3">
                                {file.file_type === 'document' ? '📄' : 
                                 file.file_type === 'image' ? '🖼️' :
                                 file.file_type === 'script' ? '📜' :
                                 file.file_type === 'config' ? '⚙️' :
                                 file.file_type === 'log' ? '📋' :
                                 file.file_type === 'database' ? '🗄️' : '📁'}
                              </span>
                              <div>
                                <div className="text-sm font-medium text-white">{file.filename}</div>
                                <div className="text-xs text-gray-400 truncate max-w-xs">{file.file_path}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {target ? (
                              <div className="text-sm text-white">
                                {target.target_value}
                                <div className="text-xs text-gray-400">{target.target_type}</div>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-500">No target assigned</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                            {file.file_type}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                            {file.file_size ? `${(file.file_size / 1024).toFixed(1)} KB` : 'Unknown'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              file.severity === 'critical' ? 'bg-red-600 text-white' :
                              file.severity === 'high' ? 'bg-red-500 text-white' :
                              file.severity === 'medium' ? 'bg-yellow-500 text-white' :
                              file.severity === 'low' ? 'bg-green-500 text-white' :
                              file.severity === 'info' ? 'bg-blue-500 text-white' :
                              'bg-gray-500 text-white'
                            }`}>
                              {file.severity}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                            {new Date(file.discovered_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex space-x-2">
                              <button
                                onClick={() => handleEditItem('files', file)}
                                className="text-blue-400 hover:text-blue-300"
                              >
                                Edit
                              </button>
                              <button 
                                onClick={() => handleDeleteItem('files', file.id)}
                                className="text-red-400 hover:text-red-300"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-12">
                  <div className="text-gray-400 text-lg mb-4">No discovered files yet</div>
                  <p className="text-gray-500 mb-6">Start by adding files found during your penetration testing</p>
                  <button 
                    onClick={() => {
                      setModalType('file');
                      setShowAddModal(true);
                      setNewItem({
                        filename: '',
                        file_path: '',
                        file_type: 'document',
                        file_size: '',
                        file_hash: '',
                        content_preview: '',
                        content_analysis: '',
                        source: 'manual',
                        severity: 'info',
                        notes: '',
                        tags: '',
                        is_sensitive: 'false',
                        target_id: ''
                      });
                    }}
                    className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg transition-colors"
                  >
                    <i className="fas fa-plus mr-2"></i>
                    Add Your First Discovered File
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'findings' && (
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Findings</h2>
                <button 
                  onClick={handleAddFinding}
                  className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
                >
                  Add Finding
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Title</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Target</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Severity</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Discovered</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {(project.findings || []).map((finding) => {
                    // Find the target for this finding
                    const target = project.targets?.find(t => t.id === finding.target_id);
                    return (
                    <tr key={finding.id} className="hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-white">{finding.title}</div>
                          {finding.description && (
                            <div className="text-xs text-gray-400 mt-1 truncate max-w-xs">
                              {finding.description}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {target ? (
                            <div className="text-sm text-white">
                              {target.target_value}
                              <div className="text-xs text-gray-400">{target.target_type}</div>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-500">No target assigned</span>
                          )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getSeverityColor(finding.severity)}`}>
                          {finding.severity}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(finding.status)}`}>
                          {finding.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {finding.discovered}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => setViewingFinding(finding)}
                            className="text-blue-400 hover:text-blue-300"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleEditItem('findings', finding)}
                            className="text-yellow-400 hover:text-yellow-300"
                          >
                            Edit
                          </button>
                          <button 
                            onClick={() => handleDeleteItem('findings', finding.id)}
                            className="text-red-400 hover:text-red-300"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'tools' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-700">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Tools</h2>
                  <button 
                    onClick={handleAddTool}
                    className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
                  >
                    Add Tool
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Tool</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Category</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Command</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {(project.tools || []).length === 0 ? (
                      <tr>
                        <td colSpan="4" className="px-6 py-8 text-center text-gray-400">
                          <div className="flex flex-col items-center">
                            <span className="text-4xl mb-2">🔧</span>
                            <p>No tools added yet</p>
                            <button
                              onClick={handleAddTool}
                              className="mt-3 text-blue-400 hover:text-blue-300 text-sm"
                            >
                              Add your first tool →
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      (project.tools || []).map((tool) => (
                      <tr key={tool.id} className="hover:bg-gray-700">
                          <td className="px-6 py-4">
                          <div className="text-sm font-medium text-white">{tool.name}</div>
                            {tool.description && (
                              <div className="text-xs text-gray-400 mt-1">{tool.description}</div>
                            )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-700 text-gray-300">
                              {tool.category || 'general'}
                          </span>
                        </td>
                          <td className="px-6 py-4">
                            <code className="text-xs text-green-400 bg-gray-900 px-2 py-1 rounded font-mono">
                              {tool.command && tool.command.length > 50 
                                ? tool.command.substring(0, 50) + '...' 
                                : tool.command || 'N/A'}
                            </code>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex space-x-3">
                            <button
                              onClick={() => handleRunTool(tool.id)}
                              className="text-green-400 hover:text-green-300"
                                title="Run tool"
                            >
                                ▶ Run
                            </button>
                            <button
                              onClick={() => handleEditItem('tools', tool)}
                              className="text-yellow-400 hover:text-yellow-300"
                                title="Edit tool"
                            >
                                ✏ Edit
                            </button>
                            <button
                              onClick={() => handleDeleteItem('tools', tool.id)}
                              className="text-red-400 hover:text-red-300"
                                title="Delete tool"
                            >
                                🗑 Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Execution History View - Only in Tools Tab */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-700">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Previous Executions</h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          if (executionHistory.length === 0) { toast.info('No executions to delete'); return; }
                          const token = localStorage.getItem('token');
                          if (!token) { toast.error('Please log in'); return; }
                          const confirmed = await confirm({
                            title: 'Delete All Executions',
                            message: `This will permanently delete all ${executionHistory.length} execution records and their associated knowledge graph data. This cannot be undone.`,
                            confirmText: 'Delete All',
                            variant: 'danger'
                          });
                          if (!confirmed) return;
                          try {
                            const res = await fetch(`http://localhost:8002/api/v1/tools/executions/project/${project.id}`, {
                              method: 'DELETE',
                              headers: { 'Authorization': `Bearer ${token}` }
                            });
                            if (res.ok) {
                              const data = await res.json();
                              toast.success(data.message);
                              loadExecutionHistory();
                            } else {
                              const err = await res.json().catch(() => ({}));
                              toast.error(err.detail || 'Failed to delete executions');
                            }
                          } catch (e) { toast.error('Failed to delete executions'); }
                        }}
                        className="text-sm text-red-400 hover:text-red-300 px-3 py-1 rounded hover:bg-red-900/20 transition-colors"
                      >
                        Delete All
                      </button>
                      <button
                        onClick={loadExecutionHistory}
                        className="text-sm text-blue-400 hover:text-blue-300 px-3 py-1 rounded hover:bg-gray-700 transition-colors"
                      >
                        Refresh
                      </button>
                    </div>
                  </div>
                </div>
                <div className="px-6 py-4">
                  {/* Pagination Controls */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400">Show:</span>
                      <select
                        value={executionsPerPage}
                        onChange={(e) => {
                          setExecutionsPerPage(Number(e.target.value));
                          setExecutionPage(1); // Reset to first page when changing items per page
                        }}
                        className="bg-gray-700 text-white text-sm px-2 py-1 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                      </select>
                      <span className="text-sm text-gray-400">
                        ({executionHistory.length} total)
                      </span>
                    </div>
                    {executionHistory.length > executionsPerPage && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExecutionPage(prev => Math.max(1, prev - 1))}
                          disabled={executionPage === 1}
                          className={`px-3 py-1 text-sm rounded ${
                            executionPage === 1
                              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                              : 'bg-gray-700 hover:bg-gray-600 text-white'
                          }`}
                        >
                          ← Previous
                        </button>
                        <span className="text-sm text-gray-400">
                          Page {executionPage} of {Math.ceil(executionHistory.length / executionsPerPage)}
                        </span>
                        <button
                          onClick={() => setExecutionPage(prev => Math.min(Math.ceil(executionHistory.length / executionsPerPage), prev + 1))}
                          disabled={executionPage >= Math.ceil(executionHistory.length / executionsPerPage)}
                          className={`px-3 py-1 text-sm rounded ${
                            executionPage >= Math.ceil(executionHistory.length / executionsPerPage)
                              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                              : 'bg-gray-700 hover:bg-gray-600 text-white'
                          }`}
                        >
                          Next →
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {executionHistory.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">
                        <p>No execution history yet. Run a tool to see executions here.</p>
                      </div>
                    ) : (
                      executionHistory
                        .slice((executionPage - 1) * executionsPerPage, executionPage * executionsPerPage)
                        .map((execution) => {
                      // Find tool by matching IDs (handle type coercion - string vs number)
                      // Convert both to numbers for reliable comparison
                      const executionToolId = execution.tool_id ? Number(execution.tool_id) : null;
                      const tool = executionToolId ? project?.tools?.find(t => {
                        const toolId = Number(t.id);
                        return toolId === executionToolId;
                      }) : null;
                      
                      // Get tool name from cache if not found in project tools
                      const toolName = tool?.name || (executionToolId ? toolNamesCache[executionToolId] : null);
                      
                      return (
                        <div
                          key={execution.id}
                          className="bg-gray-700 rounded-lg p-3 flex items-center justify-between hover:bg-gray-600 cursor-pointer transition-colors"
                          onClick={async () => {
                            // View execution details
                            try {
                              const token = localStorage.getItem('token');
                              const headers = {};
                              if (token) {
                                headers['Authorization'] = `Bearer ${token}`;
                              }
                              
                              // Use tool name from display (already resolved from cache or project tools)
                              const response = await fetch(`http://localhost:8002/api/v1/tools/executions/${execution.id}`, {
                                headers: headers
                              });
                              if (response.ok) {
                                const details = await response.json();
                                setCurrentExecutionId(execution.id);
                                setCurrentToolName(toolName || (execution.tool_id ? `Tool #${execution.tool_id}` : 'Unknown Tool'));
                                setShowTerminal(true);
                              }
                            } catch (error) {
                              console.error('Error loading execution details:', error);
                            }
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`text-xs px-2 py-1 rounded ${
                              execution.execution_status === 'completed' ? 'bg-green-900 text-green-300' :
                              execution.execution_status === 'failed' ? 'bg-red-900 text-red-300' :
                              execution.execution_status === 'running' ? 'bg-yellow-900 text-yellow-300' :
                              'bg-gray-600 text-gray-300'
                            }`}>
                              {execution.execution_status?.toUpperCase() || 'UNKNOWN'}
                            </span>
                            <div>
                              <div className="text-sm font-medium">
                                <span className="text-blue-400">#{execution.id}</span> - {toolName || (execution.tool_id ? `Tool #${execution.tool_id}` : 'Unknown Tool')}
                              </div>
                              <div className="text-xs text-gray-400">
                                {execution.start_time ? (() => {
                                  try {
                                    // Handle both ISO string and datetime object formats
                                    const date = typeof execution.start_time === 'string' 
                                      ? new Date(execution.start_time) 
                                      : new Date(execution.start_time);
                                    return isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
                                  } catch (e) {
                                    return 'N/A';
                                  }
                                })() : (execution.created_at ? (() => {
                                  try {
                                    const date = typeof execution.created_at === 'string' 
                                      ? new Date(execution.created_at) 
                                      : new Date(execution.created_at);
                                    return isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
                                  } catch (e) {
                                    return 'N/A';
                                  }
                                })() : 'N/A')}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={async (e) => {
                                e.stopPropagation(); // Prevent triggering parent onClick
                                const confirmed = await confirm({
                                  title: 'Delete Execution',
                                  message: `Are you sure you want to delete execution #${execution.id}?`,
                                  confirmText: 'Delete',
                                  variant: 'danger'
                                });
                                if (confirmed) {
                                  try {
                                    const token = localStorage.getItem('token');
                                    if (!token) {
                                      toast.error('Please log in to delete executions.');
                                      return;
                                    }

                                    const response = await fetch(
                                      `http://localhost:8002/api/v1/tools/executions/${execution.id}`,
                                      {
                                        method: 'DELETE',
                                        headers: {
                                          'Content-Type': 'application/json',
                                          'Authorization': `Bearer ${token}`
                                        }
                                      }
                                    );

                                    if (response.ok) {
                                      // Remove from local state
                                      setExecutionHistory(prev => prev.filter(e => e.id !== execution.id));
                                      toast.success('Execution deleted successfully');
                                    } else if (response.status === 401) {
                                      toast.error('Session expired. Please log in again to delete executions.');
                                    } else {
                                      const error = await response.json().catch(() => ({}));
                                      toast.error(`Error: ${error.detail || 'Failed to delete execution'}`);
                                    }
                                  } catch (error) {
                                    console.error('Error deleting execution:', error);
                                    toast.error('Error deleting execution. Please try again.');
                                  }
                                }
                              }}
                              className="text-red-400 hover:text-red-300 text-sm px-2 py-1 rounded hover:bg-red-900/20 transition-colors"
                              title="Delete execution"
                            >
                              🗑️ Delete
                            </button>
                            <button className="text-blue-400 hover:text-blue-300 text-sm">
                              View Output →
                            </button>
                          </div>
                        </div>
                      );
                    })
                    )}
                  </div>
                </div>
              </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="space-y-6">
            {/* Generate Reports */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <h2 className="text-xl font-semibold mb-4">Generate Report</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => handleGenerateReport('Executive Summary')}
                  disabled={generatingReport}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed p-4 rounded-lg text-left"
                >
                  <h3 className="font-medium">Executive Summary</h3>
                  <p className="text-sm text-gray-300">High-level overview for management</p>
                </button>
                <button
                  onClick={() => handleGenerateReport('Technical Report')}
                  disabled={generatingReport}
                  className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed p-4 rounded-lg text-left"
                >
                  <h3 className="font-medium">Technical Report</h3>
                  <p className="text-sm text-gray-300">Detailed technical findings</p>
                </button>
                <button
                  onClick={() => handleGenerateReport('Custom Report')}
                  disabled={generatingReport}
                  className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed p-4 rounded-lg text-left"
                >
                  <h3 className="font-medium">Custom Report</h3>
                  <p className="text-sm text-gray-300">Create your own format</p>
                </button>
              </div>
              {generatingReport && (
                <div className="mt-4 flex items-center space-x-2 text-yellow-400 text-sm">
                  <i className="fas fa-spinner fa-spin"></i>
                  <span>AI is generating your report... This may take a moment.</span>
                </div>
              )}
            </div>

            {/* Report Templates */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <h3 className="text-lg font-semibold mb-4">Templates</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => handleGenerateReport('Vulnerability Assessment')}
                  disabled={generatingReport}
                  className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg p-4 text-left"
                >
                  <h4 className="font-medium mb-1">Vulnerability Assessment</h4>
                  <p className="text-sm text-gray-300">Standard vulnerability assessment report</p>
                </button>
                <button
                  onClick={() => handleGenerateReport('Penetration Test')}
                  disabled={generatingReport}
                  className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg p-4 text-left"
                >
                  <h4 className="font-medium mb-1">Penetration Test</h4>
                  <p className="text-sm text-gray-300">Comprehensive penetration test report</p>
                </button>
              </div>
            </div>

            {/* Existing Reports */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Generated Reports</h3>
                <button
                  onClick={loadProjectReports}
                  className="text-sm text-gray-400 hover:text-white"
                >
                  <i className="fas fa-sync-alt mr-1"></i> Refresh
                </button>
              </div>
              {projectReports.length === 0 ? (
                <p className="text-gray-400 text-sm">No reports generated yet. Use the buttons above to create one.</p>
              ) : (
                <div className="space-y-3">
                  {projectReports.map((report) => (
                    <div key={report.id} className="flex items-center justify-between bg-gray-700 rounded-lg p-4">
                      <div>
                        <h4 className="font-medium">{report.title}</h4>
                        <div className="flex items-center space-x-3 mt-1">
                          <span className="text-xs text-gray-400 capitalize">{(report.report_type || '').replace('_', ' ')}</span>
                          <span className="text-xs text-gray-500">{report.generated_at ? new Date(report.generated_at).toLocaleDateString() : ''}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            report.status === 'completed' ? 'bg-green-600/20 text-green-400' :
                            report.status === 'generating' ? 'bg-yellow-600/20 text-yellow-400' :
                            'bg-gray-600/20 text-gray-400'
                          }`}>{report.status}</span>
                        </div>
                      </div>
                      <Link
                        href={`/reports/${report.id}`}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"
                      >
                        View
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-700">
              <h3 className="text-lg font-semibold">
              Add {modalType.charAt(0).toUpperCase() + modalType.slice(1)}
            </h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-4">
              {modalType === 'target' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Target Name</label>
                    <input
                      type="text"
                      value={newItem.name || ''}
                      onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      placeholder="192.168.1.1 or example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Type</label>
                    <select
                      value={newItem.type || 'IP'}
                      onChange={(e) => setNewItem({...newItem, type: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="IP">IP Address</option>
                      <option value="Domain">Domain</option>
                      <option value="Subdomain">Subdomain</option>
                      <option value="URL">URL</option>
                    </select>
                  </div>
                </>
              )}

              {modalType === 'finding' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Title</label>
                    <input
                      type="text"
                      value={newItem.title || ''}
                      onChange={(e) => setNewItem({...newItem, title: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      placeholder="SQL Injection Vulnerability"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Target</label>
                    <select
                      value={newItem.target_id || ''}
                      onChange={(e) => setNewItem({...newItem, target_id: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="">Select Target</option>
                      {project.targets?.map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.target_value} ({target.target_type})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Severity</label>
                    <select
                      value={newItem.severity || 'Medium'}
                      onChange={(e) => setNewItem({...newItem, severity: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="Critical">Critical</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                      <option value="Info">Info</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                    <textarea
                      value={newItem.description || ''}
                      onChange={(e) => setNewItem({...newItem, description: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      rows="3"
                      placeholder="Detailed description of the vulnerability..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
                    <select
                      value={newItem.status || 'open'}
                      onChange={(e) => setNewItem({...newItem, status: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="fixed">Fixed</option>
                      <option value="false_positive">False Positive</option>
                    </select>
                  </div>
                </>
              )}

              {modalType === 'tool' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Tool Name</label>
                    <input
                      type="text"
                      value={newItem.name || ''}
                      onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      placeholder="nmap, nikto, sqlmap"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Command Template
                      <span className="text-xs text-yellow-400 ml-2">Use {'{'}target{'}'} as placeholder</span>
                    </label>
                    <input
                      type="text"
                      value={newItem.command || ''}
                      onChange={(e) => setNewItem({...newItem, command: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg font-mono text-sm"
                      placeholder="nmap -sS -sV {target}"
                    />
                    <div className="mt-2 p-2 bg-gray-900 rounded text-xs">
                      <p className="text-gray-400 mb-1">💡 Available Variables:</p>
                      <div className="grid grid-cols-2 gap-2 text-gray-300 font-mono">
                        <div><span className="text-green-400">{'{'}target{'}'}</span> - Target IP/Domain</div>
                        <div><span className="text-green-400">{'{'}port{'}'}</span> - Target Port</div>
                        <div><span className="text-green-400">{'{'}protocol{'}'}</span> - Protocol (http/https)</div>
                        <div><span className="text-green-400">{'{'}output{'}'}</span> - Output file path</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Category
                    </label>
                    <select
                      value={newItem.category || 'reconnaissance'}
                      onChange={(e) => setNewItem({...newItem, category: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="reconnaissance">🔍 Reconnaissance</option>
                      <option value="scanning">📡 Scanning</option>
                      <option value="enumeration">📋 Enumeration</option>
                      <option value="exploitation">💥 Exploitation</option>
                      <option value="post-exploitation">🎯 Post-Exploitation</option>
                      <option value="web">🌐 Web Application</option>
                      <option value="network">🔌 Network</option>
                      <option value="other">🔧 Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Select Targets
                      <span className="text-xs text-gray-400 ml-2">(Hold Ctrl/Cmd to select multiple - these will replace {'{target}'} in command)</span>
                    </label>
                    {(project?.targets || []).length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4 bg-gray-900 rounded-lg border border-gray-600">
                        No targets available. Please add targets first.
                      </p>
                    ) : (
                      <select
                        multiple
                        value={newItem.selected_targets ? newItem.selected_targets.map(id => String(id)) : []}
                        onChange={(e) => {
                          const selectedValues = Array.from(e.target.selectedOptions, option => parseInt(option.value));
                          setNewItem({...newItem, selected_targets: selectedValues});
                        }}
                        className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none min-h-[120px]"
                        size="6"
                      >
                        {(project?.targets || []).map(target => (
                          <option key={target.id} value={target.id}>
                            {target.target_value || target.name} ({target.target_type})
                          </option>
                        ))}
                      </select>
                    )}
                    {newItem.selected_targets && newItem.selected_targets.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-gray-400 mb-1">
                          Selected: {newItem.selected_targets.length} target(s)
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {newItem.selected_targets.map(targetId => {
                            const target = (project?.targets || []).find(t => t.id === targetId);
                            return target ? (
                              <span
                                key={targetId}
                                className="inline-flex items-center px-2 py-1 rounded bg-blue-900 text-blue-200 text-xs"
                              >
                                {target.target_value || target.name}
                                <button
                                  onClick={() => {
                                    const newTargets = newItem.selected_targets.filter(id => id !== targetId);
                                    setNewItem({...newItem, selected_targets: newTargets});
                                  }}
                                  className="ml-2 text-blue-400 hover:text-blue-300"
                                  type="button"
                                >
                                  ×
                                </button>
                              </span>
                            ) : null;
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                    <p className="text-xs text-blue-300 mb-2">📌 Command Template Examples:</p>
                    <div className="space-y-1 text-xs font-mono text-gray-300">
                      <div className="p-1 bg-gray-800 rounded">nmap -sV -sC {'{'}target{'}'}</div>
                      <div className="p-1 bg-gray-800 rounded">nikto -h {'{'}protocol{'}'}://{'{'}target{'}'}</div>
                      <div className="p-1 bg-gray-800 rounded">sqlmap -u {'{'}protocol{'}'}://{'{'}target{'}'} --batch</div>
                      <div className="p-1 bg-gray-800 rounded">ffuf -u {'{'}protocol{'}'}://{'{'}target{'}'}/FUZZ -w wordlist.txt</div>
                    </div>
                  </div>
                </>
              )}

              {modalType === 'user' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Username <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={newItem.username || ''}
                      onChange={(e) => setNewItem({...newItem, username: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      placeholder="e.g., admin, webuser, dbadmin"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Domain / Workgroup</label>
                    <input
                      type="text"
                      value={newItem.domain || ''}
                      onChange={(e) => setNewItem({...newItem, domain: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      placeholder="e.g., CORP, WORKGROUP, techcorp.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Privilege Level <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={newItem.privilege_level || 'user'}
                      onChange={(e) => setNewItem({...newItem, privilege_level: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="guest">🔵 Guest</option>
                      <option value="user">🟢 User</option>
                      <option value="admin">🟠 Admin</option>
                      <option value="root">🔴 Root / System</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Target (Where Found)
                    </label>
                    <select
                      value={newItem.target_id || ''}
                      onChange={(e) => setNewItem({...newItem, target_id: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="">Select target...</option>
                      {(project.targets || []).map(target => (
                        <option key={target.id} value={target.id}>
                          {target.target_value || target.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      Select the target where this user was discovered
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Password / Credential
                    </label>
                    <input
                      type="text"
                      value={newItem.password_plaintext || ''}
                      onChange={(e) => setNewItem({...newItem, password_plaintext: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg font-mono"
                      placeholder="Leave empty if password unknown"
                    />
                    <p className="text-xs text-yellow-400 mt-1">
                      ⚠️ Password will be stored as plaintext for penetration testing purposes
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                    <input
                      type="email"
                      value={newItem.email || ''}
                      onChange={(e) => setNewItem({...newItem, email: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      placeholder="user@company.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Severity
                    </label>
                    <select
                      value={newItem.severity || 'medium'}
                      onChange={(e) => setNewItem({...newItem, severity: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="low">🟢 Low</option>
                      <option value="medium">🟡 Medium</option>
                      <option value="high">🟠 High</option>
                      <option value="critical">🔴 Critical</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      Higher severity if admin/privileged user or credentials found
                    </p>
                  </div>
                </>
              )}

              {modalType !== 'user' && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                <textarea
                  value={newItem.description || ''}
                  onChange={(e) => setNewItem({...newItem, description: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  rows="3"
                  placeholder="Optional description"
                />
              </div>
              )}

              {modalType === 'user' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Notes</label>
                  <textarea
                    value={newItem.notes || ''}
                    onChange={(e) => setNewItem({...newItem, notes: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    rows="3"
                    placeholder="How was this user discovered? Additional context..."
                  />
            </div>
              )}

              {modalType === 'file' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Filename <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={newItem.filename || ''}
                      onChange={(e) => setNewItem({...newItem, filename: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      placeholder="config.php"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      File Path <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={newItem.file_path || ''}
                      onChange={(e) => setNewItem({...newItem, file_path: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      placeholder="/var/www/html/config.php"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Target (Where Found)
                    </label>
                    <select
                      value={newItem.target_id || ''}
                      onChange={(e) => setNewItem({...newItem, target_id: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="">Select target...</option>
                      {(project.targets || []).map(target => (
                        <option key={target.id} value={target.id}>
                          {target.target_value || target.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      Select the target where this file was discovered
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">File Type</label>
                    <select
                      value={newItem.file_type || 'document'}
                      onChange={(e) => setNewItem({...newItem, file_type: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="document">📄 Document</option>
                      <option value="image">🖼️ Image</option>
                      <option value="script">📜 Script</option>
                      <option value="config">⚙️ Config</option>
                      <option value="log">📋 Log</option>
                      <option value="database">🗄️ Database</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">File Size (bytes)</label>
                    <input
                      type="number"
                      value={newItem.file_size || ''}
                      onChange={(e) => setNewItem({...newItem, file_size: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      placeholder="1024"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">File Hash</label>
                    <input
                      type="text"
                      value={newItem.file_hash || ''}
                      onChange={(e) => setNewItem({...newItem, file_hash: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg font-mono"
                      placeholder="md5:abc123... or sha256:def456..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Source</label>
                    <select
                      value={newItem.source || 'manual'}
                      onChange={(e) => setNewItem({...newItem, source: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="manual">Manual</option>
                      <option value="scan">Scan</option>
                      <option value="tool">Tool</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Severity</label>
                    <select
                      value={newItem.severity || 'info'}
                      onChange={(e) => setNewItem({...newItem, severity: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="info">🔵 Info</option>
                      <option value="low">🟢 Low</option>
                      <option value="medium">🟡 Medium</option>
                      <option value="high">🟠 High</option>
                      <option value="critical">🔴 Critical</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Is Sensitive</label>
                    <select
                      value={newItem.is_sensitive || 'false'}
                      onChange={(e) => setNewItem({...newItem, is_sensitive: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="false">No</option>
                      <option value="true">Yes</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Tags (comma-separated)</label>
                    <input
                      type="text"
                      value={newItem.tags || ''}
                      onChange={(e) => setNewItem({...newItem, tags: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      placeholder="config, sensitive, backup"
                    />
                  </div>
                </>
              )}

              {modalType === 'file' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Content Preview</label>
                  <textarea
                    value={newItem.content_preview || ''}
                    onChange={(e) => setNewItem({...newItem, content_preview: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg font-mono"
                    rows="3"
                    placeholder="First few lines of file content..."
                  />
                </div>
              )}

              {modalType === 'file' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Content Analysis</label>
                  <textarea
                    value={newItem.content_analysis || ''}
                    onChange={(e) => setNewItem({...newItem, content_analysis: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    rows="3"
                    placeholder="Analysis of file content and potential security implications..."
                  />
                </div>
              )}

              {modalType === 'file' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Notes</label>
                  <textarea
                    value={newItem.notes || ''}
                    onChange={(e) => setNewItem({...newItem, notes: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    rows="2"
                    placeholder="Additional notes about this file..."
                  />
                </div>
              )}
              </div>
            </div>

            <div className="p-6 border-t border-gray-700 flex justify-end space-x-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveItem}
                disabled={isSaving}
                className={`px-4 py-2 rounded-lg ${
                  isSaving 
                    ? 'bg-gray-600 cursor-not-allowed opacity-50' 
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Project Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Edit Project</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Project Name</label>
                <input
                  type="text"
                  value={project.name || ''}
                  onChange={(e) => setProject({...project, name: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Company</label>
                <input
                  type="text"
                  value={project.company || ''}
                  onChange={(e) => setProject({...project, company: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                <textarea
                  value={project.description || ''}
                  onChange={(e) => setProject({...project, description: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  rows="3"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
                <select
                  value={project.status || 'active'}
                  onChange={(e) => setProject({...project, status: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProject}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Run Scan Modal */}
      {showScanModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Run Security Scan</h3>
            
            {!isScanning ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Scan Type</label>
                  <select className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg">
                    <option value="full">Full Scan</option>
                    <option value="quick">Quick Scan</option>
                    <option value="vulnerability">Vulnerability Scan</option>
                    <option value="port">Port Scan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Targets</label>
                  <div className="space-y-2">
                    {(project.targets || []).map((target) => (
                      <label key={target.id} className="flex items-center">
                        <input
                          type="checkbox"
                          defaultChecked
                          className="mr-2"
                        />
                        <span className="text-sm text-gray-300">{target.target_value}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Scan Options</label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input type="checkbox" defaultChecked className="mr-2" />
                      <span className="text-sm text-gray-300">Include subdomains</span>
                    </label>
                    <label className="flex items-center">
                      <input type="checkbox" defaultChecked className="mr-2" />
                      <span className="text-sm text-gray-300">Deep scan</span>
                    </label>
                    <label className="flex items-center">
                      <input type="checkbox" className="mr-2" />
                      <span className="text-sm text-gray-300">Stealth mode</span>
                    </label>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <p className="text-white">Scanning in progress...</p>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${scanProgress}%` }}
                  ></div>
                </div>
                <p className="text-center text-sm text-gray-300">{scanProgress}% Complete</p>
              </div>
            )}

            <div className="flex justify-end space-x-3 mt-6">
              {!isScanning ? (
                <>
                  <button
                    onClick={handleCancelScan}
                    className="px-4 py-2 text-gray-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleStartScan}
                    className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg"
                  >
                    Start Scan
                  </button>
                </>
              ) : (
                <button
                  onClick={handleCancelScan}
                  className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg"
                >
                  Stop Scan
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* View Finding Modal */}
      {viewingFinding && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Finding Details</h3>
              <button
                onClick={() => setViewingFinding(null)}
                className="text-gray-400 hover:text-white text-xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div>
                <h4 className="text-2xl font-bold text-white">{viewingFinding.title}</h4>
              </div>

              <div className="flex items-center space-x-3">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getSeverityColor(viewingFinding.severity)}`}>
                  {viewingFinding.severity?.toUpperCase()}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(viewingFinding.status)}`}>
                  {viewingFinding.status?.replace('_', ' ').toUpperCase()}
                </span>
              </div>

              {viewingFinding.target_id && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Target</label>
                  <p className="text-white">
                    {(() => {
                      const t = project?.targets?.find(t => t.id === viewingFinding.target_id);
                      return t ? `${t.target_value} (${t.target_type})` : `ID ${viewingFinding.target_id}`;
                    })()}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Description</label>
                <div className="bg-gray-900 rounded-lg p-4 text-gray-300 whitespace-pre-wrap text-sm leading-relaxed">
                  {viewingFinding.description || 'No description provided.'}
                </div>
              </div>

              {viewingFinding.discovered && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Discovered</label>
                  <p className="text-gray-300 text-sm">{viewingFinding.discovered}</p>
                </div>
              )}

              {viewingFinding.remediation && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Remediation</label>
                  <div className="bg-gray-900 rounded-lg p-4 text-gray-300 whitespace-pre-wrap text-sm leading-relaxed">
                    {viewingFinding.remediation}
                  </div>
                </div>
              )}

              {viewingFinding.references && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">References</label>
                  <div className="bg-gray-900 rounded-lg p-4 text-gray-300 whitespace-pre-wrap text-sm leading-relaxed">
                    {viewingFinding.references}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-700 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setViewingFinding(null);
                  handleEditItem('findings', viewingFinding);
                }}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm"
              >
                Edit
              </button>
              <button
                onClick={() => setViewingFinding(null)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {showItemEditModal && editingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-700">
              <h3 className="text-lg font-semibold">Edit {editingItemType}</h3>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-4">
              {editingItemType === 'targets' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Target Value</label>
                    <input
                      type="text"
                      value={editingItem.target_value || ''}
                      onChange={(e) => setEditingItem({...editingItem, target_value: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      placeholder="Enter target value (IP or domain)"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Type</label>
                    <select
                      value={editingItem.target_type || 'ip'}
                      onChange={(e) => setEditingItem({...editingItem, target_type: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="ip">IP</option>
                      <option value="domain">Domain</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Priority</label>
                    <select
                      value={editingItem.priority || 'medium'}
                      onChange={(e) => setEditingItem({...editingItem, priority: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Notes</label>
                    <textarea
                      value={editingItem.notes || ''}
                      onChange={(e) => setEditingItem({...editingItem, notes: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      rows="3"
                      placeholder="Enter notes"
                    />
                  </div>
                </>
              )}

              {editingItemType === 'findings' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Title</label>
                    <input
                      type="text"
                      value={editingItem.title || ''}
                      onChange={(e) => setEditingItem({...editingItem, title: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      placeholder="Enter finding title"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Target</label>
                    <select
                      value={editingItem.target_id || ''}
                      onChange={(e) => setEditingItem({...editingItem, target_id: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="">Select Target</option>
                      {project.targets?.map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.target_value} ({target.target_type})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                    <textarea
                      value={editingItem.description || ''}
                      onChange={(e) => setEditingItem({...editingItem, description: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      rows="3"
                      placeholder="Enter finding description"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Severity</label>
                    <select
                      value={editingItem.severity || 'medium'}
                      onChange={(e) => setEditingItem({...editingItem, severity: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="info">Info</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
                    <select
                      value={editingItem.status || 'open'}
                      onChange={(e) => setEditingItem({...editingItem, status: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="fixed">Fixed</option>
                      <option value="false_positive">False Positive</option>
                    </select>
                  </div>
                </>
              )}

              {editingItemType === 'tools' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Tool Name</label>
                    <input
                      type="text"
                      value={editingItem.name || ''}
                      onChange={(e) => setEditingItem({...editingItem, name: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      placeholder="Enter tool name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                    <textarea
                      value={editingItem.description || ''}
                      onChange={(e) => setEditingItem({...editingItem, description: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      rows="3"
                      placeholder="Enter tool description"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Command Template
                      <span className="text-xs text-gray-400 ml-2">(Use {'{target}'} as placeholder for target values)</span>
                    </label>
                    <input
                      type="text"
                      value={editingItem.command || editingItem.command_template || ''}
                      onChange={(e) => setEditingItem({...editingItem, command: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg font-mono text-sm"
                      placeholder="e.g., nmap -sV {target}"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Example: <code className="text-blue-400">nmap -sV {'{target}'}</code> or <code className="text-blue-400">nikto -h {'{target}'}</code>
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Category</label>
                    <select
                      value={editingItem.category || 'general'}
                      onChange={(e) => setEditingItem({...editingItem, category: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="reconnaissance">Reconnaissance</option>
                      <option value="scanning">Scanning</option>
                      <option value="enumeration">Enumeration</option>
                      <option value="vulnerability">Vulnerability</option>
                      <option value="exploitation">Exploitation</option>
                      <option value="post_exploitation">Post-Exploitation</option>
                      <option value="reporting">Reporting</option>
                      <option value="utility">Utility</option>
                      <option value="general">General</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Select Targets
                      <span className="text-xs text-gray-400 ml-2">(Hold Ctrl/Cmd to select multiple - these will replace {'{target}'} in command)</span>
                    </label>
                    {(project?.targets || []).length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4 bg-gray-900 rounded-lg border border-gray-600">
                        No targets available. Please add targets first.
                      </p>
                    ) : (
                      <select
                        multiple
                        value={editingItem.selected_targets ? editingItem.selected_targets.map(id => String(id)) : []}
                        onChange={(e) => {
                          const selectedValues = Array.from(e.target.selectedOptions, option => parseInt(option.value));
                          setEditingItem({...editingItem, selected_targets: selectedValues});
                        }}
                        className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none min-h-[120px]"
                        size="6"
                      >
                        {(project?.targets || []).map(target => (
                          <option key={target.id} value={target.id}>
                            {target.target_value || target.name} ({target.target_type})
                          </option>
                        ))}
                      </select>
                    )}
                    {editingItem.selected_targets && editingItem.selected_targets.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-gray-400 mb-1">
                          Selected: {editingItem.selected_targets.length} target(s)
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {editingItem.selected_targets.map(targetId => {
                            const target = (project?.targets || []).find(t => t.id === targetId);
                            return target ? (
                              <span
                                key={targetId}
                                className="inline-flex items-center px-2 py-1 rounded bg-blue-900 text-blue-200 text-xs"
                              >
                                {target.target_value || target.name}
                                <button
                                  onClick={() => {
                                    const newTargets = editingItem.selected_targets.filter(id => id !== targetId);
                                    setEditingItem({...editingItem, selected_targets: newTargets});
                                  }}
                                  className="ml-2 text-blue-400 hover:text-blue-300"
                                >
                                  ×
                                </button>
                              </span>
                            ) : null;
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {editingItemType === 'users' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Username <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={editingItem.username || ''}
                      onChange={(e) => setEditingItem({...editingItem, username: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      placeholder="Enter username"
                    />
            </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Domain</label>
                    <input
                      type="text"
                      value={editingItem.domain || ''}
                      onChange={(e) => setEditingItem({...editingItem, domain: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      placeholder="Enter domain"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Privilege Level</label>
                    <select
                      value={editingItem.privilege_level || 'user'}
                      onChange={(e) => setEditingItem({...editingItem, privilege_level: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="guest">Guest</option>
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                      <option value="root">Root</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Target</label>
                    <select
                      value={editingItem.target_id || ''}
                      onChange={(e) => setEditingItem({...editingItem, target_id: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="">Select target...</option>
                      {(project?.targets || []).map(target => (
                        <option key={target.id} value={target.id}>
                          {target.target_value || target.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
                    <input
                      type="text"
                      value={editingItem.password_plaintext || ''}
                      onChange={(e) => setEditingItem({...editingItem, password_plaintext: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg font-mono"
                      placeholder="Enter password"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                    <input
                      type="email"
                      value={editingItem.email || ''}
                      onChange={(e) => setEditingItem({...editingItem, email: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      placeholder="user@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Severity</label>
                    <select
                      value={editingItem.severity || 'medium'}
                      onChange={(e) => setEditingItem({...editingItem, severity: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Notes</label>
                    <textarea
                      value={editingItem.notes || ''}
                      onChange={(e) => setEditingItem({...editingItem, notes: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      rows="3"
                      placeholder="Additional notes..."
                    />
                  </div>
                </>
              )}

              {editingItemType === 'files' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Filename <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={editingItem.filename || ''}
                      onChange={(e) => setEditingItem({...editingItem, filename: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      placeholder="config.php"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      File Path <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={editingItem.file_path || ''}
                      onChange={(e) => setEditingItem({...editingItem, file_path: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      placeholder="/var/www/html/config.php"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Target (Where Found)</label>
                    <select
                      value={editingItem.target_id || ''}
                      onChange={(e) => setEditingItem({...editingItem, target_id: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="">Select target...</option>
                      {(project?.targets || []).map(target => (
                        <option key={target.id} value={target.id}>
                          {target.target_value || target.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">File Type</label>
                    <select
                      value={editingItem.file_type || 'document'}
                      onChange={(e) => setEditingItem({...editingItem, file_type: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="document">Document</option>
                      <option value="config">Configuration</option>
                      <option value="script">Script</option>
                      <option value="database">Database</option>
                      <option value="log">Log File</option>
                      <option value="backup">Backup</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">File Size (bytes)</label>
                    <input
                      type="number"
                      value={editingItem.file_size || ''}
                      onChange={(e) => setEditingItem({...editingItem, file_size: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      placeholder="1024"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">File Hash</label>
                    <input
                      type="text"
                      value={editingItem.file_hash || ''}
                      onChange={(e) => setEditingItem({...editingItem, file_hash: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg font-mono"
                      placeholder="MD5/SHA1/SHA256 hash"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Severity</label>
                    <select
                      value={editingItem.severity || 'info'}
                      onChange={(e) => setEditingItem({...editingItem, severity: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="info">Info</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Source</label>
                    <select
                      value={editingItem.source || 'manual'}
                      onChange={(e) => setEditingItem({...editingItem, source: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="manual">Manual Discovery</option>
                      <option value="scanner">Automated Scanner</option>
                      <option value="exploit">Exploit</option>
                      <option value="reconnaissance">Reconnaissance</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Tags</label>
                    <input
                      type="text"
                      value={editingItem.tags || ''}
                      onChange={(e) => setEditingItem({...editingItem, tags: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      placeholder="config,sensitive,backup (comma-separated)"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Sensitive File</label>
                    <select
                      value={editingItem.is_sensitive || 'false'}
                      onChange={(e) => setEditingItem({...editingItem, is_sensitive: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    >
                      <option value="false">No</option>
                      <option value="true">Yes</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Content Preview</label>
                    <textarea
                      value={editingItem.content_preview || ''}
                      onChange={(e) => setEditingItem({...editingItem, content_preview: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg font-mono"
                      rows="3"
                      placeholder="First few lines of file content..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Content Analysis</label>
                    <textarea
                      value={editingItem.content_analysis || ''}
                      onChange={(e) => setEditingItem({...editingItem, content_analysis: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      rows="3"
                      placeholder="Analysis of file content and potential security implications..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Notes</label>
                    <textarea
                      value={editingItem.notes || ''}
                      onChange={(e) => setEditingItem({...editingItem, notes: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                      rows="2"
                      placeholder="Additional notes about this file..."
                    />
                  </div>
                </>
              )}
              </div>
            </div>

            <div className="p-6 border-t border-gray-700 flex justify-end space-x-3">
              <button
                onClick={() => setShowItemEditModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditedItem}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tool Execution Modal */}
      {showToolExecutionModal && selectedTool && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-semibold">Execute Tool: {selectedTool.name}</h3>
                <p className="text-sm text-gray-400 mt-1">Select targets to run this tool against</p>
              </div>
              <button
                onClick={() => setShowToolExecutionModal(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            {executionResults.length === 0 ? (
              <>
                {/* Tool Info */}
                <div className="bg-gray-700 rounded-lg p-4 mb-6">
                  <h4 className="text-sm font-medium text-gray-300 mb-2">Command Template:</h4>
                  <code className="text-sm text-green-400 bg-gray-900 px-3 py-2 rounded font-mono block">
                    {selectedTool.command}
                  </code>
                  <p className="text-xs text-gray-400 mt-2">
                    💡 The <span className="text-yellow-400">{'{'}target{'}'}</span> variable will be replaced with the selected target's IP/domain
                  </p>
                </div>

                {/* Target Selection */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium">Select Targets ({selectedTargets.length} selected)</h4>
                    <button
                      onClick={selectAllTargets}
                      className="text-sm text-blue-400 hover:text-blue-300"
                    >
                      {selectedTargets.length === project.targets.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto">
                    {project.targets.map(target => (
                      <div
                        key={target.id}
                        onClick={() => toggleTargetSelection(target)}
                        className={`border-2 rounded-lg p-3 cursor-pointer transition ${
                          selectedTargets.some(t => t.id === target.id)
                            ? 'border-blue-500 bg-blue-900/20'
                            : 'border-gray-600 hover:border-gray-500'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={selectedTargets.some(t => t.id === target.id)}
                                onChange={() => {}}
                                className="w-4 h-4"
                              />
                              <span className="font-medium text-white">{target.target_value || target.name}</span>
                            </div>
                            <div className="text-xs text-gray-400 mt-1 ml-6">
                              Type: {target.target_type || 'IP'}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Preview Commands */}
                {selectedTargets.length > 0 && (
                  <div className="bg-gray-700 rounded-lg p-4 mb-6">
                    <h4 className="text-sm font-medium text-gray-300 mb-3">
                      Preview - Commands to be executed:
                    </h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {selectedTargets.map(target => {
                        const command = selectedTool.command
                          .replace(/{target}/g, target.target_value || target.name)
                          .replace(/{port}/g, target.port || '80')
                          .replace(/{protocol}/g, target.protocol || 'http');
                        
                        return (
                          <div key={target.id} className="bg-gray-900 rounded p-2">
                            <div className="text-xs text-gray-400 mb-1">
                              Target: {target.target_value || target.name}
                            </div>
                            <code className="text-xs text-green-400 font-mono">
                              {command}
                            </code>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setShowToolExecutionModal(false)}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExecuteTool}
                    disabled={selectedTargets.length === 0}
                    className={`px-4 py-2 rounded-lg ${
                      selectedTargets.length === 0
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    ▶ Execute on {selectedTargets.length} target(s)
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Execution Results */}
                <div className="space-y-4">
                  {executionResults.map((result, index) => (
                    <div key={index} className="bg-gray-700 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">
                            {result.status === 'pending' && '⏳'}
                            {result.status === 'running' && '▶️'}
                            {result.status === 'completed' && '✅'}
                            {result.status === 'failed' && '❌'}
                          </span>
                          <span className="font-medium">Target: {result.target}</span>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded ${
                          result.status === 'pending' ? 'bg-gray-600' :
                          result.status === 'running' ? 'bg-yellow-900 text-yellow-300' :
                          result.status === 'completed' ? 'bg-green-900 text-green-300' :
                          'bg-red-900 text-red-300'
                        }`}>
                          {result.status.toUpperCase()}
                        </span>
                      </div>

                      <div className="mb-2">
                        <div className="text-xs text-gray-400 mb-1">Command:</div>
                        <code className="text-xs text-green-400 bg-gray-900 px-2 py-1 rounded font-mono block">
                          {result.command}
                        </code>
                      </div>

                      {result.output && (
                        <div>
                          <div className="text-xs text-gray-400 mb-1">Output:</div>
                          <pre className="text-xs text-gray-300 bg-gray-900 p-3 rounded font-mono overflow-x-auto max-h-40">
                            {result.output}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={() => {
                      setExecutionResults([]);
                      setSelectedTargets([]);
                    }}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
                  >
                    Run Again
                  </button>
                  <button
                    onClick={() => setShowToolExecutionModal(false)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Terminal Sliding Panel - Bottom Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-700 transition-transform duration-300 ease-in-out ${
          showTerminal && currentExecutionId
            ? 'transform translate-y-0'
            : 'transform translate-y-full'
        }`}
        style={{
          height: showTerminal && currentExecutionId ? '60vh' : '0',
          maxHeight: '80vh'
        }}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {showTerminal && currentExecutionId && project && (
            <>
              <div className={`flex-shrink-0 overflow-hidden ${debugMessages.length > 0 ? 'h-[calc(100%-8rem)]' : 'flex-1'}`}>
                <Terminal
                  executionId={currentExecutionId}
                  toolName={currentToolName || project.tools?.find(t => {
                    // Find tool by checking execution history or use a default
                    const execution = executionHistory.find(e => e.id === currentExecutionId);
                    return execution ? t.id === execution.tool_id : false;
                  })?.name || 'Tool Execution'}
                  onClose={() => {
                    setShowTerminal(false);
                    setCurrentExecutionId(null);
                    loadExecutionHistory();
                    loadProject(); // Reload project to get updated execution data
                  }}
                />
              </div>
              
              {/* Debug Messages Section - Scrollable and smaller */}
              {debugMessages.length > 0 && (
                <div className="flex-shrink-0 bg-gray-800 border-t border-gray-700 flex flex-col h-32 max-h-32">
                  <h4 className="text-sm font-medium text-gray-300 px-4 pt-3 pb-2 flex-shrink-0">Execution Progress</h4>
                  <div className="flex-1 overflow-y-auto px-4 pb-3">
                    <div className="space-y-1 font-mono text-xs">
                      {debugMessages.map((msg, index) => (
                        <div key={index} className="text-gray-400">
                          <span className="text-gray-500">[{msg.timestamp}]</span>{' '}
                          <span className={msg.message.includes('✅') || msg.message.includes('✓') ? 'text-green-400' : 
                                           msg.message.includes('❌') ? 'text-red-400' : 
                                           msg.message.includes('⏳') ? 'text-yellow-400' :
                                           msg.message.includes('[COMPLETED]') ? 'text-green-400' :
                                           msg.message.includes('[FAILED]') ? 'text-red-400' :
                                           msg.message.includes('[OUTPUT]') ? 'text-blue-400' :
                                           msg.message.includes('============================================================') ? 'text-cyan-400' :
                                           'text-gray-300'}>
                            {msg.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Backdrop overlay when terminal is open */}
      {showTerminal && currentExecutionId && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-300"
          onClick={() => {
            setShowTerminal(false);
            setCurrentExecutionId(null);
          }}
        />
      )}

    </div>
  );
}
