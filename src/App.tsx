import React, { useState, useEffect } from 'react';
import { ActorRole, Project, Architect, ArchitecturalFirm, SubmissionPassport, AppNotification } from './types';
import { MOCK_ARCHITECTS, MOCK_FIRMS, MOCK_PROJECTS } from './data/mockDatabase';
import { notificationService } from './services/notificationService';
import { Navbar } from './components/Navbar';
import { PlatformOverview } from './components/PlatformOverview';
import { ArchitectDashboard } from './components/ArchitectDashboard';
import { CouncilPortal } from './components/CouncilPortal';
import { ZiaGovernance } from './components/ZiaGovernance';
import { PublicRegistry } from './components/PublicRegistry';
import { SitePlaqueVerifier } from './components/SitePlaqueVerifier';
import { GreenBuildingEngine } from './components/GreenBuildingEngine';
import { StatutoryFeeCalculator } from './components/StatutoryFeeCalculator';
import { BimRuleChecker } from './components/BimRuleChecker';
import { StudentLogbook } from './components/StudentLogbook';
import { AuditLedgerView } from './components/AuditLedgerView';
import { PassportModal } from './components/PassportModal';
import { OfficialSitePlaqueModal } from './components/OfficialSitePlaqueModal';
import { AccountAuthModal } from './components/AccountAuthModal';
import { MicroservicesWorkflowHub } from './components/MicroservicesWorkflowHub';
import { IpPacraBridge } from './components/IpPacraBridge';
import { DesignMarketplace } from './components/DesignMarketplace';
import { ForeignDesignGateway } from './components/ForeignDesignGateway';
import { DeveloperGovernance } from './components/DeveloperGovernance';
import { SovereignCommonsHub } from './components/SovereignCommonsHub';
import { NotificationToastContainer } from './components/NotificationToast';

