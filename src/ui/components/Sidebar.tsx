import React from 'react';
import {
  RadarIcon,
  ActivityIcon,
  ShieldCheckIcon,
  FileCodeIcon,
  ScaleIcon,
  ShieldLockIcon,
} from '../icons.js';

export type NavSection =
  | 'CONSOLE'
  | 'PIPELINE'
  | 'SCENARIOS'
  | 'EVIDENCE'
  | 'POLICY'
  | 'BINDING';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  status: 'READY' | 'RUNNING' | 'COMPLETED';
  hasResult: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  status,
  hasResult,
}) => {
  const navItems: { id: NavSection; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: 'CONSOLE',
      label: 'Security Console',
      icon: <RadarIcon size={16} />,
      badge: 'MONITOR',
    },
    {
      id: 'PIPELINE',
      label: 'Live Verification',
      icon: <ActivityIcon size={16} />,
      badge: status === 'RUNNING' ? 'ACTIVE' : hasResult ? 'TRACE' : 'STANDBY',
    },
    {
      id: 'SCENARIOS',
      label: 'Transaction Scenarios',
      icon: <ShieldCheckIcon size={16} />,
      badge: '9 LABS',
    },
    {
      id: 'BINDING',
      label: 'Provider Binding',
      icon: <ShieldLockIcon size={16} />,
      badge: 'LEVEL-2',
    },
    {
      id: 'EVIDENCE',
      label: 'Evidence Pipeline',
      icon: <FileCodeIcon size={16} />,
      badge: '4 DOMAINS',
    },
    {
      id: 'POLICY',
      label: 'Policy Engine',
      icon: <ScaleIcon size={16} />,
      badge: '9 RULES',
    },
  ];

  return (
    <aside className="soc-sidebar">
      <div className="soc-sidebar-title">
        <span>SECURITY OPERATIONS</span>
        <div className="sidebar-grid-indicator">
          <span className="dot dot-cyan"></span>
          <span className="dot dot-violet"></span>
          <span className="dot dot-green"></span>
        </div>
      </div>

      <nav className="soc-nav">
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              className={`soc-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectSection(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {item.badge && (
                <span className={`nav-badge badge-${item.badge.toLowerCase().replace(/[^a-z0-9]/g, '')}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Boundary & SOC Architecture Notice Card */}
      <div className="soc-sidebar-footer">
        <div className="soc-boundary-card">
          <div className="boundary-header">
            <span className="boundary-tag">SECURITY BOUNDARY</span>
            <span className="boundary-pulse"></span>
          </div>
          <div className="boundary-details">
            <div className="boundary-item">
              <span className="b-label">CONTROLLED PROXY:</span>
              <span className="b-val text-cyan">EIP-1193</span>
            </div>
            <div className="boundary-item">
              <span className="b-label">CANONICAL SCHEMA:</span>
              <span className="b-val text-violet mono">request.v1</span>
            </div>
            <div className="boundary-item">
              <span className="b-label">BINDING LEVEL:</span>
              <span className="b-val text-emerald">Level-2 Pre-Forward</span>
            </div>
            <div className="boundary-item">
              <span className="b-label">L3 SIGNED PAYLOAD:</span>
              <span className="b-val text-muted">Outside MVP</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
