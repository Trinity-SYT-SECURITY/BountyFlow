"""
File model for discovered files during penetration testing
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base

class DiscoveredFile(Base):
    __tablename__ = "discovered_files"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    target_id = Column(Integer, ForeignKey("targets.id"), nullable=True)
    
    # File information
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_type = Column(String(50), nullable=False)  # document, image, script, config, etc.
    file_size = Column(Integer, nullable=True)
    file_hash = Column(String(64), nullable=True)  # MD5 or SHA256
    
    # Content information
    content_preview = Column(Text, nullable=True)
    content_analysis = Column(Text, nullable=True)
    
    # Metadata
    discovered_at = Column(DateTime, nullable=False, default=func.now())
    source = Column(String(50), nullable=False, default="manual")  # manual, scan, tool
    severity = Column(String(20), nullable=False, default="info")  # info, low, medium, high, critical
    
    # Additional information
    notes = Column(Text, nullable=True)
    tags = Column(JSON, nullable=True)  # Array of tags
    is_sensitive = Column(String(10), nullable=False, default="false")  # true, false
    
    # Timestamps
    created_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())
    
    # Relationships
    project = relationship("Project", back_populates="discovered_files")
    target = relationship("Target", back_populates="discovered_files")

