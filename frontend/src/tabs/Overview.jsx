// Overview dashboard tab — shows lead-time summary + high/low-risk demo cases + interactive workflow runner
import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend, ReferenceLine,
} from 'recharts'
import { getOverview, getDemoHighRisk, getDemoLowRisk, getRegions, getCases, getCase } from '../api'

function MetricCard({ title, value, sub, color }) {
  return (
    <div className="card" style={{ borderTop: `3px solid ${color}` }}>
      <div className="card-title">{title}</div>
      <div className="card-value" style={{ color, marginTop: 8, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}

const LEADS = [1,2,3,4,5,6,7,8,9,10]

export default function Overview({ onNavigate }) {
  const [overviews, setOverviews] = useState({})
  const [loading, setLoading] = useState(true)
  const [highRisk, setHighRisk] = useState([])
  const [lowRisk, setLowRisk] = useState([])
  const [demoLoading, setDemoLoading] = useState(true)
  const [regions, setRegions] = useState([])

  // Interactive quick workflow state (Steps 2-4 of user test flow)
  const [selectedLead, setSelectedLead] = useState(6)
  const [selectedRegion, setSelectedRegion] = useState('Odisha')
  const [quickCaseId, setQuickCaseId] = useState(null)
  const [quickDetail, setQuickDetail] = useState(null)
  const [quickLoading, setQuickLoading] = useState(false)

  useEffect(() => {
    // Fetch regions
    getRegions().then(r => setRegions(r))

    // Fetch overview for all lead times
    Promise.all(LEADS.map(lt => getOverview(lt).then(d => ({ lt, ...d }))))
      .then(results => {
        const m = {}
        results.forEach(r => { m[r.lt] = r })
        setOverviews(m)
      })
      .finally(() => setLoading(false))

    Promise.all([getDemoHighRisk(), getDemoLowRisk()])
      .then(([h, l]) => { setHighRisk(h); setLowRisk(l) })
      .finally(() => setDemoLoading(false))
  }, [])

  // When selectedRegion or selectedLead changes in quick workflow explorer, fetch matching case
  useEffect(() => {
    if (!selectedRegion || !selectedLead) return
    setQuickLoading(true)
    getCases(selectedRegion, selectedLead)
      .then(ids => {
        if (ids && ids.length > 0) {
          const cid = ids[0]
          setQuickCaseId(cid)
          return getCase(cid)
        } else {
          setQuickCaseId(null)
          setQuickDetail(null)
          return null
        }
      })
      .then(detail => {
        if (detail) setQuickDetail(detail)
      })
      .finally(() => setQuickLoading(false))
  }, [selectedRegion, selectedLead])

  const chartData = LEADS.map(lt => ({
    day: `D+${lt}`,
    lead_time: lt,
    confidence: overviews[lt] ? +(overviews[lt].mean_confidence * 100).toFixed(1) : null,
    bust_prob:  overviews[lt] ? +(overviews[lt].mean_bust_probability * 100).toFixed(1) : null,
  }))

  const latest = overviews[1] || {}

  const handleLoadDemo = (type) => {
    const caseList = type === 'high' ? highRisk : lowRisk
    if (caseList && caseList.length > 0) {
      const topCase = caseList[0]
      onNavigate({
        caseId: topCase.id,
        region: topCase.region,
        leadTime: topCase.lead_time,
        autoAnalyze: true
      })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="synth-notice">
        ⚠️ All metrics come from the <strong>live FastAPI backend</strong> trained on 2,000 synthetic atmospheric forecast cases.
      </div>

      {/* Workflow Explorer Banner & Quick Navigation */}
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(30,58,138,0.3) 0%, rgba(17,24,39,0.9) 100%)', border: '1px solid var(--accent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: 'var(--accent-light)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
              <span>🎯 SIH Demo Workflow Test</span>
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', marginTop: 4 }}>
              Interactive Forecast & Bust Analysis Explorer
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              Select lead day and region below to preview live confidence & bust probability before running detailed model analysis.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="btn"
              style={{ background: 'var(--danger-dim)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
              onClick={() => handleLoadDemo('high')}
            >
              🔴 Load High-Risk Demo Case
            </button>
            <button
              className="btn"
              style={{ background: 'var(--success-dim)', color: 'var(--success)', border: '1px solid var(--success)' }}
              onClick={() => handleLoadDemo('low')}
            >
              🟢 Load Low-Risk Demo Case
            </button>
          </div>
        </div>

        {/* Step 2 & 3: Select Day & Region */}
        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr auto', gap: 16, alignItems: 'center', background: 'var(--bg-secondary)', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          <div className="ctrl-group">
            <div className="ctrl-label">1. Select Lead Day</div>
            <div className="lead-selector">
              {LEADS.map(d => (
                <button
                  key={d}
                  className={`lead-btn ${selectedLead === d ? 'active' : ''}`}
                  onClick={() => setSelectedLead(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="ctrl-group" style={{ minWidth: 160 }}>
            <div className="ctrl-label">2. Select Region</div>
            <select value={selectedRegion} onChange={e => setSelectedRegion(e.target.value)}>
              {regions.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>

          {/* Step 4: Display confidence and bust probability */}
          <div style={{ paddingLeft: 12, borderLeft: '1px solid var(--border)' }}>
            <div className="ctrl-label">3. Live Regional Preview (Day {selectedLead} · {selectedRegion})</div>
            {quickLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-muted)', height: 36 }}>
                <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Fetching model state…
              </div>
            ) : quickDetail ? (
              <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginTop: 4 }}>
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Z500 ACC: </span>
                  <strong style={{ fontFamily: 'JetBrains Mono', color: quickDetail.z500_acc < 0.4 ? 'var(--danger)' : 'var(--accent-light)' }}>
                    {quickDetail.z500_acc.toFixed(3)}
                  </strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Forecast Error: </span>
                  <strong style={{ fontFamily: 'JetBrains Mono', color: quickDetail.tier2_bust ? 'var(--danger)' : 'var(--text-primary)' }}>
                    {quickDetail.forecast_error.toFixed(2)}
                  </strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Tier Flags: </span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>
                    {quickDetail.tier1_bust ? '⚠️ T1 ' : ''}{quickDetail.tier2_bust ? '⚠️ T2' : (!quickDetail.tier1_bust && !quickDetail.tier2_bust ? '✓ Clear' : '')}
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>No case found for selection</div>
            )}
          </div>

          {/* Step 5: Open detailed analysis */}
          <div>
            <button
              className="btn btn-primary"
              style={{ padding: '10px 20px', fontSize: '0.9rem' }}
              onClick={() => onNavigate({ region: selectedRegion, leadTime: selectedLead, caseId: quickCaseId, autoAnalyze: true })}
            >
              🔬 Open Detailed Analysis →
            </button>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid-4">
        <MetricCard
          title="D+1 Mean Confidence"
          value={loading ? '…' : `${(latest.mean_confidence*100 || 0).toFixed(1)}%`}
          sub="Calibrated model confidence"
          color="var(--chart-teal)"
        />
        <MetricCard
          title="D+1 Bust Probability"
          value={loading ? '…' : `${(latest.mean_bust_probability*100 || 0).toFixed(1)}%`}
          sub="Calibrated bust risk"
          color="var(--danger)"
        />
        <MetricCard
          title="Total Cases"
          value="2,000"
          sub="Synthetic training corpus"
          color="var(--chart-purple)"
        />
        <MetricCard
          title="Regions Monitored"
          value={regions.length || '20'}
          sub="Indian meteorological zones"
          color="var(--chart-orange)"
        />
      </div>

      {/* Lead-time trend chart */}
      <div className="card">
        <div className="section-header">
          <div className="section-title">Forecast Confidence & Bust Probability Degradation by Lead Time</div>
          <div className="section-sub">D+1 through D+10 · Live API values</div>
        </div>
        {loading ? (
          <div className="state-box"><div className="spinner"/><div className="state-title">Loading trends…</div></div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} />
              <Tooltip formatter={(v, n) => [`${v}%`, n === 'confidence' ? 'Mean Confidence' : 'Bust Probability']} />
              <Legend />
              <ReferenceLine y={50} stroke="var(--border-light)" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="confidence" stroke="var(--chart-teal)" strokeWidth={2.5} dot={{ r: 4 }} name="Mean Confidence" />
              <Line type="monotone" dataKey="bust_prob" stroke="var(--danger)" strokeWidth={2.5} dot={{ r: 4 }} name="Bust Probability" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Demo cases tables */}
      <div className="grid-2">
        <DemoTable
          title="🔴 High-Risk Demo Cases"
          data={highRisk}
          loading={demoLoading}
          colorKey="danger"
          onSelect={(c) => onNavigate({ caseId: c.id, region: c.region, leadTime: c.lead_time, autoAnalyze: true })}
        />
        <DemoTable
          title="🟢 Low-Risk Demo Cases"
          data={lowRisk}
          loading={demoLoading}
          colorKey="success"
          onSelect={(c) => onNavigate({ caseId: c.id, region: c.region, leadTime: c.lead_time, autoAnalyze: true })}
        />
      </div>
    </div>
  )
}

function DemoTable({ title, data, loading, colorKey, onSelect }) {
  return (
    <div className="card">
      <div className="section-header">
        <div className="section-title">{title}</div>
        <span className="section-sub">Click row to analyze</span>
      </div>
      {loading ? (
        <div className="state-box"><div className="spinner" /></div>
      ) : data.length === 0 ? (
        <div className="state-box"><div className="state-msg">No data available</div></div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="metric-table">
            <thead>
              <tr><th>Region</th><th>Date</th><th>Lead</th><th>Bust Prob</th><th>Z500 ACC</th><th>Action</th></tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} style={{ cursor: 'pointer' }} onClick={() => onSelect(row)}>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.region}</td>
                  <td style={{ fontFamily: 'JetBrains Mono', fontSize: '0.78rem' }}>{row.forecast_date}</td>
                  <td style={{ fontFamily: 'JetBrains Mono' }}>D+{row.lead_time}</td>
                  <td style={{ color: colorKey === 'danger' ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>
                    {row.calibrated_prob != null ? `${(row.calibrated_prob*100).toFixed(1)}%` : '—'}
                  </td>
                  <td style={{ fontFamily: 'JetBrains Mono', fontSize: '0.78rem' }}>
                    {row.z500_acc != null ? row.z500_acc.toFixed(3) : '—'}
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                      onClick={(e) => { e.stopPropagation(); onSelect(row); }}
                    >
                      Analyze →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
