import React, { useEffect, useRef, useState } from 'react';

const Flowchart = ({ data, onOperatorSelect, onOperatorMove, onLinkCreate, onOperatorDelete, onLinkDelete }) => {
  const canvasRef = useRef(null);
  const [selectedOperator, setSelectedOperator] = useState(null);
  const [selectedLink, setSelectedLink] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (canvasRef.current) {
      initializeFlowchart();
    }
  }, [data]);

  const initializeFlowchart = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Clear existing content
    canvas.innerHTML = '';

    // Create flowchart container
    const container = document.createElement('div');
    container.className = 'flowchart-container';
    container.style.cssText = `
      width: 100%;
      height: 100%;
      position: relative;
      background: #1f2937;
      border: 2px dashed #374151;
      border-radius: 8px;
      min-height: 500px;
    `;

    // Add operators
    Object.entries(data.operators || {}).forEach(([operatorId, operatorData]) => {
      createOperator(operatorId, operatorData, container);
    });

    // Add links
    Object.entries(data.links || {}).forEach(([linkId, linkData]) => {
      createLink(linkId, linkData, container);
    });

    canvas.appendChild(container);
  };

  const createOperator = (operatorId, operatorData, container) => {
    const operator = document.createElement('div');
    operator.className = 'flowchart-operator flowchart-default-operator';
    operator.id = operatorId;
    operator.style.cssText = `
      position: absolute;
      top: ${operatorData.top}px;
      left: ${operatorData.left}px;
      width: 140px;
      min-width: 140px;
      background: ${getOperatorColor(operatorData.properties.type)};
      border: 2px solid #374151;
      border-radius: 8px;
      padding: 10px;
      cursor: move;
      user-select: none;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      transition: all 0.2s ease;
    `;

    // Operator title
    const title = document.createElement('div');
    title.className = 'flowchart-operator-title';
    title.textContent = operatorData.properties.title;
    title.style.cssText = `
      font-weight: bold;
      color: white;
      margin-bottom: 8px;
      text-align: center;
      font-size: 12px;
    `;

    // Inputs and outputs container
    const inputsOutputs = document.createElement('div');
    inputsOutputs.className = 'flowchart-operator-inputs-outputs';
    inputsOutputs.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    // Inputs
    const inputs = document.createElement('div');
    inputs.className = 'flowchart-operator-inputs';
    inputs.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
    `;

    Object.entries(operatorData.properties.inputs || {}).forEach(([inputId, inputData]) => {
      const input = document.createElement('div');
      input.className = 'flowchart-operator-connector flowchart-operator-input';
      input.dataset.connectorId = inputId;
      input.dataset.operatorId = operatorId;
      input.style.cssText = `
        width: 12px;
        height: 12px;
        background: #10b981;
        border-radius: 50%;
        border: 2px solid white;
        cursor: pointer;
        transition: all 0.2s ease;
      `;
      input.title = inputData.label;
      
      // Add hover effects
      input.addEventListener('mouseenter', () => {
        input.style.transform = 'scale(1.2)';
        input.style.background = '#059669';
      });
      
      input.addEventListener('mouseleave', () => {
        input.style.transform = 'scale(1)';
        input.style.background = '#10b981';
      });

      inputs.appendChild(input);
    });

    // Outputs
    const outputs = document.createElement('div');
    outputs.className = 'flowchart-operator-outputs';
    outputs.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
    `;

    Object.entries(operatorData.properties.outputs || {}).forEach(([outputId, outputData]) => {
      const output = document.createElement('div');
      output.className = 'flowchart-operator-connector flowchart-operator-output';
      output.dataset.connectorId = outputId;
      output.dataset.operatorId = operatorId;
      output.style.cssText = `
        width: 12px;
        height: 12px;
        background: #ef4444;
        border-radius: 50%;
        border: 2px solid white;
        cursor: pointer;
        transition: all 0.2s ease;
      `;
      output.title = outputData.label;
      
      // Add hover effects
      output.addEventListener('mouseenter', () => {
        output.style.transform = 'scale(1.2)';
        output.style.background = '#dc2626';
      });
      
      output.addEventListener('mouseleave', () => {
        output.style.transform = 'scale(1)';
        output.style.background = '#ef4444';
      });

      outputs.appendChild(output);
    });

    inputsOutputs.appendChild(inputs);
    inputsOutputs.appendChild(outputs);

    operator.appendChild(title);
    operator.appendChild(inputsOutputs);

    // Add event listeners
    operator.addEventListener('mousedown', (e) => handleOperatorMouseDown(e, operatorId));
    operator.addEventListener('click', (e) => handleOperatorClick(e, operatorId));
    operator.addEventListener('mouseenter', () => {
      operator.style.borderColor = '#fbbf24';
      operator.style.boxShadow = '0 4px 8px rgba(0,0,0,0.4)';
    });
    operator.addEventListener('mouseleave', () => {
      if (selectedOperator !== operatorId) {
        operator.style.borderColor = '#374151';
        operator.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
      }
    });

    container.appendChild(operator);
  };

  const createLink = (linkId, linkData, container) => {
    const fromOperator = data.operators[linkData.fromOperator];
    const toOperator = data.operators[linkData.toOperator];
    
    if (!fromOperator || !toOperator) return;

    const link = document.createElement('div');
    link.className = 'flowchart-link';
    link.id = linkId;
    link.style.cssText = `
      position: absolute;
      pointer-events: none;
      z-index: 1;
    `;

    // Calculate link position and path
    const fromX = fromOperator.left + 140; // Right edge of from operator
    const fromY = fromOperator.top + 50; // Middle of from operator
    const toX = toOperator.left; // Left edge of to operator
    const toY = toOperator.top + 50; // Middle of to operator

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    path.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    `;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = `M ${fromX} ${fromY} Q ${(fromX + toX) / 2} ${Math.min(fromY, toY) - 50} ${toX} ${toY}`;
    line.setAttribute('d', d);
    line.setAttribute('stroke', linkData.color || '#6b7280');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('fill', 'none');
    line.setAttribute('marker-end', 'url(#arrowhead)');

    // Add arrow marker
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
    polygon.setAttribute('fill', linkData.color || '#6b7280');

    marker.appendChild(polygon);
    defs.appendChild(marker);
    path.appendChild(defs);
    path.appendChild(line);

    link.appendChild(path);
    container.appendChild(link);
  };

  const getOperatorColor = (type) => {
    switch (type) {
      case 'recon': return '#3b82f6'; // Blue
      case 'scan': return '#f59e0b'; // Yellow
      case 'vuln': return '#ef4444'; // Red
      case 'exploit': return '#8b5cf6'; // Purple
      case 'post': return '#10b981'; // Green
      default: return '#6b7280'; // Gray
    }
  };

  const handleOperatorMouseDown = (e, operatorId) => {
    e.preventDefault();
    setIsDragging(true);
    setSelectedOperator(operatorId);
    
    const operator = e.target.closest('.flowchart-operator');
    if (operator) {
      const rect = operator.getBoundingClientRect();
      const canvasRect = canvasRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      
      operator.style.zIndex = '1000';
      operator.style.opacity = '0.8';
    }
  };

  const handleOperatorClick = (e, operatorId) => {
    e.stopPropagation();
    setSelectedOperator(operatorId);
    if (onOperatorSelect) {
      onOperatorSelect(operatorId, data.operators[operatorId]);
    }
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !selectedOperator) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasRect = canvas.getBoundingClientRect();
    const newX = e.clientX - canvasRect.left - dragOffset.x;
    const newY = e.clientY - canvasRect.top - dragOffset.y;

    const operator = canvas.querySelector(`#${selectedOperator}`);
    if (operator) {
      operator.style.left = `${newX}px`;
      operator.style.top = `${newY}px`;
    }
  };

  const handleMouseUp = () => {
    if (isDragging && selectedOperator) {
      const operator = canvasRef.current?.querySelector(`#${selectedOperator}`);
      if (operator) {
        const newPosition = {
          top: parseInt(operator.style.top),
          left: parseInt(operator.style.left)
        };
        
        if (onOperatorMove) {
          onOperatorMove(selectedOperator, newPosition);
        }
        
        operator.style.zIndex = 'auto';
        operator.style.opacity = '1';
      }
    }
    
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, selectedOperator, dragOffset]);

  return (
    <div 
      ref={canvasRef}
      className="flowchart-canvas"
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: '#1f2937',
        border: '2px dashed #374151',
        borderRadius: '8px',
        minHeight: '500px'
      }}
    />
  );
};

export default Flowchart;


