import { useState, useEffect } from 'react'
import './index.css'
import Overview from './tabs/Overview'
import ForecastAnalysis from './tabs/ForecastAnalysis'
import ModelVerification from './tabs/ModelVerification'
import IndiaMap from './tabs/IndiaMap'
import RegionAnalysis from './tabs/RegionAnalysis'
import BustDetection from './tabs/BustDetection'

const TABS = [
  { id: 'overview',      label: '📊 Overview' },
  { id: 'bust',          label: '🔴 Bust Detection' },
  { id: 'analysis',      label: '🔬 Forecast Analysis' },
  { id: 'verification',  label: '✅ Model Verification' },
  { id: 'map',           label: '🗺️ India Map' },
  { id: 'region',        label: '📈 Region / Lead' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('overview')
  const [backendOk, setBackendOk] = useState(null)

  // Shared state for smooth workflow navigation across tabs
  const [targetRegion, setTargetRegion] = useState('Odisha')
  const [targetLeadTime, setTargetLeadTime] = useState(6)
  const [targetCaseId, setTargetCaseId] = useState(null)
  const [autoRun, setAutoRun] = useState(false)

  // Quick health check
  useEffect(() => {
    fetch('/api/regions')
      .then(r => r.ok ? setBackendOk(true) : setBackendOk(false))
      .catch(() => setBackendOk(false))
  }, [])

  const handleNavigateToAnalysis = ({ region, leadTime, caseId, autoAnalyze = true }) => {
    if (region) setTargetRegion(region)
    if (leadTime) setTargetLeadTime(leadTime)
    if (caseId !== undefined) setTargetCaseId(caseId)
    setAutoRun(autoAnalyze)
    setActiveTab('analysis')
  }

  const renderTab = () => {
    switch(activeTab) {
      case 'overview':
        return (
          <Overview
            onNavigate={handleNavigateToAnalysis}
          />
        )
      case 'bust':
        return (
          <BustDetection
            onNavigate={handleNavigateToAnalysis}
          />
        )
      case 'analysis':
        return (
          <ForecastAnalysis
            initialRegion={targetRegion}
            initialLeadTime={targetLeadTime}
            initialCaseId={targetCaseId}
            autoRun={autoRun}
            onResetAutoRun={() => setAutoRun(false)}
            onNavigate={handleNavigateToAnalysis}
          />
        )
      case 'verification':
        return <ModelVerification />
      case 'map':
        return (
          <IndiaMap
            onSelectRegion={(region, leadTime) => handleNavigateToAnalysis({ region, leadTime, autoAnalyze: true })}
          />
        )
      case 'region':
        return <RegionAnalysis />
      default:
        return <Overview onNavigate={handleNavigateToAnalysis} />
    }
  }

  return (
    <div className="app-shell">
      <nav className="top-nav">
        {/* Logo */}
        <a className="nav-logo" href="#" onClick={(e) => { e.preventDefault(); setActiveTab('overview'); }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="14" r="13" stroke="#60a5fa" strokeWidth="1.5"/>
            <path d="M7 18 L11 12 L14 16 L17 10 L21 14" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <circle cx="17" cy="10" r="2.5" fill="#ef4444"/>
          </svg>
          FOREXA
        </a>
        <span className="nav-badge">SIH26079 · Live Demo</span>

        <div className="nav-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`nav-tab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="nav-status">
          <div className={`status-dot ${backendOk === true ? 'online' : ''}`}
            style={backendOk === false ? { background: 'var(--danger)' } : {}} />
          {backendOk === true ? 'Backend connected' : backendOk === false ? 'Backend offline' : 'Connecting…'}
        </div>
      </nav>

      <main className="main-content">
        {backendOk === false && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 18px', marginBottom: 20,
            background: 'var(--danger-dim)', border: '1px solid var(--danger)',
            borderRadius: 'var(--radius-md)', fontSize: '0.875rem', color: 'var(--danger)',
          }}>
            ⚠️ <strong>FastAPI backend is not reachable.</strong> Start it with:
            <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 8px', borderRadius: 4, fontFamily: 'JetBrains Mono', fontSize: '0.8rem', marginLeft: 8 }}>
              python -m uvicorn src.api:app --reload
            </code>
            from the Forexa project root.
          </div>
        )}
        {renderTab()}
      </main>
    </div>
  )
}
