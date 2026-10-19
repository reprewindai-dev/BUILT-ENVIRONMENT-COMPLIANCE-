import React from 'react';
import { ActorRole, AppNotification } from '../types';
import { NotificationCenter } from './NotificationCenter';
import { 
  Building2, 
  ShieldCheck, 
  FileCheck, 
  Search, 
  QrCode, 
  GraduationCap, 
  Scale, 
  Leaf, 
  Wifi, 
  WifiOff, 
  CheckCircle2,
  Database,
  Globe,
  Award,
  Layers,
  Building,
  Cpu
} from 'lucide-react';

interface NavbarProps {
  activeRole: ActorRole;
  setActiveRole: (role: ActorRole) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOfflineMode: boolean;
  setIsOfflineMode: (val: boolean) => void;
  pendingSyncCount: number;
  notifications: AppNotification[];
  onMarkNotificationRead: (id: string) => void;
  onMarkAllNotificationsRead: () => void;
  onSimulateNotification: () => void;
  onOpenAccountModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeRole,
  setActiveRole,
  activeTab,
  setActiveTab,
  isOfflineMode,
  setIsOfflineMode,
  pendingSyncCount,
  notifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onSimulateNotification,
  onOpenAccountModal
}) => {
  return (
    <header className="sticky top-0 z-50 bg-neutral-950/95 backdrop-blur-md border-b border-neutral-800 text-neutral-100">
      {/* Top Banner: Statutory Authority & Offline State */}
      <div className="bg-neutral-900/90 px-4 py-1 text-xs border-b border-neutral-800/80 flex items-center justify-between">
        <div className="flex items-center gap-3 text-neutral-400">
          <span className="font-semibold text-neutral-200">Republic of Zambia</span>
          <span aria-hidden="true" className="text-neutral-600">·</span>
          <span>ZIA · PACRA Companies &amp; IP · Ministry of Local Government</span>
          <span aria-hidden="true" className="text-neutral-600">·</span>
          <span className="text-emerald-400 flex items-center gap-1 font-mono">
            <CheckCircle2 className="w-3 h-3 inline" />
            ZAPE 3.0 National Sovereign Governance Active
          </span>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsOfflineMode(!isOfflineMode)}
            className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs transition-colors font-mono ${
              isOfflineMode 
                ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60' 
                : 'bg-neutral-800/60 text-neutral-300 hover:text-white'
            }`}
            title="Toggle District Offline-First Field Inspection Simulation"
          >
            {isOfflineMode ? <WifiOff className="w-3 h-3 text-amber-400" /> : <Wifi className="w-3 h-3 text-emerald-400" />}
            <span>{isOfflineMode ? 'District Offline Mode' : 'Connected (Lusaka Center)'}</span>
            {pendingSyncCount > 0 && (
              <span className="bg-amber-500 text-neutral-950 font-bold px-1.5 rounded-full text-[10px]">
                {pendingSyncCount} queued
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Top Bar Contract: 3 Zones */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setActiveTab('overview')}
            className="text-left group flex items-center gap-2.5"
          >
            <div className="w-9 h-9 rounded-lg bg-emerald-700/20 border border-emerald-600/40 flex items-center justify-center text-emerald-400 group-hover:border-emerald-500 transition-colors">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-white group-hover:text-emerald-300 transition-colors">
                ZAPE 3.0
              </span>
              <span className="hidden sm:inline-block text-[11px] text-neutral-400 font-mono ml-2 border-l border-neutral-700 pl-2">
                Governance &amp; IP Trust
              </span>
            </div>
          </button>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden xl:flex items-center gap-1">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'overview' ? 'bg-neutral-800 text-emerald-300' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Platform Map
          </button>
          <button
            onClick={() => setActiveTab('architect')}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
              activeTab === 'architect' ? 'bg-neutral-800 text-emerald-300' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Architect &amp; Firm</span>
          </button>
          <button
            onClick={() => setActiveTab('council')}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
              activeTab === 'council' ? 'bg-neutral-800 text-emerald-300' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" />
            <span>Council Approvals</span>
          </button>
          <button
            onClick={() => setActiveTab('ip_bridge')}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
              activeTab === 'ip_bridge' ? 'bg-purple-950/80 text-purple-200 border border-purple-800/60' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Award className="w-3.5 h-3.5 text-purple-400" />
            <span>PACRA &amp; IP Bridge</span>
          </button>
          <button
            onClick={() => setActiveTab('marketplace')}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
              activeTab === 'marketplace' ? 'bg-emerald-950/80 text-emerald-200 border border-emerald-800/60' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Building className="w-3.5 h-3.5 text-emerald-400" />
            <span>Templates</span>
          </button>
          <button
            onClick={() => setActiveTab('foreign_gateway')}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
              activeTab === 'foreign_gateway' ? 'bg-blue-950/80 text-blue-200 border border-blue-800/60' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-blue-400" />
            <span>Foreign Gateway</span>
          </button>
          <button
            onClick={() => setActiveTab('developer_control')}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
              activeTab === 'developer_control' ? 'bg-orange-950/80 text-orange-200 border border-orange-800/60' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 text-orange-400" />
            <span>Developers</span>
          </button>
          <button
            onClick={() => setActiveTab('site_plaque')}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
              activeTab === 'site_plaque' ? 'bg-neutral-800 text-emerald-300' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>QR Plaque</span>
          </button>
          <button
            onClick={() => setActiveTab('sovereign_commons')}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
              activeTab === 'sovereign_commons' ? 'bg-emerald-500 text-neutral-950 font-bold shadow-md' : 'text-emerald-400 hover:text-emerald-300 bg-emerald-950/60 border border-emerald-700/60'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Sovereign Commons (SFLive)</span>
          </button>
          <button
            onClick={() => setActiveTab('platform_hub')}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
              activeTab === 'platform_hub' ? 'bg-neutral-800 text-emerald-300 font-medium' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Platform Hub</span>
          </button>
          <button
            onClick={() => setActiveTab('ledger')}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
              activeTab === 'ledger' ? 'bg-neutral-800 text-emerald-300' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Ledger</span>
          </button>
        </nav>

        {/* Zone 3: Actor Role Switcher & Action */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 px-2 py-1 rounded-lg">
            <span className="text-[11px] text-neutral-400 font-mono hidden sm:inline">Role:</span>
            <select
              value={activeRole}
              onChange={(e) => {
                const role = e.target.value as ActorRole;
                setActiveRole(role);
                if (role === 'architect') setActiveTab('architect');
                else if (role === 'council') setActiveTab('council');
                else if (role === 'zia_admin') setActiveTab('zia_governance');
                else if (role === 'ip_officer') setActiveTab('ip_bridge');
                else if (role === 'developer') setActiveTab('developer_control');
                else if (role === 'foreign_consultant') setActiveTab('foreign_gateway');
                else if (role === 'public_citizen') setActiveTab('site_plaque');
                else if (role === 'student') setActiveTab('student_logbook');
              }}
              className="bg-transparent text-xs font-medium text-emerald-300 focus:outline-none cursor-pointer"
            >
              <option value="architect" className="bg-neutral-900 text-white">Architect (Arc. Mwansa Phiri)</option>
              <option value="council" className="bg-neutral-900 text-white">Council Officer (Lusaka City)</option>
              <option value="ip_officer" className="bg-neutral-900 text-white">PACRA &amp; IP Officer</option>
              <option value="developer" className="bg-neutral-900 text-white">Developer (Zambezi Sun PLC)</option>
              <option value="foreign_consultant" className="bg-neutral-900 text-white">Foreign Consultant (Dubai/UK)</option>
              <option value="zia_admin" className="bg-neutral-900 text-white">ZIA Registrar General</option>
              <option value="public_citizen" className="bg-neutral-900 text-white">Citizen / Whistleblower</option>
              <option value="student" className="bg-neutral-900 text-white">Student / Graduate (UNZA/CBU)</option>
            </select>
          </div>

          <NotificationCenter
            notifications={notifications}
            onMarkAsRead={onMarkNotificationRead}
            onMarkAllAsRead={onMarkAllNotificationsRead}
            onNavigateAction={setActiveTab}
            onSimulateEvent={onSimulateNotification}
          />

          {onOpenAccountModal && (
            <button
              onClick={onOpenAccountModal}
              className="px-2.5 py-1.5 text-xs font-medium text-emerald-300 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/80 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm whitespace-nowrap"
              title="Backend & Database Account Architecture"
            >
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden lg:inline">Backend DB</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('site_plaque')}
            className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-600 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm whitespace-nowrap"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Verify QR</span>
          </button>
        </div>
      </div>

      {/* Secondary Bar for Mobile & Compact Screens */}
      <div className="xl:hidden border-t border-neutral-800/80 px-4 py-2 flex items-center gap-2 overflow-x-auto text-xs whitespace-nowrap">
        <button onClick={() => setActiveTab('overview')} className={`px-2 py-1 rounded ${activeTab === 'overview' ? 'bg-neutral-800 text-emerald-300' : 'text-neutral-400'}`}>Map</button>
        <button onClick={() => setActiveTab('architect')} className={`px-2 py-1 rounded ${activeTab === 'architect' ? 'bg-neutral-800 text-emerald-300' : 'text-neutral-400'}`}>Architect</button>
        <button onClick={() => setActiveTab('council')} className={`px-2 py-1 rounded ${activeTab === 'council' ? 'bg-neutral-800 text-emerald-300' : 'text-neutral-400'}`}>Council</button>
        <button onClick={() => setActiveTab('ip_bridge')} className={`px-2 py-1 rounded ${activeTab === 'ip_bridge' ? 'bg-purple-900 text-purple-200' : 'text-neutral-400'}`}>PACRA IP</button>
        <button onClick={() => setActiveTab('marketplace')} className={`px-2 py-1 rounded ${activeTab === 'marketplace' ? 'bg-emerald-900 text-emerald-200' : 'text-neutral-400'}`}>Templates</button>
        <button onClick={() => setActiveTab('foreign_gateway')} className={`px-2 py-1 rounded ${activeTab === 'foreign_gateway' ? 'bg-blue-900 text-blue-200' : 'text-neutral-400'}`}>Foreign</button>
        <button onClick={() => setActiveTab('developer_control')} className={`px-2 py-1 rounded ${activeTab === 'developer_control' ? 'bg-orange-900 text-orange-200' : 'text-neutral-400'}`}>Developers</button>
        <button onClick={() => setActiveTab('site_plaque')} className={`px-2 py-1 rounded ${activeTab === 'site_plaque' ? 'bg-neutral-800 text-emerald-300' : 'text-neutral-400'}`}>QR</button>
        <button onClick={() => setActiveTab('platform_hub')} className={`px-2 py-1 rounded ${activeTab === 'platform_hub' ? 'bg-emerald-600 text-white font-bold' : 'text-emerald-400'}`}>Platform Hub</button>
        <button onClick={() => setActiveTab('ledger')} className={`px-2 py-1 rounded ${activeTab === 'ledger' ? 'bg-neutral-800 text-emerald-300' : 'text-neutral-400'}`}>Ledger</button>
      </div>
    </header>
  );
};
