"""
Multi-Model AI Adapter for BountyFlow
Supports multiple AI providers: Gemini, OpenAI, Anthropic.
Uses Strategy pattern for flexible model switching.
"""

import os
import logging
import json
from typing import Dict, Any, List, Optional, Protocol
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class AIModelProvider(str, Enum):
    """Supported AI model providers"""
    GEMINI = "gemini"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"


@dataclass
class AnalysisResult:
    """Standardized analysis result from any AI model"""
    summary: str
    attack_phase: Optional[str] = None  # reconnaissance, exploitation, post-exploitation, etc.
    mitre_techniques: List[str] = None  # MITRE ATT&CK technique IDs
    tags: List[str] = None
    confidence: float = 0.0  # 0.0 to 1.0
    raw_response: Optional[Dict[str, Any]] = None
    
    def __post_init__(self):
        if self.mitre_techniques is None:
            self.mitre_techniques = []
        if self.tags is None:
            self.tags = []


@dataclass
class NormalizedData:
    """Standardized data structure for tool outputs"""
    targets: List[Dict[str, Any]]
    findings: List[Dict[str, Any]]
    discovered_users: List[Dict[str, Any]]
    discovered_files: List[Dict[str, Any]]
    tool_executions: List[Dict[str, Any]]
    metadata: Dict[str, Any]
    confidence: float = 0.0