export default function App() {
  const [activeRole, setActiveRole] = useState<ActorRole>('architect');
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('tab');
      if (p) return p;
    }
    return 'overview';
  });
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(false);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);

  // Core Central State
  const [architects, setArchitects] = useState<Architect[]>(MOCK_ARCHITECTS);
  const [firms, setFirms] = useState<ArchitecturalFirm[]>(MOCK_FIRMS);
  const [projects, setProjects] = useState<Project[]>(MOCK_PROJECTS);

  // Notifications & Real-Time Toasts State
  const [notifications, setNotifications] = useState<AppNotification[]>(() => notificationService.getNotifications());
  const [activeToasts, setActiveToasts] = useState<AppNotification[]>([]);

  // Active Modals
  const [viewingPassport, setViewingPassport] = useState<SubmissionPassport | null>(null);
  const [viewingPlaquePassport, setViewingPlaquePassport] = useState<SubmissionPassport | null>(null);
  const [plaqueVerifyQuery, setPlaqueVerifyQuery] = useState<string>('ZAPE-2026-LCC-0891');
  const [isAccountAuthModalOpen, setIsAccountAuthModalOpen] = useState<boolean>(false);

  // Check URL parameters for direct mobile camera QR scans (e.g. ?verify=ZAPE-2026-LCC-0891)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab');
      if (tabParam) {
        setActiveTab(tabParam);
      }
      const verifyId = urlParams.get('verify') || urlParams.get('passport') || urlParams.get('plaque');
      if (verifyId) {
        setPlaqueVerifyQuery(verifyId);
        setActiveTab('site_plaque');
        notificationService.dispatch({
          eventType: 'COUNCIL_PERMIT_GRANTED',
          priority: 'HIGH',
          targetRole: 'public_citizen',
          title: `Mobile QR Scan Detected: ${verifyId}`,
          message: `Digital verification docket resolved from mobile camera scan for permit ${verifyId}.`,
          projectId: verifyId,
          projectName: verifyId,
          actionTab: 'site_plaque',
          actionLabel: 'View Verified Docket'
        });
      }
    }
  }, []);

  // Subscribe to real-time notification events
  useEffect(() => {
    const unsubscribe = notificationService.subscribe((newNotif) => {
      setNotifications(notificationService.getNotifications());
      // High-priority actions trigger real-time toast alerts
      if (newNotif.priority === 'HIGH') {
        setActiveToasts(prev => [newNotif, ...prev.slice(0, 3)]); // Keep max 4 visible toasts
      }
    });

    return unsubscribe;
  }, []);

  const handleAddProject = (newProject: Project) => {
    setProjects([newProject, ...projects]);
    if (isOfflineMode) {
      setPendingSyncCount(prev => prev + 1);
    }
  };

  const handleUpdateProject = (updatedProject: Project) => {
    setProjects(projects.map(p => p.id === updatedProject.id ? updatedProject : p));
  };

  const handleUpdateArchitect = (updatedArch: Architect) => {
    setArchitects(architects.map(a => a.id === updatedArch.id ? updatedArch : a));
  };

  const handleUpdateFirm = (updatedFirm: ArchitecturalFirm) => {
    setFirms(firms.map(f => f.id === updatedFirm.id ? updatedFirm : f));
  };

  const handleOpenPassport = (passportId: string) => {
    const found = projects.find(p => p.passport?.passportId === passportId);
    if (found && found.passport) {
      setViewingPassport(found.passport);
    }
  };

  const handleOpenSitePlaque = (passport: SubmissionPassport) => {
    setViewingPlaquePassport(passport);
  };

  const handleSimulateScanPlaque = (passportId: string) => {
    setViewingPlaquePassport(null);
    setPlaqueVerifyQuery(passportId);
    setActiveTab('site_plaque');

    notificationService.dispatch({
      eventType: 'COUNCIL_PERMIT_GRANTED',
      priority: 'HIGH',
      targetRole: 'public_citizen',
      title: `QR Decoded: ${passportId}`,
      message: `Verified cryptographic permit record retrieved from national blockchain ledger.`,
      projectId: passportId,
      projectName: passportId,
      actionTab: 'site_plaque',
      actionLabel: 'View Docket'
    });
  };

  const handleDismissToast = (id: string) => {
    setActiveToasts(prev => prev.filter(t => t.id !== id));
  };

  const handleMarkNotificationRead = (id: string) => {
    notificationService.markAsRead(id);
    setNotifications(notificationService.getNotifications());
  };

  const handleMarkAllNotificationsRead = () => {
    notificationService.markAllAsRead();
    setNotifications(notificationService.getNotifications());
  };

  // Simulation test action for high-priority workflow updates
  const handleSimulateNotification = () => {
    const simulationEvents = [
      {
        eventType: 'COUNCIL_PERMIT_GRANTED' as const,
        priority: 'HIGH' as const,
        targetRole: 'architect' as const,
        title: 'Building Permit Granted (LCC/BP/2026/0942)',
        message: 'Lusaka City Council Planning Committee approved Lusaka Clean Energy Hub with zero setback violations.',
        projectName: 'Lusaka Clean Energy Innovation Hub',
        councilId: 'LCC',
        actionTab: 'site_plaque',
        actionLabel: 'View Site Plaque'
      },
      {
        eventType: 'COUNCIL_SUBMITTED' as const,
        priority: 'HIGH' as const,
        targetRole: 'council' as const,
        title: 'High-Rise Architectural Plan Submitted',
        message: 'Arc. Chileshe Mulenga submitted Copperbelt High-Density Commercial Tower with RSA-4096 Biometric Seal.',
        projectName: 'Copperbelt High-Density Commercial Tower',
        councilId: 'KCC',
        actionTab: 'council',
        actionLabel: 'Inspect Docket'
      },
      {
        eventType: 'REMEDIATION_REQUESTED' as const,
        priority: 'HIGH' as const,
        targetRole: 'architect' as const,
        title: 'Statutory Remediation Required: Setback 9.0m',
        message: 'Ndola City Council requested road reserve setback verification report for Ndola Healthcare Clinic.',
        projectName: 'Ndola Metropolitan Healthcare Clinic Wing',
        councilId: 'NCC',
        actionTab: 'architect',
        actionLabel: 'Remediate in Studio'
      },
      {
        eventType: 'IP_HOLD_FREEZE' as const,
        priority: 'HIGH' as const,
        targetRole: 'all' as const,
        title: 'Statutory IP_HOLD Placed on Disputed Submission',
        message: 'ZIA / PACRA Joint Tribunal froze project ZM-TMPL-01 reuse attempt pending copyright hearing.',
        projectName: 'Kabwata Commercial Strips',
        actionTab: 'ip_bridge',
        actionLabel: 'Inspect IP Docket'
      }
    ];

    const chosen = simulationEvents[Math.floor(Math.random() * simulationEvents.length)];
    notificationService.dispatch(chosen);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      {/* Top Bar Contract Navigation */}
      <Navbar
        activeRole={activeRole}
        setActiveRole={setActiveRole}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOfflineMode={isOfflineMode}
        setIsOfflineMode={setIsOfflineMode}
        pendingSyncCount={pendingSyncCount}
        notifications={notifications}
        onMarkNotificationRead={handleMarkNotificationRead}
        onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
        onSimulateNotification={handleSimulateNotification}
        onOpenAccountModal={() => setIsAccountAuthModalOpen(true)}
      />

      {/* Real-time High-Priority Toast Notification Container */}
      <NotificationToastContainer
        toasts={activeToasts}
        onDismiss={handleDismissToast}
        onNavigateAction={(tab) => setActiveTab(tab)}
      />

      {/* Main Viewport Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <PlatformOverview
            onNavigate={(tab) => setActiveTab(tab)}
            projects={projects}
            firms={firms}
            architects={architects}
          />
        )}

        {activeTab === 'architect' && (
          <ArchitectDashboard
            architects={architects}
            firms={firms}
            projects={projects}
            onAddProject={handleAddProject}
            onUpdateProject={handleUpdateProject}
            onViewPassport={handleOpenPassport}
            onViewSitePlaque={handleOpenSitePlaque}
          />
        )}

        {activeTab === 'council' && (
          <CouncilPortal
            projects={projects}
            onUpdateProject={handleUpdateProject}
            onViewPassport={handleOpenPassport}
            onViewSitePlaque={handleOpenSitePlaque}
          />
        )}

        {activeTab === 'ip_bridge' && (
          <IpPacraBridge
            firms={firms}
          />
        )}

        {activeTab === 'marketplace' && (
          <DesignMarketplace
            architects={architects}
          />
        )}

        {activeTab === 'foreign_gateway' && (
          <ForeignDesignGateway
            architects={architects}
          />
        )}

        {activeTab === 'developer_control' && (
          <DeveloperGovernance
            firms={firms}
          />
        )}

        {activeTab === 'zia_governance' && (
          <ZiaGovernance
            architects={architects}
            firms={firms}
            onUpdateArchitect={handleUpdateArchitect}
            onUpdateFirm={handleUpdateFirm}
          />
        )}

        {activeTab === 'public_registry' && (
          <PublicRegistry
            architects={architects}
            firms={firms}
          />
        )}

        {activeTab === 'site_plaque' && (
          <SitePlaqueVerifier
            projects={projects}
            onViewPassport={handleOpenPassport}
            onViewSitePlaque={handleOpenSitePlaque}
            initialQuery={plaqueVerifyQuery}
          />
        )}

        {activeTab === 'green_building' && (
          <GreenBuildingEngine />
        )}

        {activeTab === 'fee_calculator' && (
          <StatutoryFeeCalculator />
        )}

        {activeTab === 'bim_checker' && (
          <BimRuleChecker />
        )}

        {activeTab === 'student_logbook' && (
          <StudentLogbook />
        )}

        {activeTab === 'platform_hub' && (
          <MicroservicesWorkflowHub />
        )}

        {activeTab === 'sovereign_commons' && (
          <SovereignCommonsHub />
        )}

        {activeTab === 'ledger' && (
          <AuditLedgerView />
        )}
      </main>

      {/* Modal for viewing Submission Passport (SLI 2.0 / 3.0) */}
      {viewingPassport && (
        <PassportModal
          passport={viewingPassport}
          onClose={() => setViewingPassport(null)}
          onViewSitePlaque={handleOpenSitePlaque}
        />
      )}

      {/* Official Weatherproof Site Plaque Modal with High-Res Scannable QR Code */}
      {viewingPlaquePassport && (
        <OfficialSitePlaqueModal
          passport={viewingPlaquePassport}
          onClose={() => setViewingPlaquePassport(null)}
          onSimulateScan={handleSimulateScanPlaque}
        />
      )}

      {/* Backend & Database Architecture Account Modal */}
      <AccountAuthModal
        isOpen={isAccountAuthModalOpen}
        onClose={() => setIsAccountAuthModalOpen(false)}
      />

      {/* Footer */}
      <footer className="mt-auto border-t border-neutral-800/80 bg-neutral-950 py-6 text-xs text-neutral-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-neutral-300">ZAPE 3.0</span>
            <span>·</span>
            <span>National Built-Environment Governance, Intellectual Property &amp; Sovereign Trust Platform</span>
          </div>

          <div className="flex items-center gap-4 text-neutral-400 font-mono text-[11px]">
            <span>Republic of Zambia</span>
            <span>·</span>
            <span>ZIA · PACRA · MLG · ZRA · NAPSA Interoperability</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
