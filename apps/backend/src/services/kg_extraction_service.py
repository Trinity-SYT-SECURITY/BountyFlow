"""
Knowledge Graph Extraction Service for BountyFlow
Entity and relationship extraction using configured AI provider (Gemini, OpenAI, or Anthropic)
"""

import logging
import re
from typing import Dict, Any, List, Optional, Set, Tuple
from datetime import datetime
import json

logger = logging.getLogger(__name__)


class KnowledgeGraphExtractionService:
    """
    Service for extracting knowledge graphs from unstructured text.
    Uses configured AI provider - Gemini, OpenAI, or Anthropic.
    """
    
    def __init__(self):
        """
        Initialize Knowledge Graph Extraction Service
        Routes through ai_service.generate_content_async() for multi-provider support.
        """
        pass
    
    def is_available(self) -> bool:
        """Check if KG extraction service is available (any AI provider configured)"""
        from .ai_service import _is_ai_available
        return _is_ai_available()
    
    async def extract_from_tool_output(
        self,
        tool_name: str,
        command: str,
        output: str,
        target: Optional[str] = None,
        context: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Extract knowledge graph from tool execution output
        
        Args:
            tool_name: Name of the tool executed
            command: Command that was executed
            output: Tool output text
            target: Target the tool was run against
            context: Additional context for extraction
            
        Returns:
            Dict with entities and relations or None if extraction fails
        """
        if not self.is_available():
            logger.warning("KG extraction not available - service not initialized")
            return None
        
        try:
            # Build extraction prompt
            prompt = self._build_extraction_prompt(
                tool_name=tool_name,
                command=command,
                output=output,
                target=target,
                context=context
            )
            
            # Extract using configured AI provider (Gemini, OpenAI, or Anthropic)
            from .ai_service import ai_service
            response_text = await ai_service.generate_content_async(prompt)
            
            # Parse response
            result = self._parse_extraction_response(response_text)
            
            if result:
                logger.info(
                    f"Extracted KG from {tool_name}: "
                    f"{len(result.get('entities', []))} entities, "
                    f"{len(result.get('relations', []))} relations"
                )
            
            return result
            
        except Exception as e:
            logger.error(f"Failed to extract KG from tool output: {e}", exc_info=True)
            return None
    
    def _build_extraction_prompt(
        self,
        tool_name: str,
        command: str,
        output: str,
        target: Optional[str] = None,
        context: Optional[str] = None
    ) -> str:
        """Build prompt for entity and relationship extraction"""
        
        # Limit output size for context window
        if len(output) > 8000:
            output = output[:4000] + "\n... [truncated] ...\n" + output[-4000:]
        
        prompt = f"""You are an expert penetration testing analyst. Extract entities and relationships from the following tool output.

**Tool Information:**
- Tool: {tool_name}
- Command: {command}
- Target: {target or 'N/A'}
{f"- Context: {context}" if context else ""}

**Tool Output:**
```
{output}
```

**Instructions:**
1. Extract all relevant entities (IP addresses, domains, services, ports, vulnerabilities, users, files, etc.)
2. Identify relationships between entities (e.g., "192.168.1.1 runs Apache", "port 80 provides HTTP")
3. Focus on security-relevant information
4. Use clear, consistent naming

**Output Format (JSON):**
{{
  "entities": [
    {{"name": "192.168.1.1", "type": "ip_address", "attributes": {{}}}},
    {{"name": "Apache 2.4", "type": "service", "attributes": {{"version": "2.4"}}}},
    {{"name": "port 80", "type": "port", "attributes": {{"number": 80, "protocol": "tcp"}}}}
  ],
  "relations": [
    {{"source": "192.168.1.1", "type": "has_port", "target": "port 80"}},
    {{"source": "port 80", "type": "runs_service", "target": "Apache 2.4"}}
  ]
}}

**Important:**
- Be specific and accurate
- Use actual data from the output, don't make assumptions
- Return ONLY the JSON, no additional text
- If no entities found, return {{"entities": [], "relations": []}}
"""
        
        return prompt
    
    def _parse_extraction_response(self, response_text: str) -> Optional[Dict[str, Any]]:
        """Parse AI response to extract entities and relations — with truncation recovery"""
        try:
            # Try to find JSON in response
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                raw = json_match.group()
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    # AI response was likely truncated — try to repair
                    data = self._repair_truncated_json(raw)

                if data and 'entities' in data and 'relations' in data:
                    return {
                        'entities': data['entities'],
                        'relations': data['relations']
                    }
                # Has entities but relations got cut off
                if data and 'entities' in data:
                    return {
                        'entities': data['entities'],
                        'relations': data.get('relations', [])
                    }

            logger.warning("Failed to parse extraction response as JSON")
            return None

        except Exception as e:
            logger.error(f"Error parsing extraction response: {e}")
            return None

    def _repair_truncated_json(self, raw: str) -> Optional[Dict[str, Any]]:
        """Attempt to repair truncated JSON from AI responses"""
        try:
            # Strategy 1: Close any open arrays/objects
            repaired = raw.rstrip()
            # Remove trailing comma if present
            repaired = re.sub(r',\s*$', '', repaired)

            # Count open brackets
            open_brackets = repaired.count('[') - repaired.count(']')
            open_braces = repaired.count('{') - repaired.count('}')

            # If inside a string, try to close it
            # Find if we have an unterminated string
            if repaired.count('"') % 2 != 0:
                repaired += '"'

            # Close open arrays and objects
            repaired += ']' * max(0, open_brackets)
            repaired += '}' * max(0, open_braces)

            data = json.loads(repaired)
            logger.info(f"Successfully repaired truncated JSON ({len(raw)} chars)")
            return data
        except json.JSONDecodeError:
            pass

        # Strategy 2: Extract just the entities array if relations got cut
        try:
            entities_match = re.search(r'"entities"\s*:\s*(\[.*?\])', raw, re.DOTALL)
            if entities_match:
                entities = json.loads(entities_match.group(1))
                # Try to get relations too
                relations = []
                relations_match = re.search(r'"relations"\s*:\s*(\[.*?\])', raw, re.DOTALL)
                if relations_match:
                    try:
                        relations = json.loads(relations_match.group(1))
                    except json.JSONDecodeError:
                        pass
                logger.info(f"Recovered {len(entities)} entities, {len(relations)} relations from truncated JSON")
                return {'entities': entities, 'relations': relations}
        except Exception:
            pass

        logger.warning("Could not repair truncated JSON")
        return None
    
    async def extract_from_finding(
        self,
        title: str,
        description: str,
        severity: str,
        target: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Extract knowledge graph from a security finding"""
        if not self.is_available():
            return None
        
        try:
            prompt = f"""Extract entities and relationships from this security finding:

**Finding:**
- Title: {title}
- Severity: {severity}
- Target: {target or 'N/A'}
- Description: {description}

Extract entities (vulnerabilities, affected systems, attack vectors) and relationships.
Return JSON format: {{"entities": [...], "relations": [...]}}
"""
            
            from .ai_service import ai_service
            response_text = await ai_service.generate_content_async(prompt)
            
            return self._parse_extraction_response(response_text)
            
        except Exception as e:
            logger.error(f"Failed to extract KG from finding: {e}", exc_info=True)
            return None
    
    def convert_to_native_format(
        self,
        extraction_result: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Convert extraction result to BountyFlow's native format
        
        Args:
            extraction_result: Dict with 'entities' and 'relations'
            
        Returns:
            Dict with nodes and edges in BountyFlow format
        """
        nodes = []
        edges = []
        
        # Convert entities to nodes
        for entity in extraction_result.get('entities', []):
            nodes.append({
                "label": entity.get('name', 'Unknown'),
                "type": entity.get('type', 'entity'),
                "data": {
                    "name": entity.get('name', 'Unknown'),
                    "entity_type": entity.get('type', 'entity'),
                    "attributes": entity.get('attributes', {}),
                    "source": "kg_extraction"
                }
            })
        
        # Convert relations to edges
        for relation in extraction_result.get('relations', []):
            edges.append({
                "source": relation.get('source', ''),
                "target": relation.get('target', ''),
                "type": relation.get('type', 'related_to'),
                "data": {
                    "relation_type": relation.get('type', 'related_to'),
                    "source": "kg_extraction"
                }
            })
        
        return {
            "nodes": nodes,
            "edges": edges,
            "statistics": {
                "entity_count": len(nodes),
                "relation_count": len(edges)
            }
        }
    
    def deduplicate_entities(
        self,
        entities: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Simple deduplication based on entity names
        More advanced: could use embeddings for semantic similarity
        """
        seen = set()
        deduplicated = []
        
        for entity in entities:
            name_lower = entity.get('name', '').lower().strip()
            if name_lower and name_lower not in seen:
                seen.add(name_lower)
                deduplicated.append(entity)
        
        return deduplicated


# Global instance
kg_extraction_service = KnowledgeGraphExtractionService()
