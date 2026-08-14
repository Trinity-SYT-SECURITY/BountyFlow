"""
Report Generation Service for BountyFlow
Handles AI-powered report generation, data aggregation, and content management
"""

import logging
from typing import Dict, List, Any, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from ..models.models import Project, Target, ToolExecution, KnowledgeNode, Tool
from .ai_service import AIService

logger = logging.getLogger(__name__)

class ReportService:
    """Service for generating and managing penetration testing reports"""
    
    def __init__(self):
        self.ai_service = AIService()
    
    async def aggregate_project_data(
        self, 
        db: AsyncSession, 
        project_id: int,
        include_executions: Optional[List[int]] = None,
        include_findings: Optional[List[int]] = None
    ) -> Dict[str, Any]:
        """
        Aggregate all project data for report generation
        """
        try:
            # Get project
            project_result = await db.execute(select(Project).where(Project.id == project_id))
            project = project_result.scalar_one_or_none()
            if not project:
                return {}
            
            # Get targets
            targets_result = await db.execute(
                select(Target).where(Target.project_id == project_id)
            )
            targets = targets_result.scalars().all()
            
            # Get findings
            findings_query = select(KnowledgeNode).where(
                and_(
                    KnowledgeNode.project_id == project_id,
                    KnowledgeNode.node_type == "finding"
                )
            )
            if include_findings:
                findings_query = findings_query.where(KnowledgeNode.id.in_(include_findings))
            
            findings_result = await db.execute(findings_query)
            findings = findings_result.scalars().all()
            
            # Get tool executions
            executions_query = select(ToolExecution).where(
                ToolExecution.project_id == project_id,
                ToolExecution.execution_status == "completed"
            )
            if include_executions:
                executions_query = executions_query.where(ToolExecution.id.in_(include_executions))
            
            executions_result = await db.execute(executions_query)
            executions = executions_result.scalars().all()
            
            # Get tools for executions
            tool_ids = list(set([e.tool_id for e in executions if e.tool_id]))
            tools = []
            if tool_ids:
                tools_result = await db.execute(select(Tool).where(Tool.id.in_(tool_ids)))
                tools = tools_result.scalars().all()
            
            # Format data
            return {
                "project": {
                    "id": project.id,
                    "name": project.name,
                    "description": project.description,
                    "company_name": project.company_name,
                    "target_scope": project.target_scope,
                    "status": project.status
                },
                "targets": [
                    {
                        "id": t.id,
                        "type": t.target_type,
                        "value": t.target_value,
                        "status": t.status,
                        "priority": t.priority
                    }
                    for t in targets
                ],
                "findings": [
                    {
                        "id": f.id,
                        "title": f.node_data.get("title", "") if isinstance(f.node_data, dict) else "",
                        "description": f.node_data.get("description", "") if isinstance(f.node_data, dict) else "",
                        "severity": f.node_data.get("severity", "info") if isinstance(f.node_data, dict) else "info",
                        "status": f.node_data.get("status", "open") if isinstance(f.node_data, dict) else "open",
                        "target_id": f.target_id
                    }
                    for f in findings
                ],
                "executions": [
                    {
                        "id": e.id,
                        "tool_id": e.tool_id,
                        "tool_name": next((t.name for t in tools if t.id == e.tool_id), "Unknown Tool"),
                        "target_id": e.target_id,
                        "command_executed": e.command_executed,
                        "output": e.output or "",
                        "error_output": e.error_output or "",
                        "exit_code": e.exit_code,
                        "start_time": e.start_time.isoformat() if e.start_time else None,
                        "end_time": e.end_time.isoformat() if e.end_time else None
                    }
                    for e in executions
                ],
                "statistics": {
                    "total_targets": len(targets),
                    "total_findings": len(findings),
                    "total_executions": len(executions),
                    "findings_by_severity": {
                        "critical": sum(1 for f in findings if (isinstance(f.node_data, dict) and f.node_data.get("severity", "").lower() == "critical")),
                        "high": sum(1 for f in findings if (isinstance(f.node_data, dict) and f.node_data.get("severity", "").lower() == "high")),
                        "medium": sum(1 for f in findings if (isinstance(f.node_data, dict) and f.node_data.get("severity", "").lower() == "medium")),
                        "low": sum(1 for f in findings if (isinstance(f.node_data, dict) and f.node_data.get("severity", "").lower() == "low"))
                    }
                }
            }
        except Exception as e:
            logger.error(f"Error aggregating project data: {e}", exc_info=True)
            return {}
    
    async def generate_report_with_ai(
        self,
        db: AsyncSession,
        project_id: int,
        report_type: str,
        include_executions: Optional[List[int]] = None,
        include_findings: Optional[List[int]] = None
    ) -> str:
        """
        Generate markdown report content using AI based on project data
        """
        # Aggregate project data
        project_data = await self.aggregate_project_data(
            db, project_id, include_executions, include_findings
        )
        
        if not project_data:
            return "# Report Generation Error\n\nUnable to retrieve project data."
        
        # Build AI prompt
        prompt = self._build_report_generation_prompt(project_data, report_type)
        
        # Generate report with AI (uses configured provider: Gemini, OpenAI, or Anthropic)
        from .ai_service import _is_ai_available
        if _is_ai_available():
            try:
                markdown_content = await self.ai_service.generate_content_async(prompt)

                # Ensure it's proper markdown
                if not markdown_content.strip().startswith("#"):
                    markdown_content = f"# {project_data['project']['name']} - Security Assessment Report\n\n{markdown_content}"

                # Fix lazy numbered lists (1. 1. 1. → 1. 2. 3.)
                markdown_content = self._fix_lazy_numbering(markdown_content)

                return markdown_content
            except Exception as e:
                logger.error(f"AI report generation failed: {e}", exc_info=True)
                # Fallback to template-based generation
                return self._generate_template_report(project_data, report_type)
        else:
            # AI not available, use template
            logger.warning("No AI provider configured, using template-based report generation")
            return self._generate_template_report(project_data, report_type)
    
    @staticmethod
    def _fix_lazy_numbering(md: str) -> str:
        """Fix lazy markdown numbered lists where AI outputs 1. 1. 1. instead of 1. 2. 3."""
        import re
        lines = md.split('\n')
        result = []
        counters = {}  # indent_level -> current counter

        for line in lines:
            m = re.match(r'^(\s*)\d+\.\s', line)
            if m:
                indent = len(m.group(1))
                for k in list(counters.keys()):
                    if k > indent:
                        del counters[k]
                counters[indent] = counters.get(indent, 0) + 1
                result.append(re.sub(r'^(\s*)\d+\.', f'{m.group(1)}{counters[indent]}.', line, count=1))
            else:
                stripped = line.strip()
                if stripped.startswith('#'):
                    counters.clear()
                elif stripped and not re.match(r'^\s*[-*+]\s', line) and not line.startswith((' ', '\t')):
                    # Non-blank, non-indented, non-bullet content (i.e. a paragraph)
                    # signals a new context — reset numbering.
                    # Blank lines do NOT reset (they appear between loose list items).
                    counters.clear()
                result.append(line)

        return '\n'.join(result)

    @staticmethod
    def _normalize_list_indent(md: str) -> str:
        """Re-indent sub-list items so the Python markdown parser nests them correctly.

        AI models typically use 2-space indentation for nested lists, but
        Python-Markdown needs 4 spaces (one tab_length) per nesting level.
        Detects the smallest indent used on list-item lines and scales all
        list-item indents so one level equals 4 spaces.
        """
        import re
        lines = md.split('\n')

        min_indent = None
        for line in lines:
            m = re.match(r'^( +)([-*+]|\d+\.)\s', line)
            if m:
                n = len(m.group(1))
                if min_indent is None or n < min_indent:
                    min_indent = n

        if min_indent is None or min_indent >= 4:
            return md

        scale = 4.0 / min_indent

        result = []
        for line in lines:
            m = re.match(r'^( +)([-*+]|\d+\.)\s', line)
            if m:
                new_indent = round(len(m.group(1)) * scale)
                result.append(' ' * new_indent + line.lstrip())
            else:
                result.append(line)

        return '\n'.join(result)

    @staticmethod
    def _fix_ol_start_attributes(html: str) -> str:
        """Add start= to <ol> tags that should continue numbering from a prior list.

        When the markdown parser emits separate <ol> blocks for what is
        conceptually one numbered list (common with loose-list markdown),
        each <ol> restarts at 1.  This post-processes the HTML so that
        consecutive <ol> blocks within the same section share a running
        count via the ``start`` attribute.  Headings reset the count.
        """
        import re
        tokens = re.split(r'(<ol[^>]*>|</ol>)', html)
        result = []
        running_count = 0
        ol_depth = 0

        for token in tokens:
            if re.match(r'<ol[^>]*>', token):
                ol_depth += 1
                if ol_depth == 1 and running_count > 0 and 'start=' not in token:
                    start_val = running_count + 1
                    if token == '<ol>':
                        token = f'<ol start="{start_val}">'
                    else:
                        token = token.replace('<ol ', f'<ol start="{start_val}" ', 1)
                result.append(token)
            elif token == '</ol>':
                ol_depth -= 1
                result.append(token)
            else:
                if ol_depth == 1:
                    running_count += len(re.findall(r'<li', token))
                elif ol_depth == 0:
                    if re.search(r'<h[1-6]', token):
                        running_count = 0
                result.append(token)

        return ''.join(result)

    def _build_report_generation_prompt(self, project_data: Dict[str, Any], report_type: str) -> str:
        """Build AI prompt for report generation"""
        findings_text = "\n".join([
            f"- **{f['title']}** ({f['severity'].upper()}): {f['description'][:200]}..."
            for f in project_data.get("findings", [])[:20]  # Limit to first 20
        ])
        
        # Format tool executions with full output for AI report generation
        executions_text = "\n".join([
            f"""- **{e['tool_name']}** (Execution ID: {e['id']})
  - Target: {e.get('target_id', 'N/A')}
  - Command: `{e['command_executed']}`
  - Exit Code: {e.get('exit_code', 'N/A')}
  - Output ({len(e.get('output', ''))} chars):
    ```
    {e['output'][:2000]}{'... [Output truncated, full output available in database]' if len(e.get('output', '')) > 2000 else ''}
    ```
  - Error Output: {e.get('error_output', 'None')[:500] if e.get('error_output') else 'None'}
  - Executed: {e.get('start_time', 'N/A')}"""
            for e in project_data.get("executions", [])[:15]  # Limit to first 15 for prompt size
        ])
        
        prompt = f"""Generate a professional penetration testing report in Markdown format for the following project.

**Project Information:**
- Name: {project_data['project']['name']}
- Company: {project_data['project'].get('company_name', 'N/A')}
- Description: {project_data['project'].get('description', '')}

**Test Scope:**
{project_data['project'].get('target_scope', {})}

**Statistics:**
- Total Targets: {project_data['statistics']['total_targets']}
- Total Findings: {project_data['statistics']['total_findings']}
- Total Tool Executions: {project_data['statistics']['total_executions']}
- Findings by Severity:
  - Critical: {project_data['statistics']['findings_by_severity']['critical']}
  - High: {project_data['statistics']['findings_by_severity']['high']}
  - Medium: {project_data['statistics']['findings_by_severity']['medium']}
  - Low: {project_data['statistics']['findings_by_severity']['low']}

**Key Findings:**
{findings_text if findings_text else "No findings available"}

**Tool Executions:**
{executions_text if executions_text else "No tool executions available"}

**Report Type:** {report_type}

Please generate a comprehensive, professional security assessment report in Markdown format. Include:
1. Executive Summary
2. Methodology
3. Scope and Targets
4. Findings (organized by severity)
5. Tool Execution Results - **IMPORTANT**: Include actual tool outputs, command results, and discovered information from the tool execution outputs above. Reference specific findings from the tool outputs when describing vulnerabilities or security issues.
6. Recommendations - Based on the actual tool execution results and findings
7. Conclusion

**CRITICAL INSTRUCTIONS:**
- Analyze the tool execution outputs provided above to extract actual discovered information (open ports, services, vulnerabilities, etc.)
- Reference specific tool outputs when describing findings
- Include relevant excerpts from tool outputs in the report to support your findings
- Keep the report professional, clear, and actionable
- Base all recommendations on the actual data from tool executions, not generic advice

**MARKDOWN FORMATTING RULES (follow strictly):**
- Use `#`, `##`, `###` for section headers — never use `**bold**` as section headers
- For grouped recommendations (e.g., Network Security, Application Security), use nested lists:
  ```
  - **Network Security**
    - Implement firewall rules to restrict access to port 22
    - Disable unused services on exposed interfaces
  - **Application Security**
    - Update Apache to the latest version
    - Enable HTTPS with strong TLS configuration
  ```
- Always leave a blank line before the start of a bullet list
- Use fenced code blocks (triple backticks) for commands and tool outputs
- Use tables for structured data (e.g., findings summary, port lists)
- Never use `**Bold Text**` on its own line as a substitute for a heading or list parent — always use either a markdown heading (`###`) or a bold item inside a list (`- **Category**`)
"""
        return prompt
    
    def _generate_template_report(self, project_data: Dict[str, Any], report_type: str) -> str:
        """Generate report using template when AI is not available"""
        project = project_data.get("project", {})
        stats = project_data.get("statistics", {})
        findings = project_data.get("findings", [])
        executions = project_data.get("executions", [])
        
        markdown = f"""# {project.get('name', 'Security Assessment')} - {report_type.title()} Report

**Generated:** {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}

## Executive Summary

This security assessment report presents the findings from the penetration testing engagement for **{project.get('company_name', 'Client')}**.

### Key Statistics

- **Total Targets Tested:** {stats.get('total_targets', 0)}
- **Total Findings:** {stats.get('total_findings', 0)}
- **Tool Executions:** {stats.get('total_executions', 0)}

### Findings by Severity

- **Critical:** {stats.get('findings_by_severity', {}).get('critical', 0)}
- **High:** {stats.get('findings_by_severity', {}).get('high', 0)}
- **Medium:** {stats.get('findings_by_severity', {}).get('medium', 0)}
- **Low:** {stats.get('findings_by_severity', {}).get('low', 0)}

## Methodology

The assessment was conducted using automated and manual testing techniques, including:

- Network scanning and enumeration
- Vulnerability assessment
- Manual penetration testing
- Security configuration review

## Scope and Targets

### In-Scope Targets

{self._format_targets(project_data.get('targets', []))}

## Findings

"""
        
        # Group findings by severity
        findings_by_severity = {"critical": [], "high": [], "medium": [], "low": []}
        for finding in findings:
            severity = finding.get("severity", "low").lower()
            if severity in findings_by_severity:
                findings_by_severity[severity].append(finding)
        
        for severity in ["critical", "high", "medium", "low"]:
            if findings_by_severity[severity]:
                markdown += f"### {severity.upper()} Severity Findings\n\n"
                for finding in findings_by_severity[severity]:
                    markdown += f"#### {finding.get('title', 'Untitled Finding')}\n\n"
                    markdown += f"**Description:** {finding.get('description', 'No description provided.')}\n\n"
                    markdown += f"**Status:** {finding.get('status', 'open')}\n\n"
        
        if executions:
            markdown += "## Tool Execution Results\n\n"
            for exec in executions[:10]:  # Limit to first 10
                formatted = self.format_execution_for_report(exec, include_output=True, redact_sensitive=False)
                markdown += formatted + "\n\n"
        
        markdown += "## Recommendations\n\n"
        markdown += "Based on the findings, the following recommendations are provided:\n\n"
        markdown += "1. Address critical and high-severity findings immediately\n"
        markdown += "2. Implement proper security controls and monitoring\n"
        markdown += "3. Regular security assessments and penetration testing\n\n"
        
        markdown += "## Conclusion\n\n"
        markdown += "This assessment identified multiple security issues that require attention. "
        markdown += "Immediate remediation of critical and high-severity findings is recommended.\n"
        
        return markdown
    
    def _format_targets(self, targets: List[Dict[str, Any]]) -> str:
        """Format targets list for markdown"""
        if not targets:
            return "No targets specified."
        
        result = "| Type | Value | Status | Priority |\n"
        result += "|------|-------|--------|----------|\n"
        for target in targets[:20]:  # Limit to first 20
            result += f"| {target.get('type', 'N/A')} | {target.get('value', 'N/A')} | {target.get('status', 'N/A')} | {target.get('priority', 'N/A')} |\n"
        
        return result
    
    def format_execution_for_report(self, execution: Dict[str, Any], include_output: bool = True, redact_sensitive: bool = False) -> str:
        """Format a tool execution result for inclusion in report"""
        markdown = f"### {execution.get('tool_name', 'Unknown Tool')}\n\n"
        markdown += f"**Command Executed:**\n```bash\n{execution.get('command_executed', 'N/A')}\n```\n\n"
        
        if execution.get('exit_code') is not None:
            status_icon = "✅" if execution.get('exit_code') == 0 else "❌"
            markdown += f"**Exit Code:** {execution.get('exit_code')} {status_icon}\n\n"
        
        if include_output and execution.get('output'):
            output = execution.get('output', '')
            if redact_sensitive:
                output = self._redact_sensitive_info(output)
            markdown += f"**Output:**\n```\n{output[:2000]}{'...' if len(output) > 2000 else ''}\n```\n\n"
        
        if execution.get('error_output'):
            error_output = execution.get('error_output', '')
            if redact_sensitive:
                error_output = self._redact_sensitive_info(error_output)
            markdown += f"**Errors:**\n```\n{error_output[:1000]}{'...' if len(error_output) > 1000 else ''}\n```\n\n"
        
        if execution.get('start_time'):
            markdown += f"**Executed At:** {execution.get('start_time')}\n\n"
        
        return markdown
    
    def _redact_sensitive_info(self, text: str) -> str:
        """Redact sensitive information from text"""
        import re
        # Redact IP addresses
        text = re.sub(r'\b(?:\d{1,3}\.){3}\d{1,3}\b', '[REDACTED_IP]', text)
        # Redact email addresses
        text = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[REDACTED_EMAIL]', text)
        # Redact API keys (common patterns)
        text = re.sub(r'(?i)(api[_-]?key|apikey|secret[_-]?key|token)\s*[=:]\s*["\']?[A-Za-z0-9_-]{20,}["\']?', r'\1=[REDACTED]', text)
        # Redact passwords
        text = re.sub(r'(?i)(password|passwd|pwd)\s*[=:]\s*["\']?[^\s"\']+["\']?', r'\1=[REDACTED]', text)
        return text
    
    async def summarize_execution_output(self, execution: Dict[str, Any], max_length: int = 500) -> str:
        """Use AI to summarize long tool execution output. Uses configured provider (Gemini, OpenAI, or Anthropic)."""
        from .ai_service import _is_ai_available

        if not _is_ai_available():
            # Fallback: truncate if AI not available
            output = execution.get('output', '')
            if len(output) <= max_length:
                return output
            return output[:max_length] + "...\n\n(Output truncated. Full output available in database.)"
        
        try:
            output = execution.get('output', '')
            if len(output) <= max_length:
                return output
            
            command = execution.get('command_executed', 'N/A')
            tool_name = execution.get('tool_name', 'Unknown Tool')
            
            prompt = f"""Summarize the following tool execution output in a concise, professional manner for a penetration testing report.

**Tool:** {tool_name}
**Command:** {command}
**Output Length:** {len(output)} characters

Please provide:
1. A brief summary of what the tool discovered
2. Key findings or important information
3. Any security-relevant details

Keep the summary under {max_length} words and maintain a professional tone suitable for a security assessment report.

**Full Output:**
{output[:5000]}...
"""

            return await self.ai_service.generate_content_async(prompt)
        except Exception as e:
            logger.error(f"Error summarizing execution output: {e}", exc_info=True)
            # Fallback: truncate
            return execution.get('output', '')[:max_length] + "...\n\n(Output truncated. Full output available in database.)"

