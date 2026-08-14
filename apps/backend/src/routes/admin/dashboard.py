"""
Admin Dashboard API

Provides statistics and activity feeds for the admin dashboard.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from datetime import datetime, timedelta
from typing import List, Dict, Any
import logging

from ...models.database import get_db
from ...models.models import User, Project, Target, KnowledgeNode, AuditLog, ToolExecution, DiscoveredFile, DiscoveredUser
from ...middleware.auth import get_current_user_optional

router = APIRouter()
logger = logging.getLogger(__name__)


async def require_admin(current_user: dict = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    """Middleware to require admin privileges"""
    if not current_user or current_user.get("username") == "anonymous":
        raise HTTPException(
            status_code=401,
            detail="Authentication required"
        )
    # Check if user is admin (for now, allow all authenticated users)
    # TODO: Implement proper admin role checking
    return current_user


@router.get("/stats")
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """
    Get platform statistics for admin dashboard
    
    Returns:
    - Total users (active/inactive)
    - Total projects (by status)
    - Total targets
    - Total findings (by severity)
    - Storage usage
    """
    try:
        # User statistics
        total_users_result = await db.execute(select(func.count(User.id)))
        total_users = total_users_result.scalar()
        
        active_users_result = await db.execute(
            select(func.count(User.id)).where(User.is_active == True)
        )
        active_users = active_users_result.scalar()
        
        # Project statistics
        total_projects_result = await db.execute(select(func.count(Project.id)))
        total_projects = total_projects_result.scalar()
        
        active_projects_result = await db.execute(
            select(func.count(Project.id)).where(Project.status == 'active')
        )
        active_projects = active_projects_result.scalar()
        
        # Target statistics
        total_targets_result = await db.execute(select(func.count(Target.id)))
        total_targets = total_targets_result.scalar()
        
        # Findings statistics (from KnowledgeNode)
        findings_query = select(KnowledgeNode).where(KnowledgeNode.node_type == 'finding')
        findings_result = await db.execute(findings_query)
        findings = findings_result.scalars().all()
        
        # Count findings by severity
        severity_counts = {'critical': 0, 'high': 0, 'medium': 0, 'low': 0, 'info': 0}
        for finding in findings:
            node_data = finding.node_data or {}
            severity = node_data.get('severity', 'info').lower()
            if severity in severity_counts:
                severity_counts[severity] += 1
        
        # Recent growth (last 30 days)
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        new_users_result = await db.execute(
            select(func.count(User.id)).where(User.created_at >= thirty_days_ago)
        )
        new_users_30d = new_users_result.scalar()
        
        new_projects_result = await db.execute(
            select(func.count(Project.id)).where(Project.created_at >= thirty_days_ago)
        )
        new_projects_30d = new_projects_result.scalar()
        
        return {
            "users": {
                "total": total_users,
                "active": active_users,
                "inactive": total_users - active_users,
                "new_30d": new_users_30d
            },
            "projects": {
                "total": total_projects,
                "active": active_projects,
                "completed": total_projects - active_projects,
                "new_30d": new_projects_30d
            },
            "targets": {
                "total": total_targets
            },
            "findings": {
                "total": len(findings),
                "by_severity": severity_counts
            },
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting dashboard stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/activity-feed")
async def get_activity_feed(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """
    Get recent activity feed for admin dashboard
    
    Returns recent activities from all users including:
    - User logins
    - Project creation/updates
    - Finding submissions
    - Tool executions
    """
    try:
        # Get recent audit logs
        query = select(AuditLog).order_by(desc(AuditLog.timestamp)).limit(limit)
        result = await db.execute(query)
        logs = result.scalars().all()
        
        # Format activity feed
        activities = []
        for log in logs:
            # Get user info
            user = None
            if log.user_id:
                user_query = select(User).where(User.id == log.user_id)
                user_result = await db.execute(user_query)
                user = user_result.scalar_one_or_none()
            
            activity = {
                "id": log.id,
                "timestamp": log.timestamp.isoformat(),
                "user": {
                    "id": user.id if user else None,
                    "username": user.username if user else "Unknown"
                },
                "action": log.action,
                "entity_type": log.entity_type,
                "entity_id": log.entity_id,
                "details": log.details,
                "time_ago": _format_time_ago(log.timestamp)
            }
            activities.append(activity)
        
        return {
            "activities": activities,
            "total": len(activities)
        }
        
    except Exception as e:
        logger.error(f"Error getting activity feed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/user-stats")
async def get_user_statistics(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """
    Get per-user statistics
    
    Returns:
    - Top users by project count
    - Top users by activity
    - Inactive users
    """
    try:
        # Get all users with their project counts
        users_query = select(User)
        users_result = await db.execute(users_query)
        users = users_result.scalars().all()
        
        user_stats = []
        for user in users:
            # Count projects for this user
            projects_query = select(func.count(Project.id)).where(Project.created_by == user.id)
            projects_result = await db.execute(projects_query)
            project_count = projects_result.scalar()
            
            # Count recent activities
            thirty_days_ago = datetime.utcnow() - timedelta(days=30)
            activities_query = select(func.count(AuditLog.id)).where(
                AuditLog.user_id == user.id,
                AuditLog.timestamp >= thirty_days_ago
            )
            activities_result = await db.execute(activities_query)
            activity_count = activities_result.scalar()
            
            # Get last activity
            last_activity_query = select(AuditLog).where(
                AuditLog.user_id == user.id
            ).order_by(desc(AuditLog.timestamp)).limit(1)
            last_activity_result = await db.execute(last_activity_query)
            last_activity = last_activity_result.scalar_one_or_none()
            
            user_stats.append({
                "user_id": user.id,
                "username": user.username,
                "email": user.email,
                "is_active": user.is_active,
                "is_superuser": user.is_superuser,
                "project_count": project_count,
                "activity_count_30d": activity_count,
                "last_activity": last_activity.timestamp.isoformat() if last_activity else None,
                "created_at": user.created_at.isoformat()
            })
        
        # Sort by project count (descending)
        user_stats.sort(key=lambda x: x['project_count'], reverse=True)
        
        return {
            "users": user_stats,
            "total": len(user_stats)
        }
        
    except Exception as e:
        logger.error(f"Error getting user statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/system-alerts")
async def get_system_alerts(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """
    Get system alerts and warnings
    
    Returns:
    - Failed login attempts
    - Inactive users
    - Stale projects
    - System health issues
    """
    alerts = []
    
    try:
        # Check for failed login attempts (last 24 hours)
        twenty_four_hours_ago = datetime.utcnow() - timedelta(hours=24)
        failed_logins_query = select(func.count(AuditLog.id)).where(
            AuditLog.action == 'login_failed',
            AuditLog.timestamp >= twenty_four_hours_ago
        )
        failed_logins_result = await db.execute(failed_logins_query)
        failed_logins = failed_logins_result.scalar()
        
        if failed_logins > 10:
            alerts.append({
                "level": "warning",
                "type": "security",
                "message": f"{failed_logins} failed login attempts in the last 24 hours",
                "action": "Review audit logs for suspicious activity"
            })
        
        # Check for inactive users (30+ days)
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        inactive_users_query = select(func.count(User.id)).where(
            User.is_active == True
        )
        # TODO: Add last_login field to User model for accurate tracking
        inactive_users_result = await db.execute(inactive_users_query)
        inactive_users = inactive_users_result.scalar()
        
        # Check for stale projects (no activity in 30 days)
        stale_projects_query = select(func.count(Project.id)).where(
            Project.updated_at < thirty_days_ago,
            Project.status == 'active'
        )
        stale_projects_result = await db.execute(stale_projects_query)
        stale_projects = stale_projects_result.scalar()
        
        if stale_projects > 0:
            alerts.append({
                "level": "info",
                "type": "data",
                "message": f"{stale_projects} active projects with no activity in 30+ days",
                "action": "Consider archiving inactive projects"
            })
        
        return {
            "alerts": alerts,
            "total": len(alerts)
        }
        
    except Exception as e:
        logger.error(f"Error getting system alerts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chart-data/findings-trend")
async def get_findings_trend(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """
    Get findings trend over time for chart visualization
    Returns time series data for findings discovery
    """
    try:
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        logger.info(f"Fetching findings trend for {days} days (from {start_date} to {end_date})")
        
        # Get all findings first
        findings_query = select(KnowledgeNode).where(
            KnowledgeNode.node_type == 'finding'
        )
        findings_result = await db.execute(findings_query)
        findings = findings_result.scalars().all()
        
        logger.info(f"Total findings in database: {len(findings)}")
        
        # Filter by date in Python if created_at exists
        filtered_findings = []
        for finding in findings:
            if finding.created_at:
                # Convert to UTC if needed and compare
                finding_date = finding.created_at
                if finding_date.tzinfo is None:
                    # If naive datetime, assume UTC
                    pass
                if start_date <= finding_date <= end_date:
                    filtered_findings.append(finding)
            else:
                # If no created_at, include it (use current date as fallback)
                filtered_findings.append(finding)
        
        logger.info(f"Findings in date range: {len(filtered_findings)}")
        
        # Group by date
        daily_counts = {}
        for finding in filtered_findings:
            if finding.created_at:
                date_str = finding.created_at.date().isoformat()
            else:
                date_str = datetime.utcnow().date().isoformat()
            daily_counts[date_str] = daily_counts.get(date_str, 0) + 1
        
        # Build time series data
        series_data = []
        current_date = start_date.date()
        while current_date <= end_date.date():
            date_str = current_date.isoformat()
            series_data.append({
                "x": date_str,
                "y": daily_counts.get(date_str, 0)
            })
            current_date += timedelta(days=1)
        
        logger.info(f"Time series data points: {len(series_data)}, with {sum(daily_counts.values())} total findings in range")
        
        # Always return data structure even if empty
        # If no data in range, still return empty series for proper frontend handling
        result = {
            "series": [{
                "name": "Findings Discovered",
                "data": series_data
            }],
            "period": f"{days} days",
            "total_findings": len(filtered_findings),
            "total_all_time": len(findings)
        }
        logger.info(f"Returning findings trend data: {len(series_data)} data points, {len(filtered_findings)} findings in range")
        return result
    except Exception as e:
        logger.error(f"Error getting findings trend: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chart-data/attacks-by-category")
async def get_attacks_by_category(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """
    Get attack statistics by category
    Classifies from findings, tool executions, and activity logs
    Returns data for horizontal bar chart
    """
    try:
        from ...models.models import ActivityLog, Tool

        category_labels = {
            "recon": "Reconnaissance",
            "scan": "Scanning",
            "vuln": "Vulnerability Analysis",
            "exploit": "Exploitation",
            "post": "Post-Exploitation",
            "credential": "Credential Attacks",
            "web": "Web Application"
        }
        category_counts = {cat: 0 for cat in category_labels}

        # Keyword-based classification for each category
        category_keywords = {
            "recon": ["recon", "osint", "discover", "enum", "subdomain", "whois",
                      "harvest", "theHarvester", "amass", "subfinder", "footprint"],
            "scan": ["scan", "nmap", "masscan", "nikto", "port", "ping",
                     "fingerprint", "detect", "probe"],
            "vuln": ["vuln", "cve", "weakness", "misconfigur", "exposure",
                     "flaw", "insecure", "missing patch", "outdated"],
            "exploit": ["exploit", "rce", "injection", "sqli", "xss", "overflow",
                        "payload", "shellcode", "metasploit", "reverse shell"],
            "post": ["post-exploit", "privilege", "escalat", "lateral", "pivot",
                     "persist", "backdoor", "exfil", "c2", "beacon", "implant"],
            "credential": ["password", "credential", "brute", "hash", "crack",
                           "hydra", "john", "hashcat", "mimikatz", "dump", "ntlm"],
            "web": ["web", "http", "api", "endpoint", "directory", "gobuster",
                    "ffuf", "burp", "header", "cookie", "session", "cors", "csrf"]
        }

        # Tool category mapping
        tool_cat_map = {
            "reconnaissance": "recon",
            "enumeration": "recon",
            "scanning": "scan",
            "vulnerability": "vuln",
            "exploitation": "exploit",
            "post-exploitation": "post",
            "password": "credential",
            "credential": "credential",
            "web": "web",
        }

        # 1. Classify findings by content
        findings_query = select(KnowledgeNode).where(KnowledgeNode.node_type == 'finding')
        findings_result = await db.execute(findings_query)
        findings = findings_result.scalars().all()

        for finding in findings:
            node_data = finding.node_data or {}
            # Check explicit attack_type first
            attack_type = node_data.get('attack_type', '').lower()
            if attack_type in category_counts:
                category_counts[attack_type] += 1
                continue

            content = f"{(node_data.get('title') or '')} {(node_data.get('description') or '')}".lower()
            matched = False
            for cat, keywords in category_keywords.items():
                if any(kw in content for kw in keywords):
                    category_counts[cat] += 1
                    matched = True
                    break
            if not matched:
                # Default: classify by severity as vuln analysis
                category_counts["vuln"] += 1

        # 2. Classify from tool executions
        try:
            exec_query = (
                select(ToolExecution, Tool)
                .join(Tool, ToolExecution.tool_id == Tool.id)
                .where(ToolExecution.execution_status == 'completed')
            )
            exec_result = await db.execute(exec_query)
            tool_execs = exec_result.all()

            for execution, tool in tool_execs:
                matched = False
                # Match by tool category
                tool_cat = (tool.category or '').lower()
                for cat_prefix, mapped_cat in tool_cat_map.items():
                    if cat_prefix in tool_cat:
                        category_counts[mapped_cat] += 1
                        matched = True
                        break

                if not matched:
                    # Match by tool name / command content
                    tool_content = f"{(tool.name or '')} {(execution.command_executed or '')}".lower()
                    for cat, keywords in category_keywords.items():
                        if any(kw in tool_content for kw in keywords):
                            category_counts[cat] += 1
                            matched = True
                            break
        except Exception as tool_err:
            logger.warning(f"Could not classify tool executions: {tool_err}")

        # 3. Classify from activity logs
        try:
            activity_query = select(ActivityLog).where(ActivityLog.ai_tags.isnot(None))
            activity_result = await db.execute(activity_query)
            activities = activity_result.scalars().all()

            phase_to_category = {
                "reconnaissance": "recon",
                "scanning": "scan",
                "enumeration": "recon",
                "vulnerability_assessment": "vuln",
                "exploitation": "exploit",
                "post_exploitation": "post",
                "credential_access": "credential",
            }

            for activity in activities:
                ai_tags = activity.ai_tags or {}
                attack_phase = (ai_tags.get('attack_phase') or '').lower().replace('-', '_').replace(' ', '_')
                mapped = phase_to_category.get(attack_phase)
                if mapped:
                    category_counts[mapped] += 1
        except Exception as act_err:
            logger.warning(f"Could not classify activity logs: {act_err}")

        # Format for chart - include all categories with counts > 0
        chart_data = []
        labels = []
        for cat in category_labels:
            count = category_counts.get(cat, 0)
            if count > 0:
                labels.append(category_labels[cat])
                chart_data.append(count)

        return {
            "categories": labels,
            "data": chart_data,
            "total": sum(category_counts.values())
        }
    except Exception as e:
        logger.error(f"Error getting attacks by category: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chart-data/tool-executions")
async def get_tool_executions_trend(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """
    Get tool execution trends over time
    """
    try:
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        logger.info(f"Fetching tool executions trend for {days} days")
        
        # Get all tool executions first
        executions_query = select(ToolExecution)
        executions_result = await db.execute(executions_query)
        all_executions = executions_result.scalars().all()
        
        logger.info(f"Total tool executions in database: {len(all_executions)}")
        
        # Filter by date in Python
        executions = []
        for execution in all_executions:
            if execution.created_at:
                if start_date <= execution.created_at <= end_date:
                    executions.append(execution)
            else:
                executions.append(execution)
        
        logger.info(f"Tool executions in date range: {len(executions)}")
        
        # Group by date
        daily_counts = {}
        for execution in executions:
            if execution.created_at:
                date_str = execution.created_at.date().isoformat()
            else:
                date_str = datetime.utcnow().date().isoformat()
            daily_counts[date_str] = daily_counts.get(date_str, 0) + 1
        
        # Build time series
        series_data = []
        current_date = start_date.date()
        while current_date <= end_date.date():
            date_str = current_date.isoformat()
            series_data.append({
                "x": date_str,
                "y": daily_counts.get(date_str, 0)
            })
            current_date += timedelta(days=1)
        
        logger.info(f"Time series data points: {len(series_data)}, with {sum(daily_counts.values())} total executions in range")
        
        # Always return data structure even if empty
        result = {
            "series": [{
                "name": "Tool Executions",
                "data": series_data
            }],
            "total": len(executions),
            "total_all_time": len(all_executions),
            "period": f"{days} days"
        }
        logger.info(f"Returning tool executions trend data: {len(series_data)} data points, {len(executions)} executions in range")
        return result
    except Exception as e:
        logger.error(f"Error getting tool executions trend: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/summary-stats")
async def get_summary_stats(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """
    Get comprehensive summary statistics for dashboard
    Includes KPIs similar to openaev platform
    """
    try:
        # Total projects
        total_projects = await db.execute(select(func.count(Project.id)))
        projects_count = total_projects.scalar() or 0
        
        # Total targets
        total_targets = await db.execute(select(func.count(Target.id)))
        targets_count = total_targets.scalar() or 0
        
        # Total findings (from KnowledgeNode)
        total_findings = await db.execute(
            select(func.count(KnowledgeNode.id)).where(KnowledgeNode.node_type == 'finding')
        )
        findings_count = total_findings.scalar() or 0
        
        # Total tool executions
        total_executions = await db.execute(select(func.count(ToolExecution.id)))
        executions_count = total_executions.scalar() or 0
        
        # Total discovered files
        total_files = await db.execute(select(func.count(DiscoveredFile.id)))
        files_count = total_files.scalar() or 0
        
        # Total discovered users
        total_users = await db.execute(select(func.count(DiscoveredUser.id)))
        discovered_users_count = total_users.scalar() or 0
        
        # Growth metrics (last 24 hours)
        twenty_four_hours_ago = datetime.utcnow() - timedelta(hours=24)
        
        new_projects_24h = await db.execute(
            select(func.count(Project.id)).where(Project.created_at >= twenty_four_hours_ago)
        )
        projects_growth = new_projects_24h.scalar() or 0
        
        new_findings_24h = await db.execute(
            select(func.count(KnowledgeNode.id)).where(
                KnowledgeNode.node_type == 'finding',
                KnowledgeNode.created_at >= twenty_four_hours_ago
            )
        )
        findings_growth = new_findings_24h.scalar() or 0
        
        new_executions_24h = await db.execute(
            select(func.count(ToolExecution.id)).where(
                ToolExecution.created_at >= twenty_four_hours_ago
            )
        )
        executions_growth = new_executions_24h.scalar() or 0
        
        return {
            "projects": {
                "total": projects_count,
                "growth_24h": projects_growth
            },
            "targets": {
                "total": targets_count
            },
            "findings": {
                "total": findings_count,
                "growth_24h": findings_growth
            },
            "tool_executions": {
                "total": executions_count,
                "growth_24h": executions_growth
            },
            "discovered_files": {
                "total": files_count
            },
            "discovered_users": {
                "total": discovered_users_count
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting summary stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/performance-metrics")
async def get_performance_metrics(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """
    Get performance metrics similar to OpenAEV
    Returns: Prevention, Detection, Human Response percentages
    """
    try:
        # Total findings
        total_findings = await db.execute(
            select(func.count(KnowledgeNode.id)).where(KnowledgeNode.node_type == 'finding')
        )
        findings_count = total_findings.scalar() or 0
        
        # Count findings by severity
        findings_query = select(KnowledgeNode).where(KnowledgeNode.node_type == 'finding')
        findings_result = await db.execute(findings_query)
        findings = findings_result.scalars().all()
        
        critical_high = 0
        medium_low = 0
        
        for finding in findings:
            node_data = finding.node_data or {}
            severity = node_data.get('severity', 'info').lower()
            if severity in ['critical', 'high']:
                critical_high += 1
            elif severity in ['medium', 'low']:
                medium_low += 1
        
        # Calculate Prevention (based on findings caught early)
        # Assume prevention = (medium + low) / total * 100
        prevention = (medium_low / findings_count * 100) if findings_count > 0 else 0.0
        
        # Detection (based on critical findings detected)
        # Assume detection = (critical + high detected) / total * 100
        detection = (critical_high / findings_count * 100) if findings_count > 0 else 0.0
        
        # Human Response (based on tool executions / findings ratio)
        total_executions = await db.execute(select(func.count(ToolExecution.id)))
        executions_count = total_executions.scalar() or 0
        
        # Response rate = min(100, (executions / findings) * 100)
        response_rate = min(100.0, (executions_count / max(findings_count, 1)) * 20 * 100)
        
        return {
            "prevention": round(min(100.0, max(0.0, prevention)), 1),
            "detection": round(min(100.0, max(0.0, detection)), 1),
            "human_response": round(min(100.0, max(0.0, response_rate)), 1),
            "total_findings": findings_count,
            "critical_high": critical_high,
            "medium_low": medium_low,
            "tool_executions": executions_count
        }
    except Exception as e:
        logger.error(f"Error getting performance metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/recent-activity")
async def get_recent_activity(
    limit: int = 5,  # Changed default to 5 as requested
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """
    Get recent activity for dashboard timeline
    Shows only the 5 most recent activities
    """
    try:
        # Get recent audit logs - limit to 5 as requested
        query = select(AuditLog).order_by(desc(AuditLog.timestamp)).limit(min(limit, 5))
        result = await db.execute(query)
        logs = result.scalars().all()
        
        activities = []
        for log in logs:
            user_query = select(User).where(User.id == log.user_id) if log.user_id else None
            user = None
            if user_query:
                user_result = await db.execute(user_query)
                user = user_result.scalar_one_or_none()
            
            # AuditLog uses resource_type and resource_id, not entity_type/entity_id
            entity_type = log.resource_type if hasattr(log, 'resource_type') else 'unknown'
            entity_id = log.resource_id if hasattr(log, 'resource_id') else None
            
            activities.append({
                "id": log.id,
                "timestamp": log.timestamp.isoformat() if log.timestamp else "",
                "user": {
                    "id": user.id if user else None,
                    "username": user.username if user else "System"
                },
                "action": log.action,
                "entity_type": entity_type,
                "entity_id": str(entity_id) if entity_id else None,
                "details": log.details if log.details else {},
                "time_ago": _format_time_ago(log.timestamp) if log.timestamp else "unknown"
            })
        
        return {
            "activities": activities,
            "total": len(activities)
        }
    except Exception as e:
        logger.error(f"Error getting recent activity: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/mitre-coverage")
async def get_mitre_coverage(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """
    Get MITRE ATT&CK coverage statistics
    Returns attack techniques grouped by phase with technique IDs
    """
    try:
        from ...models.models import ActivityLog, Tool

        # MITRE ATT&CK technique mapping with IDs and expanded keywords
        technique_mapping = {
            "Initial Access": {
                "keywords": ["phishing", "external", "drive-by", "spearphishing", "exploit public",
                             "supply chain", "trusted relationship", "valid account", "replication"],
                "technique_ids": ["T1566", "T1190", "T1189", "T1195", "T1199", "T1078", "T1091"]
            },
            "Execution": {
                "keywords": ["command", "script", "powershell", "cmd", "bash", "exec", "shell",
                             "injection", "interpreter", "scheduled task", "wmi", "mshta", "rundll"],
                "technique_ids": ["T1059", "T1053", "T1047", "T1170", "T1085", "T1203"]
            },
            "Persistence": {
                "keywords": ["service", "scheduled", "startup", "registry", "boot", "logon",
                             "cron", "implant", "backdoor", "web shell", "account create"],
                "technique_ids": ["T1543", "T1053", "T1547", "T1136", "T1505", "T1098"]
            },
            "Privilege Escalation": {
                "keywords": ["uac", "sudo", "token", "privilege", "escalat", "suid", "setuid",
                             "exploit", "bypass", "impersonat", "elevation", "root", "admin"],
                "technique_ids": ["T1548", "T1134", "T1068", "T1055", "T1574"]
            },
            "Defense Evasion": {
                "keywords": ["obfuscat", "disable", "masquerad", "evasion", "bypass", "encode",
                             "hide", "clear log", "rootkit", "timestomp", "stealth", "antivirus"],
                "technique_ids": ["T1027", "T1562", "T1036", "T1070", "T1140", "T1218"]
            },
            "Credential Access": {
                "keywords": ["password", "hash", "credential", "brute", "keylog", "dump",
                             "crack", "ntlm", "kerberos", "lsass", "mimikatz", "login", "auth"],
                "technique_ids": ["T1110", "T1003", "T1056", "T1558", "T1552", "T1555"]
            },
            "Discovery": {
                "keywords": ["scan", "enum", "recon", "discover", "fingerprint", "port scan",
                             "network scan", "dns", "directory", "subdomain", "nmap", "info gather"],
                "technique_ids": ["T1046", "T1018", "T1082", "T1083", "T1135", "T1016"]
            },
            "Lateral Movement": {
                "keywords": ["remote", "share", "ssh", "rdp", "lateral", "pivot", "psexec",
                             "pass the hash", "wmi remote", "smb", "winrm", "hop"],
                "technique_ids": ["T1021", "T1080", "T1570", "T1563", "T1210"]
            },
            "Collection": {
                "keywords": ["collect", "exfil", "capture", "screen", "clipboard", "archive",
                             "email collect", "database", "sensitive", "data stag"],
                "technique_ids": ["T1560", "T1113", "T1115", "T1119", "T1005"]
            },
            "Command and Control": {
                "keywords": ["c2", "beacon", "callback", "tunnel", "proxy", "dns tunnel",
                             "covert channel", "reverse shell", "bind shell", "listener"],
                "technique_ids": ["T1071", "T1572", "T1573", "T1090", "T1102"]
            }
        }

        severity_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
        phases = {phase: {} for phase in technique_mapping}

        # 1. Map findings from KnowledgeNodes (keyword-based)
        findings_query = select(KnowledgeNode).where(KnowledgeNode.node_type == 'finding')
        findings_result = await db.execute(findings_query)
        findings = findings_result.scalars().all()

        for finding in findings:
            node_data = finding.node_data or {}
            title = (node_data.get('title') or '').lower()
            description = (node_data.get('description') or '').lower()
            content = f"{title} {description}"

            for phase, config in technique_mapping.items():
                if any(kw in content for kw in config["keywords"]):
                    finding_key = f"finding_{finding.id}"
                    if finding_key not in phases[phase]:
                        phases[phase][finding_key] = {
                            "id": finding.id,
                            "title": node_data.get('title', 'Unknown'),
                            "severity": node_data.get('severity', 'info'),
                            "source": "finding"
                        }

        # 2. Enrich from ActivityLog ai_tags (AI-classified MITRE techniques)
        activity_query = select(ActivityLog).where(ActivityLog.ai_tags.isnot(None))
        activity_result = await db.execute(activity_query)
        activities = activity_result.scalars().all()

        # Build reverse map: technique ID prefix -> phase
        technique_to_phase = {}
        for phase, config in technique_mapping.items():
            for tid in config["technique_ids"]:
                technique_to_phase[tid] = phase

        for activity in activities:
            ai_tags = activity.ai_tags or {}
            mitre_techniques = ai_tags.get('mitre_techniques', [])

            for technique_id in mitre_techniques:
                # Match technique ID (e.g., "T1566" or "T1566.001") to phase
                base_id = technique_id.split('.')[0] if '.' in technique_id else technique_id
                matched_phase = technique_to_phase.get(base_id)
                if matched_phase:
                    activity_key = f"activity_{activity.id}_{technique_id}"
                    if activity_key not in phases[matched_phase]:
                        phases[matched_phase][activity_key] = {
                            "id": activity.id,
                            "title": f"{technique_id}: {ai_tags.get('attack_phase', activity.tool_name or 'Activity')}",
                            "severity": "medium" if (activity.confidence or 0) >= 0.7 else "low",
                            "source": "activity_log",
                            "technique_id": technique_id
                        }

        # 3. Enrich from ToolExecutions (tool name + category mapping)
        # Map tool categories and known tool names to MITRE phases
        tool_category_to_phases = {
            "reconnaissance": ["Discovery"],
            "scanning": ["Discovery"],
            "enumeration": ["Discovery"],
            "exploitation": ["Initial Access", "Execution"],
            "post-exploitation": ["Privilege Escalation", "Persistence", "Lateral Movement"],
            "password": ["Credential Access"],
            "credential": ["Credential Access"],
            "wireless": ["Initial Access"],
            "web": ["Initial Access", "Execution"],
            "social engineering": ["Initial Access"],
        }
        tool_name_to_phases = {
            "nmap": ["Discovery"],
            "masscan": ["Discovery"],
            "nikto": ["Discovery"],
            "dirb": ["Discovery"],
            "dirbuster": ["Discovery"],
            "gobuster": ["Discovery"],
            "ffuf": ["Discovery"],
            "wfuzz": ["Discovery"],
            "subfinder": ["Discovery"],
            "amass": ["Discovery"],
            "theHarvester": ["Discovery"],
            "sqlmap": ["Execution", "Initial Access"],
            "burpsuite": ["Discovery", "Execution"],
            "metasploit": ["Execution", "Initial Access", "Privilege Escalation"],
            "msfconsole": ["Execution", "Initial Access", "Privilege Escalation"],
            "hydra": ["Credential Access"],
            "john": ["Credential Access"],
            "hashcat": ["Credential Access"],
            "medusa": ["Credential Access"],
            "crackmapexec": ["Credential Access", "Lateral Movement"],
            "impacket": ["Lateral Movement", "Credential Access"],
            "mimikatz": ["Credential Access"],
            "bloodhound": ["Discovery", "Lateral Movement"],
            "responder": ["Credential Access"],
            "empire": ["Command and Control", "Execution"],
            "cobalt strike": ["Command and Control"],
            "chisel": ["Command and Control"],
            "ligolo": ["Command and Control"],
            "linpeas": ["Discovery", "Privilege Escalation"],
            "winpeas": ["Discovery", "Privilege Escalation"],
            "pspy": ["Discovery"],
        }

        executions_query = (
            select(ToolExecution, Tool)
            .join(Tool, ToolExecution.tool_id == Tool.id)
            .where(ToolExecution.execution_status == 'completed')
        )
        exec_result = await db.execute(executions_query)
        tool_executions = exec_result.all()

        for execution, tool in tool_executions:
            matched_phases = set()

            # Match by tool name
            tool_name_lower = (tool.name or '').lower()
            for known_tool, tool_phases in tool_name_to_phases.items():
                if known_tool.lower() in tool_name_lower:
                    matched_phases.update(tool_phases)

            # Match by tool category
            tool_cat_lower = (tool.category or '').lower()
            for cat, cat_phases in tool_category_to_phases.items():
                if cat in tool_cat_lower:
                    matched_phases.update(cat_phases)

            # Fallback: keyword match on command_executed
            if not matched_phases:
                cmd_lower = (execution.command_executed or '').lower()
                for phase, config in technique_mapping.items():
                    if any(kw in cmd_lower for kw in config["keywords"]):
                        matched_phases.add(phase)

            for phase in matched_phases:
                exec_key = f"tool_exec_{execution.id}_{phase}"
                if exec_key not in phases[phase]:
                    phases[phase][exec_key] = {
                        "id": execution.id,
                        "title": f"{tool.name}: {(execution.command_executed or '')[:60]}",
                        "severity": "info",
                        "source": "tool_execution",
                        "tool_name": tool.name,
                        "tool_category": tool.category
                    }

        # Format for frontend - deduplicate and sort by severity
        coverage_data = []
        for phase, config in technique_mapping.items():
            techniques = list(phases[phase].values())
            techniques.sort(key=lambda t: severity_rank.get(t.get("severity", "info"), 4))
            coverage_data.append({
                "phase": phase,
                "count": len(techniques),
                "technique_ids": config["technique_ids"],
                "techniques": techniques[:5]
            })

        return {
            "phases": coverage_data,
            "total_techniques": sum(len(t) for t in phases.values())
        }
    except Exception as e:
        logger.error(f"Error getting MITRE coverage: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tool-statistics")
async def get_tool_statistics(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """
    Get tool usage statistics
    Returns most used tools and execution trends
    """
    try:
        from ...models.models import Tool
        
        # Get all tool executions grouped by tool
        executions_query = select(
            ToolExecution.tool_id,
            func.count(ToolExecution.id).label('execution_count')
        ).group_by(ToolExecution.tool_id)
        
        executions_result = await db.execute(executions_query)
        execution_stats = executions_result.all()
        
        # Get tool details
        tool_stats = []
        for row in execution_stats:
            # Handle both tuple and row-like objects
            if hasattr(row, 'tool_id'):
                tool_id = row.tool_id
                count = row.execution_count
            elif isinstance(row, tuple) and len(row) >= 2:
                tool_id, count = row[0], row[1]
            else:
                continue
            
            if tool_id:
                tool_query = select(Tool).where(Tool.id == tool_id)
                tool_result = await db.execute(tool_query)
                tool = tool_result.scalar_one_or_none()
                
                if tool:
                    # Get last execution time
                    last_exec_query = select(ToolExecution.created_at).where(
                        ToolExecution.tool_id == tool_id
                    ).order_by(desc(ToolExecution.created_at)).limit(1)
                    last_exec_result = await db.execute(last_exec_query)
                    last_exec_row = last_exec_result.scalar_one_or_none()
                    last_exec = last_exec_row if last_exec_row else None
                    
                    tool_stats.append({
                        "tool_id": tool.id,
                        "tool_name": tool.name,
                        "tool_category": tool.category,
                        "execution_count": int(count) if count else 0,
                        "last_executed": last_exec.isoformat() if last_exec else None
                    })
        
        # Sort by execution count
        tool_stats.sort(key=lambda x: x['execution_count'], reverse=True)
        
        return {
            "tools": tool_stats[:10],  # Top 10
            "total_executions": sum(t['execution_count'] for t in tool_stats),
            "unique_tools": len(tool_stats)
        }
    except Exception as e:
        logger.error(f"Error getting tool statistics: {e}", exc_info=True)
        # Return empty structure instead of raising error
        return {
            "tools": [],
            "total_executions": 0,
            "unique_tools": 0
        }


def _format_time_ago(timestamp: datetime) -> str:
    """Format timestamp as 'X minutes/hours/days ago'"""
    now = datetime.utcnow()
    delta = now - timestamp
    
    if delta.days > 0:
        return f"{delta.days} day{'s' if delta.days != 1 else ''} ago"
    elif delta.seconds >= 3600:
        hours = delta.seconds // 3600
        return f"{hours} hour{'s' if hours != 1 else ''} ago"
    elif delta.seconds >= 60:
        minutes = delta.seconds // 60
        return f"{minutes} minute{'s' if minutes != 1 else ''} ago"
    else:
        return "just now"