class AIModelAdapter(ABC):
    """Abstract base class for AI model adapters"""
    
    @abstractmethod
    async def analyze_activity(
        self,
        tool_name: str,
        command: str,
        output: str,
        target: Optional[str] = None
    ) -> AnalysisResult:
        """Analyze tool execution output and generate attack perspective"""
        pass
    
    @abstractmethod
    async def normalize_format(
        self,
        raw_data: str,
        format_hint: Optional[str] = None
    ) -> NormalizedData:
        """Normalize external tool output to BountyFlow format"""
        pass
    
    @abstractmethod
    async def extract_entities(
        self,
        text: str,
        context: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Extract entities (targets, findings, users) from text"""
        pass
    
    @abstractmethod
    def is_available(self) -> bool:
        """Check if this adapter is properly configured"""
        pass


class GeminiAdapter(AIModelAdapter):
    """Adapter for Google Gemini models - Uses new google-genai SDK"""
    
    def __init__(self, api_key: Optional[str] = None, model_name: Optional[str] = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        self.model_name = model_name or os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        self.client = None
        self._initialized = False
    
    def _ensure_initialized(self):
        """Lazy initialization"""
        if self._initialized:
            return self.client is not None
        
        self._initialized = True
        
        if not self.api_key:
            logger.warning("Gemini API key not configured")
            return False
        
        try:
            from google import genai
            self.client = genai.Client(api_key=self.api_key)
            logger.info(f"Initialized Gemini adapter with model: {self.model_name}")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize Gemini: {e}")
            return False
    
    def is_available(self) -> bool:
        return self._ensure_initialized()
    
    def _generate_content(self, prompt: str) -> str:
        """Generate content using the new GenAI SDK"""
        response = self.client.models.generate_content(
            model=self.model_name,
            contents=prompt
        )
        return response.text
    
    async def analyze_activity(
        self,
        tool_name: str,
        command: str,
        output: str,
        target: Optional[str] = None
    ) -> AnalysisResult:
        """Analyze activity from attacker perspective"""
        if not self.is_available():
            raise RuntimeError("Gemini adapter not available")
        
        prompt = self._build_analysis_prompt(tool_name, command, output, target)
        
        try:
            import asyncio
            loop = asyncio.get_event_loop()
            response_text = await loop.run_in_executor(
                None,
                lambda: self._generate_content(prompt)
            )
            
            return self._parse_analysis_response(response_text)
        except Exception as e:
            logger.error(f"Gemini analysis failed: {e}")
            return AnalysisResult(
                summary=f"Analysis failed: {str(e)}",
                confidence=0.0
            )
    
    def _build_analysis_prompt(
        self,
        tool_name: str,
        command: str,
        output: str,
        target: Optional[str]
    ) -> str:
        """Build prompt for attack perspective analysis"""
        return f"""Analyze this penetration testing activity from an attacker's perspective.

Tool: {tool_name}
Command: {command}
Target: {target or "Unknown"}
Output:
{output[:2000]}{"..." if len(output) > 2000 else ""}

Provide analysis in JSON format:
{{
    "summary": "Brief description of what this activity reveals from attacker perspective",
    "attack_phase": "reconnaissance|exploitation|post-exploitation|lateral-movement|exfiltration",
    "mitre_techniques": ["T1001", "T1059", ...],
    "tags": ["port-scan", "vulnerability-discovery", ...],
    "confidence": 0.85
}}

Focus on:
1. What information was discovered
2. How an attacker could use this information
3. What attack phase this represents
4. Relevant MITRE ATT&CK techniques"""
    
    def _parse_analysis_response(self, response_text: str) -> AnalysisResult:
        """Parse Gemini response into AnalysisResult"""
        try:
            # Try to extract JSON from response
            json_start = response_text.find("{")
            json_end = response_text.rfind("}") + 1
            
            if json_start >= 0 and json_end > json_start:
                json_str = response_text[json_start:json_end]
                data = json.loads(json_str)
                
                return AnalysisResult(
                    summary=data.get("summary", "No summary available"),
                    attack_phase=data.get("attack_phase"),
                    mitre_techniques=data.get("mitre_techniques", []),
                    tags=data.get("tags", []),
                    confidence=float(data.get("confidence", 0.0)),
                    raw_response=data
                )
        except Exception as e:
            logger.warning(f"Failed to parse JSON from response: {e}")
        
        # Fallback: use raw text as summary
        return AnalysisResult(
            summary=response_text[:500],
            confidence=0.5
        )
    
    async def normalize_format(
        self,
        raw_data: str,
        format_hint: Optional[str] = None
    ) -> NormalizedData:
        """Normalize external tool output using AI"""
        if not self.is_available():
            raise RuntimeError("Gemini adapter not available")
        
        prompt = self._build_normalization_prompt(raw_data, format_hint)
        
        try:
            import asyncio
            loop = asyncio.get_event_loop()
            response_text = await loop.run_in_executor(
                None,
                lambda: self._generate_content(prompt)
            )
            
            return self._parse_normalization_response(response_text)
        except Exception as e:
            logger.error(f"Format normalization failed: {e}")
            return NormalizedData(
                targets=[],
                findings=[],
                discovered_users=[],
                discovered_files=[],
                tool_executions=[],
                metadata={},
                confidence=0.0
            )
    
    def _build_normalization_prompt(
        self,
        raw_data: str,
        format_hint: Optional[str]
    ) -> str:
        """Build prompt for format normalization"""
        return f"""Normalize this penetration testing tool output into a standardized format.

Input Format: {format_hint or "Auto-detect"}
Raw Data:
{raw_data[:3000]}{"..." if len(raw_data) > 3000 else ""}

Extract and structure the following information in JSON format:
{{
    "targets": [
        {{"type": "ip|domain|url", "value": "...", "metadata": {{}}}}
    ],
    "findings": [
        {{"title": "...", "description": "...", "severity": "critical|high|medium|low", "metadata": {{}}}}
    ],
    "discovered_users": [
        {{"username": "...", "domain": "...", "metadata": {{}}}}
    ],
    "discovered_files": [
        {{"path": "...", "type": "...", "metadata": {{}}}}
    ],
    "tool_executions": [
        {{"tool_name": "...", "command": "...", "output": "...", "timestamp": "..."}}
    ],
    "metadata": {{"source_tool": "...", "import_date": "..."}},
    "confidence": 0.85
}}"""
    
    def _parse_normalization_response(self, response_text: str) -> NormalizedData:
        """Parse normalization response"""
        try:
            json_start = response_text.find("{")
            json_end = response_text.rfind("}") + 1
            
            if json_start >= 0 and json_end > json_start:
                json_str = response_text[json_start:json_end]
                data = json.loads(json_str)
                
                return NormalizedData(
                    targets=data.get("targets", []),
                    findings=data.get("findings", []),
                    discovered_users=data.get("discovered_users", []),
                    discovered_files=data.get("discovered_files", []),
                    tool_executions=data.get("tool_executions", []),
                    metadata=data.get("metadata", {}),
                    confidence=float(data.get("confidence", 0.0))
                )
        except Exception as e:
            logger.warning(f"Failed to parse normalization response: {e}")
        
        return NormalizedData(
            targets=[],
            findings=[],
            discovered_users=[],
            discovered_files=[],
            tool_executions=[],
            metadata={},
            confidence=0.0
        )
    
    async def extract_entities(
        self,
        text: str,
        context: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Extract entities from text"""
        if not self.is_available():
            return []
        
        prompt = f"""Extract security-related entities from this text.

Context: {context or "General penetration testing"}
Text:
{text[:2000]}{"..." if len(text) > 2000 else ""}

Return JSON array of entities:
[
    {{"type": "target|finding|user|file", "name": "...", "value": "...", "metadata": {{}}}}
]"""
        
        try:
            import asyncio
            loop = asyncio.get_event_loop()
            response_text = await loop.run_in_executor(
                None,
                lambda: self._generate_content(prompt)
            )
            
            json_start = response_text.find("[")
            json_end = response_text.rfind("]") + 1
            
            if json_start >= 0 and json_end > json_start:
                json_str = response_text[json_start:json_end]
                return json.loads(json_str)
        except Exception as e:
            logger.error(f"Entity extraction failed: {e}")
        
        return []


class OpenAIAdapter(AIModelAdapter):
    """Adapter for OpenAI models (GPT-4, GPT-3.5, etc.)"""
    
    def __init__(self, api_key: Optional[str] = None, model_name: Optional[str] = None):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model_name = model_name or os.getenv("OPENAI_MODEL", "gpt-4")
        self.client = None
        self._initialized = False
    
    def _ensure_initialized(self):
        """Lazy initialization"""
        if self._initialized:
            return self.client is not None
        
        self._initialized = True
        
        if not self.api_key:
            logger.warning("OpenAI API key not configured")
            return False
        
        try:
            from openai import AsyncOpenAI
            self.client = AsyncOpenAI(api_key=self.api_key)
            logger.info(f"Initialized OpenAI adapter with model: {self.model_name}")
            return True
        except ImportError:
            logger.warning("OpenAI library not installed. Install with: pip install openai")
            return False
        except Exception as e:
            logger.error(f"Failed to initialize OpenAI: {e}")
            return False
    
    def is_available(self) -> bool:
        return self._ensure_initialized()
    
    async def analyze_activity(
        self,
        tool_name: str,
        command: str,
        output: str,
        target: Optional[str] = None
    ) -> AnalysisResult:
        """Analyze activity using OpenAI"""
        if not self.is_available():
            raise RuntimeError("OpenAI adapter not available")
        
        prompt = self._build_analysis_prompt(tool_name, command, output, target)
        
        try:
            response = await self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": "You are a penetration testing expert analyzing attack activities."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.7
            )
            
            result_text = response.choices[0].message.content
            data = json.loads(result_text)
            
            return AnalysisResult(
                summary=data.get("summary", ""),
                attack_phase=data.get("attack_phase"),
                mitre_techniques=data.get("mitre_techniques", []),
                tags=data.get("tags", []),
                confidence=float(data.get("confidence", 0.0)),
                raw_response=data
            )
        except Exception as e:
            logger.error(f"OpenAI analysis failed: {e}")
            return AnalysisResult(
                summary=f"Analysis failed: {str(e)}",
                confidence=0.0
            )
    
    def _build_analysis_prompt(
        self,
        tool_name: str,
        command: str,
        output: str,
        target: Optional[str]
    ) -> str:
        """Build analysis prompt (same as Gemini)"""
        return f"""Analyze this penetration testing activity from an attacker's perspective.

Tool: {tool_name}
Command: {command}
Target: {target or "Unknown"}
Output:
{output[:2000]}{"..." if len(output) > 2000 else ""}

Provide analysis in JSON format:
{{
    "summary": "Brief description of what this activity reveals from attacker perspective",
    "attack_phase": "reconnaissance|exploitation|post-exploitation|lateral-movement|exfiltration",
    "mitre_techniques": ["T1001", "T1059", ...],
    "tags": ["port-scan", "vulnerability-discovery", ...],
    "confidence": 0.85
}}"""
    
    async def normalize_format(
        self,
        raw_data: str,
        format_hint: Optional[str] = None
    ) -> NormalizedData:
        """Normalize format using OpenAI"""
        if not self.is_available():
            raise RuntimeError("OpenAI adapter not available")
        
        prompt = self._build_normalization_prompt(raw_data, format_hint)
        
        try:
            response = await self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": "You are a data normalization expert for penetration testing tools."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.3
            )
            
            result_text = response.choices[0].message.content
            data = json.loads(result_text)
            
            return NormalizedData(
                targets=data.get("targets", []),
                findings=data.get("findings", []),
                discovered_users=data.get("discovered_users", []),
                discovered_files=data.get("discovered_files", []),
                tool_executions=data.get("tool_executions", []),
                metadata=data.get("metadata", {}),
                confidence=float(data.get("confidence", 0.0))
            )
        except Exception as e:
            logger.error(f"OpenAI normalization failed: {e}")
            return NormalizedData(
                targets=[],
                findings=[],
                discovered_users=[],
                discovered_files=[],
                tool_executions=[],
                metadata={},
                confidence=0.0
            )
    
    def _build_normalization_prompt(
        self,
        raw_data: str,
        format_hint: Optional[str]
    ) -> str:
        """Build normalization prompt (same as Gemini)"""
        return f"""Normalize this penetration testing tool output into a standardized format.

Input Format: {format_hint or "Auto-detect"}
Raw Data:
{raw_data[:3000]}{"..." if len(raw_data) > 3000 else ""}

Extract and structure the following information in JSON format:
{{
    "targets": [{{"type": "ip|domain|url", "value": "...", "metadata": {{}}}}],
    "findings": [{{"title": "...", "description": "...", "severity": "critical|high|medium|low", "metadata": {{}}}}],
    "discovered_users": [{{"username": "...", "domain": "...", "metadata": {{}}}}],
    "discovered_files": [{{"path": "...", "type": "...", "metadata": {{}}}}],
    "tool_executions": [{{"tool_name": "...", "command": "...", "output": "...", "timestamp": "..."}}],
    "metadata": {{"source_tool": "...", "import_date": "..."}},
    "confidence": 0.85
}}"""
    
    async def extract_entities(
        self,
        text: str,
        context: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Extract entities using OpenAI"""
        if not self.is_available():
            return []
        
        prompt = f"""Extract security-related entities from this text.

Context: {context or "General penetration testing"}
Text:
{text[:2000]}{"..." if len(text) > 2000 else ""}

Return JSON array of entities:
[
    {{"type": "target|finding|user|file", "name": "...", "value": "...", "metadata": {{}}}}
]"""
        
        try:
            response = await self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": "You are an expert at extracting security entities from text."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3
            )
            
            result_text = response.choices[0].message.content
            json_start = result_text.find("[")
            json_end = result_text.rfind("]") + 1
            
            if json_start >= 0 and json_end > json_start:
                json_str = result_text[json_start:json_end]
                return json.loads(json_str)
        except Exception as e:
            logger.error(f"OpenAI entity extraction failed: {e}")
        
        return []



class AnthropicAdapter(AIModelAdapter):
    """Adapter for Anthropic Claude models"""
    
    def __init__(self, api_key: Optional[str] = None, model_name: Optional[str] = None):
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        self.model_name = model_name or os.getenv("ANTHROPIC_MODEL", "claude-3-opus-20240229")
        self.client = None
        self._initialized = False
    
    def _ensure_initialized(self):
        """Lazy initialization"""
        if self._initialized:
            return self.client is not None
        
        self._initialized = True
        
        if not self.api_key:
            logger.warning("Anthropic API key not configured")
            return False
        
        try:
            from anthropic import Anthropic
            self.client = Anthropic(api_key=self.api_key)
            logger.info(f"Initialized Anthropic adapter with model: {self.model_name}")
            return True
        except ImportError:
            logger.warning("Anthropic library not installed. Install with: pip install anthropic")
            return False
        except Exception as e:
            logger.error(f"Failed to initialize Anthropic: {e}")
            return False
    
    def is_available(self) -> bool:
        return self._ensure_initialized()
    
    async def analyze_activity(
        self,
        tool_name: str,
        command: str,
        output: str,
        target: Optional[str] = None
    ) -> AnalysisResult:
        """Analyze activity using Anthropic Claude"""
        if not self.is_available():
            raise RuntimeError("Anthropic adapter not available")
        
        prompt = self._build_analysis_prompt(tool_name, command, output, target)
        
        try:
            import asyncio
            loop = asyncio.get_event_loop()
            
            def sync_call():
                return self.client.messages.create(
                    model=self.model_name,
                    max_tokens=2048,
                    messages=[
                        {"role": "user", "content": prompt}
                    ]
                )
            
            response = await loop.run_in_executor(None, sync_call)
            
            # Extract text from response content
            result_text = ''.join(
                block.text for block in response.content 
                if hasattr(block, 'text')
            )
            
            return self._parse_analysis_response(result_text)
        except Exception as e:
            logger.error(f"Anthropic analysis failed: {e}")
            return AnalysisResult(
                summary=f"Analysis failed: {str(e)}",
                confidence=0.0
            )
    
    def _build_analysis_prompt(
        self,
        tool_name: str,
        command: str,
        output: str,
        target: Optional[str]
    ) -> str:
        """Build analysis prompt for Claude"""
        return f"""You are a penetration testing expert. Analyze this activity from an attacker's perspective.

Tool: {tool_name}
Command: {command}
Target: {target or "Unknown"}
Output:
{output[:3000]}

Provide your analysis in JSON format with the following fields:
- summary: A concise description of what this activity reveals
- attack_phase: One of reconnaissance, scanning, exploitation, post-exploitation, persistence
- mitre_techniques: List of relevant MITRE ATT&CK technique IDs (e.g., T1046, T1018)
- tags: Relevant tags for this activity
- confidence: A score from 0.0 to 1.0 indicating confidence in your analysis

Return ONLY valid JSON."""
    
    def _parse_analysis_response(self, response_text: str) -> AnalysisResult:
        """Parse Claude response"""
        try:
            json_start = response_text.find("{")
            json_end = response_text.rfind("}") + 1
            
            if json_start >= 0 and json_end > json_start:
                json_str = response_text[json_start:json_end]
                data = json.loads(json_str)
                
                return AnalysisResult(
                    summary=data.get("summary", response_text[:200]),
                    attack_phase=data.get("attack_phase"),
                    mitre_techniques=data.get("mitre_techniques", []),
                    tags=data.get("tags", []),
                    confidence=float(data.get("confidence", 0.8)),
                    raw_response=data
                )
        except Exception:
            pass
        
        return AnalysisResult(
            summary=response_text[:500],
            confidence=0.7
        )
    
    async def normalize_format(
        self,
        raw_data: str,
        format_hint: Optional[str] = None
    ) -> NormalizedData:
        """Normalize format using Claude"""
        if not self.is_available():
            return NormalizedData(
                targets=[], findings=[], discovered_users=[],
                discovered_files=[], tool_executions=[], metadata={}, confidence=0.0
            )
        
        prompt = f"""Analyze and normalize this penetration testing data into a structured format.
        
Input data (format hint: {format_hint or 'unknown'}):
{raw_data[:3000]}

Return JSON with:
- targets: List of {{target_type, target_value, priority, notes}}
- findings: List of {{title, severity, description, evidence}}
- discovered_users: List of {{username, source, notes}}
- discovered_files: List of {{file_path, file_type, notes}}
- tool_executions: List of {{tool_name, command, output_summary}}
- metadata: {{source_tool, import_date, notes}}
- confidence: 0.0 to 1.0"""

        try:
            import asyncio
            loop = asyncio.get_event_loop()
            
            def sync_call():
                return self.client.messages.create(
                    model=self.model_name,
                    max_tokens=4096,
                    messages=[{"role": "user", "content": prompt}]
                )
            
            response = await loop.run_in_executor(None, sync_call)
            result_text = ''.join(
                block.text for block in response.content 
                if hasattr(block, 'text')
            )
            
            json_start = result_text.find("{")
            json_end = result_text.rfind("}") + 1
            
            if json_start >= 0 and json_end > json_start:
                data = json.loads(result_text[json_start:json_end])
                return NormalizedData(
                    targets=data.get("targets", []),
                    findings=data.get("findings", []),
                    discovered_users=data.get("discovered_users", []),
                    discovered_files=data.get("discovered_files", []),
                    tool_executions=data.get("tool_executions", []),
                    metadata=data.get("metadata", {}),
                    confidence=float(data.get("confidence", 0.7))
                )
        except Exception as e:
            logger.error(f"Anthropic normalization failed: {e}")
        
        return NormalizedData(
            targets=[], findings=[], discovered_users=[],
            discovered_files=[], tool_executions=[], metadata={}, confidence=0.0
        )
    
    async def extract_entities(
        self,
        text: str,
        context: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Extract entities using Claude"""
        if not self.is_available():
            return []
        
        prompt = f"""Extract security-relevant entities from this text.
        
Context: {context or 'Penetration testing'}
Text:
{text[:2000]}

Return JSON array of entities: [{{"type": "ip|domain|user|service|vulnerability", "value": "...", "confidence": 0.0-1.0}}]"""

        try:
            import asyncio
            loop = asyncio.get_event_loop()
            
            def sync_call():
                return self.client.messages.create(
                    model=self.model_name,
                    max_tokens=2048,
                    messages=[{"role": "user", "content": prompt}]
                )
            
            response = await loop.run_in_executor(None, sync_call)
            result_text = ''.join(
                block.text for block in response.content 
                if hasattr(block, 'text')
            )
            
            json_start = result_text.find("[")
            json_end = result_text.rfind("]") + 1
            
            if json_start >= 0 and json_end > json_start:
                return json.loads(result_text[json_start:json_end])
        except Exception as e:
            logger.error(f"Anthropic entity extraction failed: {e}")
        
        return []


class AIModelFactory:
    """Factory for creating AI model adapters"""
    
    @staticmethod
    def create_adapter(provider: Optional[str] = None) -> AIModelAdapter:
        """Create adapter based on configuration"""
        provider = provider or os.getenv("AI_PROVIDER", "gemini").lower()
        
        if provider == AIModelProvider.GEMINI:
            return GeminiAdapter()
        elif provider == AIModelProvider.OPENAI:
            return OpenAIAdapter()
        elif provider == AIModelProvider.ANTHROPIC:
            return AnthropicAdapter()
        else:
            logger.warning(f"Unknown AI provider: {provider}, falling back to Gemini")
            return GeminiAdapter()
    
    @staticmethod
    def get_available_adapters() -> List[str]:
        """Get list of available adapters"""
        available = []
        
        try:
            if GeminiAdapter().is_available():
                available.append("gemini")
        except Exception:
            pass
        
        try:
            if OpenAIAdapter().is_available():
                available.append("openai")
        except Exception:
            pass
        
        try:
            if AnthropicAdapter().is_available():
                available.append("anthropic")
        except Exception:
            pass
        
        return available


# Global instance
ai_model_factory = AIModelFactory()

